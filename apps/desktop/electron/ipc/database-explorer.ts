/**
 * Database Explorer IPC Handlers
 *
 * Registers database-related IPC handler groups between main and renderer process.
 * Handler naming convention:
 * - db:dbconnections:* - CRUD for stored database connections
 * - dbexplorer:* - Live database operations
 */

import { BrowserWindow } from 'electron';
import { Kysely } from 'kysely';
import {
  Database,
  DBConnectionQueries,
  DBQueryHistoryQueries,
  SettingsQueries,
} from '@ownshell/core';
import { dbConnectionManager } from '../db-explorer/connection-manager';
import { logger } from '../logger';
import { setupDBConnectionHandlers } from './database-explorer/connections';
import { setupDBExplorerCoreHandlers } from './database-explorer/core';
import { setupRedisHandlers } from './database-explorer/redis';
import { setupMongoDBHandlers } from './database-explorer/mongodb';
import { setupDDLHandlers } from './database-explorer/ddl';
import { setupDatabaseImportExportHandlers } from './database-explorer/import-export';

const QUERY_HISTORY_ENABLED_SETTING = 'dbExplorer.queryHistory.enabled';

/**
 * Setup Database Explorer IPC handlers
 */
export function setupDBExplorerHandlers(mainWindow: BrowserWindow, db: Kysely<Database>) {
  const dbConnectionQueries = new DBConnectionQueries(db);
  const queryHistoryQueries = new DBQueryHistoryQueries(db);
  const settingsQueries = new SettingsQueries(db);

  const context = {
    dbConnectionQueries,
    queryHistoryQueries,
    isQueryHistoryEnabled: async (): Promise<boolean> => {
      const setting = await settingsQueries.get(QUERY_HISTORY_ENABLED_SETTING);
      return setting !== 'false';
    },
  };

  dbConnectionManager.setMainWindow(mainWindow);

  logger.info('Setting up Database Explorer IPC handlers');

  setupDBConnectionHandlers(context);
  setupDBExplorerCoreHandlers(context);
  setupRedisHandlers();
  setupMongoDBHandlers();
  setupDDLHandlers();
  setupDatabaseImportExportHandlers(context);

  logger.info('Database Explorer IPC handlers registered');
}

/**
 * Cleanup all database connections (called on app exit)
 */
export async function cleanupAllDBConnections() {
  logger.info('Cleaning up all database connections');
  await dbConnectionManager.disconnectAll();
  logger.info('All database connections cleaned up');
}
