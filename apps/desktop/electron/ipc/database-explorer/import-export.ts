import { dialog } from 'electron';
import { DBType } from '@ownshell/core';
import { dbConnectionManager } from '../../db-explorer/connection-manager';
import { databaseDumpService } from '../../db-explorer/dump-service';
import { readOnlyFailure } from '../../db-explorer/read-only-guard';
import { resolveSslMode } from '../../db-explorer/connection/tls-options';
import { cryptoManager } from '../../security/crypto';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { exportDatabaseSchema, importDatabaseSchema, dbTypeSchema } from '../schemas/database-explorer';
import { DBExplorerHandlerContext } from './context';

export function setupDatabaseImportExportHandlers(ctx: DBExplorerHandlerContext) {
  const { dbConnectionQueries } = ctx;
  // ============================================
  // DATABASE EXPORT/IMPORT
  // ============================================

  /**
   * Build a dump-service compatible config from a stored database connection.
   * Used by both export and import handlers to avoid duplication.
   */
  async function buildDumpConfig(configId: string) {
    const config = await dbConnectionQueries.getById(configId);
    if (!config) return null;

    let password: string | undefined;
    if (config.password_encrypted) {
      password = cryptoManager.decryptData(config.password_encrypted);
    }

    return {
      stored: config,
      dbConfig: {
        id: config.id,
        name: config.name,
        type: config.type as DBType,
        host: config.host,
        port: config.port,
        database: config.database || undefined,
        username: config.username || undefined,
        password,
        connectionMode: config.connection_mode as 'local' | 'ssh',
        sshHostId: config.ssh_host_id,
        sshTunnelEnabled: config.ssh_tunnel_enabled === 1,
        ssl: config.ssl_enabled === 1,
        sslMode: resolveSslMode(config),
        sslCa: config.ssl_ca_encrypted ? cryptoManager.decryptData(config.ssl_ca_encrypted) : undefined,
        executionMode: (config.execution_mode as 'direct' | 'docker') || 'direct',
        dockerContainer: config.docker_container || undefined,
      },
    };
  }

  /**
   * Export database to local file
   */
  safeHandle(
    'dbexplorer:export',
    exportDatabaseSchema,
    async (
      event,
      params: {
        connectionId: string;
        configId: string;
        operationId?: string;
        compress: boolean;
        tables?: string[];
        schemaOnly?: boolean;
        dataOnly?: boolean;
        // pg_dump specific options
        clean?: boolean;
        noOwner?: boolean;
        create?: boolean;
      }
    ) => {
      try {
        const dumpConfig = await buildDumpConfig(params.configId);
        if (!dumpConfig) {
          return { success: false, error: 'Database configuration not found' };
        }

        const { stored: config, dbConfig } = dumpConfig;

        // Show save dialog
        const extension = params.compress ? '.sql.gz' : '.sql';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const defaultName = `${config.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}${extension}`;

        const result = await dialog.showSaveDialog({
          title: 'Export Database',
          defaultPath: defaultName,
          filters: params.compress
            ? [{ name: 'Compressed SQL', extensions: ['sql.gz', 'gz'] }]
            : [{ name: 'SQL Files', extensions: ['sql'] }],
        });

        if (result.canceled || !result.filePath) {
          return { success: false, error: 'Export cancelled' };
        }

        // Start export with progress events
        const exportResult = await databaseDumpService.exportDatabase(
          {
            connectionId: params.connectionId,
            config: dbConfig,
            outputPath: result.filePath,
            compress: params.compress,
            tables: params.tables,
            schemaOnly: params.schemaOnly,
            dataOnly: params.dataOnly,
            clean: params.clean,
            noOwner: params.noOwner,
            create: params.create,
          },
          (progress) => {
            // Send progress to renderer
            event.sender.send('dbexplorer:export-progress', {
              ...progress,
              operationId: params.operationId,
              connectionId: params.connectionId,
            });
          }
        );

        return exportResult;
      } catch (error) {
        logger.error('Failed to export database', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to export database',
        };
      }
    }
  );

  /**
   * Import database from local file
   */
  safeHandle(
    'dbexplorer:import',
    importDatabaseSchema,
    async (
      event,
      params: {
        connectionId: string;
        configId: string;
        operationId?: string;
        clearMode?: 'none' | 'truncate' | 'drop';
      }
    ) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const dumpConfig = await buildDumpConfig(params.configId);
        if (!dumpConfig) {
          return { success: false, error: 'Database configuration not found' };
        }

        const { dbConfig } = dumpConfig;

        // Show open dialog
        const result = await dialog.showOpenDialog({
          title: 'Import Database',
          filters: [
            { name: 'SQL Files', extensions: ['sql', 'sql.gz', 'gz'] },
            { name: 'All Files', extensions: ['*'] },
          ],
          properties: ['openFile'],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: 'Import cancelled' };
        }

        const inputPath = result.filePaths[0];
        const compressed = inputPath.endsWith('.gz');

        // Start import with progress events
        const importResult = await databaseDumpService.importDatabase(
          {
            connectionId: params.connectionId,
            config: dbConfig,
            inputPath,
            compressed,
            clearMode: params.clearMode,
          },
          (progress) => {
            // Send progress to renderer
            event.sender.send('dbexplorer:import-progress', {
              ...progress,
              operationId: params.operationId,
              connectionId: params.connectionId,
            });
          }
        );

        return importResult;
      } catch (error) {
        logger.error('Failed to import database', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to import database',
        };
      }
    }
  );

  /**
   * Check if local tools are available for export/import
   */
  safeHandle('dbexplorer:check-tools', dbTypeSchema, async (_event, params) => {
    try {
      const result = await databaseDumpService.checkLocalTools(params.dbType);
      return { success: true, ...result };
    } catch (error) {
      logger.error('Failed to check tools', params, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check tools',
      };
    }
  });

}
