/**
 * SFTP Standalone IPC Handlers (v1.16.0)
 *
 * Root registration for standalone SFTP connections and bulk transfers.
 */

import type { BrowserWindow } from 'electron';
import type { Kysely } from 'kysely';
import { Database, HostQueries, KeyQueries } from '@ownshell/core';
import { bulkTransferEngine } from '../sftp/bulk-transfer-engine';
import { sftpConnectionManager } from '../sftp/sftp-connection-manager';
import { logger } from '../logger';
import { initHostKeyStore } from '../ssh/host-key-store';
import { registerSFTPConnectionHandlers } from './sftp-standalone/connection';
import { registerSFTPDialogHandlers } from './sftp-standalone/dialogs';
import { registerSFTPFileOperationHandlers } from './sftp-standalone/file-operations';
import { registerSFTPTransferHandlers } from './sftp-standalone/transfers';

/**
 * Setup SFTP Standalone IPC handlers.
 */
export function setupSFTPStandaloneHandlers(mainWindow: BrowserWindow, db: Kysely<Database>) {
  const hostQueries = new HostQueries(db);
  const keyQueries = new KeyQueries(db);
  initHostKeyStore(hostQueries);

  logger.info('Setting up SFTP Standalone IPC handlers');

  sftpConnectionManager.setup(
    async (id) => {
      const host = await hostQueries.getById(id);
      if (!host) return null;
      return {
        id: host.id,
        label: host.label,
        hostname: host.hostname,
        port: host.port,
        username: host.username,
        auth_type: host.auth_type as 'password' | 'key',
        password_encrypted: host.password_encrypted,
        key_id: host.key_id,
        jump_host_id: host.jump_host_id,
      };
    },
    async (id) => {
      const key = await keyQueries.getById(id);
      if (!key) return null;
      return {
        private_key_encrypted: key.private_key_encrypted,
        passphrase_encrypted: key.passphrase_encrypted,
      };
    }
  );

  bulkTransferEngine.setup(db, mainWindow);

  registerSFTPConnectionHandlers();
  registerSFTPFileOperationHandlers();
  registerSFTPTransferHandlers();
  registerSFTPDialogHandlers();

  logger.info('SFTP Standalone IPC handlers registered');
}
