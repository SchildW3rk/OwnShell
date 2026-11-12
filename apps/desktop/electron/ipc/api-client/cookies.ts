/**
 * The workspace cookie jar: one jar for all requests, values encrypted at rest.
 * The renderer can list (without values), delete and clear cookies.
 */

import type { Database } from '@ownshell/core';
import type { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { candidateDomains, cookieHeaderFor, parseSetCookie, type JarCookie } from '../../http/cookie-jar';
import type { CookieJarAccess } from '../../http/http-client';
import { logger } from '../../logger';
import { cryptoManager } from '../../security/crypto';
import { safeHandle } from '../safe-ipc';
import { idSchema, noPayloadSchema } from './schemas';

export const MAX_COOKIES_PER_DOMAIN = 50;
export const MAX_COOKIES = 3000;

/** While the app is locked the jar is neither read nor written. */
export function createCookieJar(db: Kysely<Database>, now: () => number = Date.now): CookieJarAccess {
  return {
    async header(url) {
      if (!cryptoManager.isUnlocked()) return undefined;
      // Only rows that can match this host are read and decrypted.
      const rows = await db.selectFrom('api_cookies').selectAll().where('domain', 'in', candidateDomains(url)).execute();
      const cookies: JarCookie[] = [];
      for (const row of rows) {
        try {
          cookies.push({
            name: row.name,
            value: cryptoManager.decryptData(row.value_encrypted),
            domain: row.domain,
            path: row.path,
            hostOnly: row.host_only === 1,
            secure: row.secure === 1,
            expiresAt: row.expires_at,
          });
        } catch {
          // Undecryptable (e.g. after a recovery): skipped.
        }
      }
      return cookieHeaderFor(cookies, url, now());
    },
    async store(url, setCookies) {
      if (!cryptoManager.isUnlocked()) return;
      const time = now();
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom('api_cookies').where('expires_at', '<=', time).execute();
        const touched = new Set<string>();
        for (const header of setCookies) {
          const cookie = parseSetCookie(header, url, time);
          if (!cookie) continue;
          touched.add(cookie.domain);
          await trx
            .deleteFrom('api_cookies')
            .where('domain', '=', cookie.domain)
            .where('path', '=', cookie.path)
            .where('name', '=', cookie.name)
            .execute();
          // An expiry in the past is how a server deletes a cookie.
          if (cookie.expiresAt !== null && cookie.expiresAt <= time) continue;
          await trx
            .insertInto('api_cookies')
            .values({
              id: uuidv4(),
              domain: cookie.domain,
              path: cookie.path,
              name: cookie.name,
              value_encrypted: cryptoManager.encryptData(cookie.value),
              host_only: cookie.hostOnly ? 1 : 0,
              secure: cookie.secure ? 1 : 0,
              expires_at: cookie.expiresAt,
              created_at: time,
            })
            .execute();
        }
        // Over a limit: the oldest cookies go first.
        for (const domain of touched) {
          await trx
            .deleteFrom('api_cookies')
            .where('domain', '=', domain)
            .where('id', 'not in', (qb) =>
              qb
                .selectFrom('api_cookies')
                .select('id')
                .where('domain', '=', domain)
                .orderBy('created_at', 'desc')
                .limit(MAX_COOKIES_PER_DOMAIN)
            )
            .execute();
        }
        if (touched.size) {
          await trx
            .deleteFrom('api_cookies')
            .where('id', 'not in', (qb) =>
              qb.selectFrom('api_cookies').select('id').orderBy('created_at', 'desc').limit(MAX_COOKIES)
            )
            .execute();
        }
      });
    },
  };
}

export function registerApiCookieHandlers(db: Kysely<Database>): void {
  safeHandle('api:cookies:list', noPayloadSchema, async () => {
    // shortcut: session cookies (no expiry) are kept until deleted, unlike a browser session; add a per-launch purge if that confuses users.
    await db.deleteFrom('api_cookies').where('expires_at', '<=', Date.now()).execute();
    return db
      .selectFrom('api_cookies')
      .select(['id', 'domain', 'path', 'name', 'host_only', 'secure', 'expires_at'])
      .orderBy('domain')
      .orderBy('path')
      .orderBy('name')
      .execute();
  });
  safeHandle('api:cookies:delete', idSchema, async (_event, id) => {
    await db.deleteFrom('api_cookies').where('id', '=', id).execute();
  });
  safeHandle('api:cookies:clear', noPayloadSchema, async () => {
    await db.deleteFrom('api_cookies').execute();
    logger.info('API cookie jar cleared');
  });
}
