/**
 * API Client IPC Handlers (v1.18.0)
 *
 * Collection, request, and execution handlers live in focused modules. This
 * file stays as the registration boundary used by the Electron main process.
 */

import type { Database } from '@ownshell/core';
import type { Kysely } from 'kysely';
import { logger } from '../logger';
import { registerApiCollectionHandlers } from './api-client/collections';
import { registerApiCookieHandlers } from './api-client/cookies';
import { registerApiExecutionHandlers } from './api-client/execute';
import { registerApiOAuthHandlers } from './api-client/oauth';
import { registerApiRequestHandlers } from './api-client/requests';
import { registerApiRunnerHandlers } from './api-client/runner';
import { registerApiTransferHandlers } from './api-client/transfer';
import { registerApiWebSocketHandlers } from './api-client/websocket';

export function setupApiClientHandlers(db: Kysely<Database>): void {
  registerApiCollectionHandlers(db);
  registerApiRequestHandlers(db);
  const execution = registerApiExecutionHandlers(db);
  registerApiWebSocketHandlers(db, execution);
  registerApiRunnerHandlers(db, execution);
  registerApiTransferHandlers(db);
  registerApiOAuthHandlers(db);
  registerApiCookieHandlers(db);

  logger.info('API Client IPC handlers registered successfully');
}
