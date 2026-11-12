/**
 * OAuth 2.0 token cache (encrypted in api_oauth_tokens) and the renderer-facing
 * handlers. The renderer only ever learns whether a token exists and when it expires.
 */

import type { Database } from '@ownshell/core';
import { shell } from 'electron';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import {
  hasPlainAuthSecret,
  obtainAccessToken,
  storedAuthConfig,
  type ResolvedOAuth,
  type TokenStore,
} from '../../http/oauth';
import { ApiRequestError, prepareRequest } from '../../http/prepare-request';
import type { HttpRequestConfig } from '../../http/types';
import { logger } from '../../logger';
import { cryptoManager } from '../../security/crypto';
import { safeHandle } from '../safe-ipc';
import {
  loadCollectionChain,
  loadVariableScopes,
  ownerKey,
  revealAuthSecret,
  type AuthOwner,
} from './request-context';
import { executeRequestSchema, idSchema } from './schemas';

/** Encrypts an auth secret on save (refused while the app is locked). */
export function encryptSecret(value: string): string {
  if (!cryptoManager.isUnlocked()) throw new Error('App is locked - cannot encrypt the auth secret');
  return cryptoManager.encryptData(value);
}

const legacySecretsEncrypted = new WeakSet<Kysely<Database>>();

/**
 * One-time, idempotent: bearer tokens, basic passwords and API keys saved before they were
 * encrypted get encrypted in place. Schema migrations run before unlock, so this runs on the
 * first API client read after unlock instead. Until then nothing leaks: publicAuthConfig hides
 * legacy plain values and sends/backups read them as they are.
 */
export async function encryptLegacyAuthSecrets(db: Kysely<Database>): Promise<void> {
  if (legacySecretsEncrypted.has(db) || !cryptoManager.isUnlocked()) return;
  await db.transaction().execute(async (trx) => {
    const encrypt = (json: string, authType: string) => storedAuthConfig(authType, json, json, encryptSecret);
    for (const row of await trx.selectFrom('api_requests').select(['id', 'auth_type', 'auth_config']).execute()) {
      if (!hasPlainAuthSecret(row.auth_config)) continue;
      await trx
        .updateTable('api_requests')
        .set({ auth_config: encrypt(row.auth_config, row.auth_type) })
        .where('id', '=', row.id)
        .execute();
    }
    for (const row of await trx.selectFrom('api_collections').select(['id', 'auth_type', 'auth_config']).execute()) {
      if (!hasPlainAuthSecret(row.auth_config)) continue;
      await trx
        .updateTable('api_collections')
        .set({ auth_config: encrypt(row.auth_config, row.auth_type) })
        .where('id', '=', row.id)
        .execute();
    }
  });
  legacySecretsEncrypted.add(db);
}

export const authOwnerSchema = z.object({ type: z.enum(['request', 'collection']), id: idSchema });

export function createTokenStore(db: Kysely<Database>): TokenStore & {
  clear(ownerKey: string): Promise<void>;
} {
  return {
    async get(key) {
      if (!cryptoManager.isUnlocked()) return undefined;
      const row = await db.selectFrom('api_oauth_tokens').selectAll().where('owner_key', '=', key).executeTakeFirst();
      if (!row) return undefined;
      try {
        return {
          fingerprint: row.fingerprint,
          accessToken: cryptoManager.decryptData(row.access_token_encrypted),
          refreshToken: row.refresh_token_encrypted ? cryptoManager.decryptData(row.refresh_token_encrypted) : null,
          expiresAt: row.expires_at,
        };
      } catch {
        return undefined;
      }
    },
    async save(key, token) {
      if (!cryptoManager.isUnlocked()) return;
      const values = {
        fingerprint: token.fingerprint,
        access_token_encrypted: cryptoManager.encryptData(token.accessToken),
        refresh_token_encrypted: token.refreshToken ? cryptoManager.encryptData(token.refreshToken) : null,
        expires_at: token.expiresAt,
        updated_at: Date.now(),
      };
      await db
        .insertInto('api_oauth_tokens')
        .values({ owner_key: key, ...values })
        .onConflict((oc) => oc.column('owner_key').doUpdateSet(values))
        .execute();
    },
    async clear(key) {
      await db.deleteFrom('api_oauth_tokens').where('owner_key', '=', key).execute();
    },
  };
}

/**
 * The prepareRequest hook for a send. `requestOwner` owns the request-level auth;
 * inherited auth is cached under its folder. `signal` is the send's Cancel.
 */
export function oauthTokenProvider(
  store: TokenStore,
  requestOwner: AuthOwner | null,
  options: { force?: boolean; openUrl?: (url: string) => Promise<void>; signal?: AbortSignal } = {}
) {
  return async (config: ResolvedOAuth, sourceId: string | undefined): Promise<string | undefined> => {
    const owner = sourceId ? { type: 'collection' as const, id: sourceId } : requestOwner;
    const key = owner ? ownerKey(owner) : undefined;
    return obtainAccessToken(config, { store, ownerKey: key, ...options });
  };
}

async function openInBrowser(url: string): Promise<void> {
  const protocol = new URL(url).protocol;
  if (protocol !== 'http:' && protocol !== 'https:') throw new Error('Only HTTP(S) URLs are allowed');
  await shell.openExternal(url);
}

/** "Get new token": prepares like a send (variables, inheritance) with a forced token request. */
async function fetchNewToken(db: Kysely<Database>, store: TokenStore, config: HttpRequestConfig, owner: AuthOwner) {
  const chain = await loadCollectionChain(db, config.collectionId);
  const revealed = await revealAuthSecret(db, config, chain, owner);
  const { scopes, locked } = await loadVariableScopes(db, config, chain);
  let obtained = false;
  const provider = oauthTokenProvider(store, owner, { force: true, openUrl: openInBrowser });
  await prepareRequest(
    { ...config, authConfig: revealed.authConfig },
    {
      scopes,
      variablesLocked: locked,
      authChain: revealed.chain,
      oauthToken: async (resolved, sourceId) => {
        const token = await provider(resolved, sourceId);
        obtained = true;
        return token;
      },
      // Only the auth matters here; nothing is read or sent.
      loadFile: async () => ({ data: Buffer.alloc(0), name: '', contentType: 'application/octet-stream' }),
    }
  ).catch((error) => {
    // A missing variable in the URL or body does not matter once the token is there.
    if (!obtained) throw error;
  });
  if (!obtained) throw new ApiRequestError('OAUTH_FAILED', 'This request does not use OAuth 2.0', 'not_oauth');
}

export function registerApiOAuthHandlers(db: Kysely<Database>): void {
  const store = createTokenStore(db);

  safeHandle('api:oauth:status', authOwnerSchema, async (_event, owner) => {
    const row = await db
      .selectFrom('api_oauth_tokens')
      .select(['expires_at', 'refresh_token_encrypted'])
      .where('owner_key', '=', ownerKey(owner))
      .executeTakeFirst();
    return { hasToken: !!row, expiresAt: row?.expires_at ?? null, canRefresh: !!row?.refresh_token_encrypted };
  });

  safeHandle('api:oauth:clear-token', authOwnerSchema, async (_event, owner) => {
    await store.clear(ownerKey(owner));
    logger.info('OAuth token cleared', { owner: owner.type });
  });

  safeHandle(
    'api:oauth:get-token',
    z.object({ config: executeRequestSchema, owner: authOwnerSchema }),
    async (_event, { config, owner }) => {
      try {
        await fetchNewToken(db, store, config, owner);
        logger.info('OAuth token obtained', { owner: owner.type });
        return { ok: true as const };
      } catch (error) {
        if (!(error instanceof ApiRequestError)) throw error;
        logger.warn('OAuth token request failed', { code: error.code, detail: error.detail });
        return { ok: false as const, errorCode: error.code, errorDetail: error.detail, errorScopes: error.scopes };
      }
    }
  );
}
