import { v4 as uuidv4 } from 'uuid';
import { dbConnectionManager } from '../../db-explorer/connection-manager';
import { readOnlyFailure, shouldBlockReadOnlySql } from '../../db-explorer/read-only-guard';
import { resolveSslMode } from '../../db-explorer/connection/tls-options';
import { redactQueryHistoryText } from '../../db-explorer/query-redaction';
import { cryptoManager } from '../../security/crypto';
import { dbErrorCodes, logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { idSchema, noPayloadSchema, dbExplorerConnectSchema, tableTargetSchema, tableDataSchema, querySchema, updateRowSchema, deleteRowSchema, insertRowSchema, rowCountSchema, historySchema } from '../schemas/database-explorer';
import { DBExplorerHandlerContext } from './context';

export function setupDBExplorerCoreHandlers(ctx: DBExplorerHandlerContext) {
  const { dbConnectionQueries, queryHistoryQueries, isQueryHistoryEnabled } = ctx;
  // ============================================
  // LIVE DATABASE OPERATIONS
  // ============================================

  /**
   * Connect to a database
   */
  safeHandle(
    'dbexplorer:connect',
    dbExplorerConnectSchema,
    async (_event, params: { configId: string; sshSessionId?: string }) => {
      try {
        logger.info('Database connection requested', {
          configId: params.configId,
          sshSessionId: params.sshSessionId,
        });

        // Get stored connection config
        const stored = await dbConnectionQueries.getById(params.configId);
        if (!stored) {
          return { success: false, error: 'Connection configuration not found' };
        }

        // Decrypt password
        const password = stored.password_encrypted
          ? cryptoManager.decryptData(stored.password_encrypted)
          : undefined;

        // Build connection config with all database-specific fields
        const config: any = {
          id: stored.id,
          name: stored.name,
          type: stored.type as 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'mongodb',
          host: stored.host,
          port: stored.port,
          database: stored.database || undefined,
          username: stored.username || undefined,
          password,
          connectionUri: stored.connection_uri || undefined,
          authDatabase: stored.auth_database || undefined,
          replicaSet: stored.replica_set || undefined,
          directConnection: stored.direct_connection === 1,
          readPreference: stored.read_preference || undefined,
          connectionMode: (stored.connection_mode || 'local') as 'local' | 'ssh',
          sshHostId: stored.ssh_host_id || undefined,
          sshTunnelEnabled: stored.ssh_tunnel_enabled === 1,
          ssl: stored.ssl_enabled === 1,
          sslMode: resolveSslMode(stored),
          sslCa: stored.ssl_ca_encrypted
            ? cryptoManager.decryptData(stored.ssl_ca_encrypted)
            : undefined,
          readOnly: stored.read_only === 1,
          executionMode: (stored.execution_mode || 'direct') as 'direct' | 'docker',
          dockerContainer: stored.docker_container || undefined,
        };

        // Add SQLite-specific fields
        if (stored.type === 'sqlite') {
          config.filePath = stored.file_path;
          config.isRemote = stored.is_remote === 1;
          config.remoteHostId = stored.remote_host_id || undefined;
          config.localCachePath = (stored as any).local_cache_path || undefined;
        }

        // Connect
        const connectionId = await dbConnectionManager.connect(config, params.sshSessionId);

        return { success: true, connectionId };
      } catch (error) {
        logger.error('Database connection failed', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection failed',
        };
      }
    }
  );

  /**
   * Disconnect from a database
   */
  safeHandle('dbexplorer:disconnect', idSchema, async (_event, connectionId) => {
    try {
      await dbConnectionManager.disconnect(connectionId);
      return { success: true };
    } catch (error) {
      logger.error('Database disconnect failed', { connectionId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Disconnect failed',
      };
    }
  });

  /**
   * Get connection status
   */
  safeHandle('dbexplorer:status', idSchema, async (_event, connectionId) => {
    const state = dbConnectionManager.getConnectionState(connectionId);
    return { success: true, state };
  });

  /**
   * Get all active connections
   */
  safeHandle('dbexplorer:connections', noPayloadSchema, async () => {
    const connections = dbConnectionManager.getAllConnections();
    return { success: true, connections };
  });

  /**
   * List tables in the database
   */
  safeHandle('dbexplorer:tables', idSchema, async (_event, connectionId) => {
    try {
      const adapter = dbConnectionManager.getAdapter(connectionId);
      const tables = await adapter.listTables();
      return { success: true, tables };
    } catch (error) {
      logger.error('Failed to list tables', { connectionId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list tables',
      };
    }
  });

  /**
   * Get table schema
   */
  safeHandle(
    'dbexplorer:schema',
    tableTargetSchema,
    async (_event, params: { connectionId: string; tableName: string; schema?: string }) => {
      try {
        const adapter = dbConnectionManager.getAdapter(params.connectionId);
        const tableSchema = await adapter.getTableSchema(params.tableName, params.schema);
        return { success: true, schema: tableSchema };
      } catch (error) {
        logger.error('Failed to get table schema', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get schema',
        };
      }
    }
  );

  /**
   * Get table data with pagination
   */
  safeHandle(
    'dbexplorer:data',
    tableDataSchema,
    async (
      _event,
      params: {
        connectionId: string;
        tableName: string;
        schema?: string;
        limit?: number;
        offset?: number;
        orderBy?: string;
        orderDirection?: 'ASC' | 'DESC';
      }
    ) => {
      try {
        const adapter = dbConnectionManager.getAdapter(params.connectionId);
        const result = await adapter.getTableData(params.tableName, {
          schema: params.schema,
          limit: params.limit,
          offset: params.offset,
          orderBy: params.orderBy,
          orderDirection: params.orderDirection,
        });
        return { success: true, result };
      } catch (error) {
        logger.error('Failed to get table data', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get data',
        };
      }
    }
  );

  /**
   * Execute a raw SQL query
   */
  safeHandle(
    'dbexplorer:query',
    querySchema,
    async (_event, params: { connectionId: string; sql: string }) => {
      const startTime = Date.now();

      try {
        const adapter = dbConnectionManager.getAdapter(params.connectionId);
        const readOnly = dbConnectionManager.isReadOnly(params.connectionId);
        if (readOnly && shouldBlockReadOnlySql(params.sql)) {
          logger.warn('Blocked query on read-only database connection', {
            connectionId: params.connectionId,
          });
          return readOnlyFailure();
        }

        const result =
          readOnly && adapter.executeReadOnlyQuery
            ? await adapter.executeReadOnlyQuery(params.sql)
            : await adapter.executeQuery(params.sql);

        // Get config ID for history
        const state = dbConnectionManager.getConnectionState(params.connectionId);
        const configId = state?.configId;

        const historyQuery = redactQueryHistoryText(params.sql);

        // Save to query history unless explicitly disabled in settings.
        if (configId && (await isQueryHistoryEnabled())) {
          await queryHistoryQueries.add({
            id: uuidv4(),
            connection_id: configId,
            query: historyQuery,
            execution_time: result.executionTime,
            row_count: result.rowCount,
            success: 1,
            error: null,
            executed_at: Date.now(),
          });
        }

        return { success: true, result };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Query failed';
        const historyQuery = redactQueryHistoryText(params.sql);
        const historyError = redactQueryHistoryText(errorMessage);

        // Get config ID for history
        const state = dbConnectionManager.getConnectionState(params.connectionId);
        const configId = state?.configId;

        // Save failed query to history unless explicitly disabled in settings.
        if (configId && (await isQueryHistoryEnabled())) {
          await queryHistoryQueries.add({
            id: uuidv4(),
            connection_id: configId,
            query: historyQuery,
            execution_time: executionTime,
            row_count: 0,
            success: 0,
            error: historyError,
            executed_at: Date.now(),
          });
        }

        logger.error('Query execution failed', { connectionId: params.connectionId, ...dbErrorCodes(error) });
        return { success: false, error: errorMessage };
      }
    }
  );

  /**
   * Update a single row
   */
  safeHandle(
    'dbexplorer:update-row',
    updateRowSchema,
    async (
      _event,
      params: {
        connectionId: string;
        tableName: string;
        schema?: string;
        primaryKey: Record<string, unknown>;
        changes: Record<string, unknown>;
      }
    ) => {
      try {
        dbConnectionManager.assertWritable(params.connectionId);
        const adapter = dbConnectionManager.getAdapter(params.connectionId);
        const affectedRows = await adapter.updateRow(
          params.tableName,
          params.primaryKey,
          params.changes,
          params.schema
        );
        return { success: true, affectedRows };
      } catch (error) {
        logger.error('Failed to update row', { connectionId: params.connectionId, ...dbErrorCodes(error) });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Update failed',
        };
      }
    }
  );

  /**
   * Delete a single row
   */
  safeHandle(
    'dbexplorer:delete-row',
    deleteRowSchema,
    async (
      _event,
      params: {
        connectionId: string;
        tableName: string;
        schema?: string;
        primaryKey: Record<string, unknown>;
      }
    ) => {
      try {
        dbConnectionManager.assertWritable(params.connectionId);
        const adapter = dbConnectionManager.getAdapter(params.connectionId);
        const affectedRows = await adapter.deleteRow(
          params.tableName,
          params.primaryKey,
          params.schema
        );
        return { success: true, affectedRows };
      } catch (error) {
        logger.error('Failed to delete row', { connectionId: params.connectionId, ...dbErrorCodes(error) });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Delete failed',
        };
      }
    }
  );

  /**
   * Insert a new row
   */
  safeHandle(
    'dbexplorer:insert-row',
    insertRowSchema,
    async (
      _event,
      params: {
        connectionId: string;
        tableName: string;
        schema?: string;
        data: Record<string, unknown>;
      }
    ) => {
      try {
        dbConnectionManager.assertWritable(params.connectionId);
        const adapter = dbConnectionManager.getAdapter(params.connectionId);
        const result = await adapter.insertRow(params.tableName, params.data, params.schema);
        return { success: true, result };
      } catch (error) {
        logger.error('Failed to insert row', { connectionId: params.connectionId, ...dbErrorCodes(error) });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Insert failed',
        };
      }
    }
  );

  /**
   * Get row count for a table
   */
  safeHandle(
    'dbexplorer:row-count',
    rowCountSchema,
    async (
      _event,
      params: { connectionId: string; tableName: string; schema?: string }
    ) => {
      try {
        const adapter = dbConnectionManager.getAdapter(params.connectionId);
        const count = await adapter.getRowCount(params.tableName, params.schema);
        return { success: true, count };
      } catch (error) {
        logger.error('Failed to get row count', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Count failed',
        };
      }
    }
  );


  // ============================================
  // QUERY HISTORY
  // ============================================

  /**
   * Get query history for a connection
   */
  safeHandle(
    'dbexplorer:history',
    historySchema,
    async (_event, params: { connectionId: string; limit?: number }) => {
      try {
        // Get config ID from connection state
        const state = dbConnectionManager.getConnectionState(params.connectionId);
        const configId = state?.configId;

        if (!configId) {
          return { success: true, history: [] };
        }

        const history = await queryHistoryQueries.getByConnection(configId, params.limit || 100);
        return { success: true, history };
      } catch (error) {
        logger.error('Failed to get query history', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get history',
        };
      }
    }
  );

  /**
   * Clear query history for a connection
   */
  safeHandle('dbexplorer:history:clear', idSchema, async (_event, connectionId) => {
    try {
      // Get config ID from connection state
      const state = dbConnectionManager.getConnectionState(connectionId);
      const configId = state?.configId;

      if (!configId) {
        return { success: true };
      }

      await queryHistoryQueries.clearForConnection(configId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear query history', { connectionId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear history',
      };
    }
  });


}
