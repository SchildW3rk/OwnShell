/**
 * Vault IPC Handlers (v1.17.0 Admin Vault & ENV Manager)
 *
 * Handles secure storage and management of credentials, environment variables,
 * and SFTP deployment of .env files. Domain handlers live in ipc/vault/*.
 */

import { Kysely } from 'kysely';
import { Database } from '@ownshell/core';
import { logger } from '../logger';
import { setupVaultCredentialHandlers } from './vault/credentials';
import { setupVaultEnvironmentHandlers } from './vault/environments';

export function setupVaultHandlers(db: Kysely<Database>) {
  setupVaultCredentialHandlers(db);
  setupVaultEnvironmentHandlers(db);

  logger.info('Vault IPC handlers registered successfully');
}
