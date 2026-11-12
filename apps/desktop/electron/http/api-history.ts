/**
 * Request history: the last executions per workspace, without bodies, headers or
 * resolved values. The URL is the {{placeholder}} template from the curl placeholder
 * export, passed through redactUrl (no user info or fragment, credential-like query
 * values as placeholders); other literal query values are stored as typed.
 */

import type { Database, HttpMethod } from '@ownshell/core';
import type { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { redactUrl } from './prepare-request';

export const HISTORY_LIMIT = 200;

export interface HistoryEntry {
  requestId: string | null;
  method: HttpMethod;
  templateUrl: string;
  status: number;
  durationMs: number;
  responseSize: number;
}

/** Inserts one execution and keeps only the newest HISTORY_LIMIT rows. */
export async function recordHistory(
  db: Kysely<Database>,
  entry: HistoryEntry,
  limit = HISTORY_LIMIT
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('api_request_history')
      .values({
        id: uuidv4(),
        request_id: entry.requestId,
        method: entry.method,
        url: redactUrl(entry.templateUrl).slice(0, 4096),
        status: entry.status,
        duration_ms: Math.max(0, Math.round(entry.durationMs)),
        response_size: Math.max(0, Math.round(entry.responseSize)),
        created_at: Date.now(),
      })
      .execute();
    const keep = trx
      .selectFrom('api_request_history')
      .select('id')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit);
    await trx.deleteFrom('api_request_history').where('id', 'not in', keep).execute();
  });
}
