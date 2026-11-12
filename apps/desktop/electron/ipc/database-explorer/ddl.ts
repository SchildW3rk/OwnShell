import { dbConnectionManager } from '../../db-explorer/connection-manager';
import { readOnlyFailure } from '../../db-explorer/read-only-guard';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import {
  connectionOnlySchema,
  createDatabaseUserSchema,
  createTableSchema,
  ddlDropNamedObjectSchema,
  ddlNamedObjectSchema,
  dropTableSchema,
} from '../schemas/database-explorer';

export function setupDDLHandlers() {
  // ============================================
  // DDL OPERATIONS (Database Management)
  // ============================================

  /**
   * List all databases on the server
   */
  safeHandle('dbexplorer:list-databases', connectionOnlySchema, async (_event, params) => {
    try {
      logger.info('Listing databases', params);

      const adapter = dbConnectionManager.getAdapter(params.connectionId);

      if (!adapter.listDatabases) {
        return {
          success: false,
          error: 'This database type does not support listing databases',
        };
      }

      const databases = await adapter.listDatabases();

      return { success: true, databases };
    } catch (error) {
      logger.error('Failed to list databases', params, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list databases',
      };
    }
  });

  /**
   * Create a new database
   */
  safeHandle(
    'dbexplorer:create-database',
    ddlNamedObjectSchema,
    async (
      _event,
      params: { connectionId: string; name: string; options?: Record<string, unknown> }
    ) => {
      try {
        logger.info('Creating database', params);
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getAdapter(params.connectionId);

        if (!adapter.createDatabase) {
          return {
            success: false,
            error: 'This database type does not support creating databases',
          };
        }

        await adapter.createDatabase(params.name, params.options);

        logger.info('Database created successfully', { name: params.name });

        return { success: true };
      } catch (error) {
        logger.error('Failed to create database', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create database',
        };
      }
    }
  );

  /**
   * Create a database user/login
   */
  safeHandle(
    'dbexplorer:create-user',
    createDatabaseUserSchema,
    async (
      _event,
      params: {
        connectionId: string;
        username: string;
        options: {
          password: string;
          host?: string;
          database?: string;
          schema?: string;
          accessLevel?: 'login' | 'read' | 'readWrite' | 'admin';
        };
      }
    ) => {
      const logParams = {
        connectionId: params.connectionId,
        username: params.username,
        host: params.options.host,
        database: params.options.database,
        schema: params.options.schema,
        accessLevel: params.options.accessLevel,
      };

      try {
        logger.info('Creating database user', logParams);
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const connectionType = dbConnectionManager.getConnectionType(params.connectionId);
        const adapter =
          connectionType === 'mongodb'
            ? dbConnectionManager.getMongoDBAdapter(params.connectionId)
            : connectionType === 'redis'
              ? dbConnectionManager.getRedisAdapter(params.connectionId)
              : dbConnectionManager.getAdapter(params.connectionId);

        if (!adapter.createUser) {
          return {
            success: false,
            error: 'This database type does not support creating users',
          };
        }

        await adapter.createUser(params.username, params.options);

        logger.info('Database user created successfully', logParams);

        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to create database user';
        logger.error('Failed to create database user', {
          ...logParams,
          error: errorMessage,
        });
        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  );

  /**
   * Drop a database
   */
  safeHandle(
    'dbexplorer:drop-database',
    ddlDropNamedObjectSchema,
    async (_event, params: { connectionId: string; name: string }) => {
      try {
        logger.info('Dropping database', params);
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getAdapter(params.connectionId);

        if (!adapter.dropDatabase) {
          return {
            success: false,
            error: 'This database type does not support dropping databases',
          };
        }

        await adapter.dropDatabase(params.name);

        logger.info('Database dropped successfully', { name: params.name });

        return { success: true };
      } catch (error) {
        logger.error('Failed to drop database', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to drop database',
        };
      }
    }
  );

  /**
   * List all schemas in the current database (PostgreSQL)
   */
  safeHandle('dbexplorer:list-schemas', connectionOnlySchema, async (_event, params) => {
    try {
      logger.info('Listing schemas', params);

      const adapter = dbConnectionManager.getAdapter(params.connectionId);

      if (!adapter.listSchemas) {
        return {
          success: false,
          error: 'This database type does not support schemas',
        };
      }

      const schemas = await adapter.listSchemas();

      return { success: true, schemas };
    } catch (error) {
      logger.error('Failed to list schemas', params, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list schemas',
      };
    }
  });

  /**
   * Create a new schema (PostgreSQL)
   */
  safeHandle(
    'dbexplorer:create-schema',
    ddlNamedObjectSchema,
    async (
      _event,
      params: { connectionId: string; name: string; options?: Record<string, unknown> }
    ) => {
      try {
        logger.info('Creating schema', params);
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getAdapter(params.connectionId);

        if (!adapter.createSchema) {
          return {
            success: false,
            error: 'This database type does not support schemas',
          };
        }

        await adapter.createSchema(params.name, params.options);

        logger.info('Schema created successfully', { name: params.name });

        return { success: true };
      } catch (error) {
        logger.error('Failed to create schema', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create schema',
        };
      }
    }
  );

  /**
   * Drop a schema (PostgreSQL)
   */
  safeHandle(
    'dbexplorer:drop-schema',
    ddlDropNamedObjectSchema,
    async (_event, params: { connectionId: string; name: string; cascade?: boolean }) => {
      try {
        logger.info('Dropping schema', params);
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getAdapter(params.connectionId);

        if (!adapter.dropSchema) {
          return {
            success: false,
            error: 'This database type does not support schemas',
          };
        }

        await adapter.dropSchema(params.name, params.cascade);

        logger.info('Schema dropped successfully', { name: params.name });

        return { success: true };
      } catch (error) {
        logger.error('Failed to drop schema', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to drop schema',
        };
      }
    }
  );

  /**
   * Create a new table
   */
  safeHandle(
    'dbexplorer:create-table',
    createTableSchema,
    async (
      _event,
      params: {
        connectionId: string;
        name: string;
        columns: Array<{
          name: string;
          type: string;
          length?: number;
          precision?: number;
          scale?: number;
          nullable?: boolean;
          primaryKey?: boolean;
          defaultValue?: string | null;
          unique?: boolean;
        }>;
        schema?: string;
      }
    ) => {
      try {
        logger.info('Creating table', params);
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getAdapter(params.connectionId);

        if (!adapter.createTable) {
          return {
            success: false,
            error: 'This database type does not support table creation',
          };
        }

        await adapter.createTable(params.name, params.columns, params.schema);

        logger.info('Table created successfully', { name: params.name, schema: params.schema });

        return { success: true };
      } catch (error) {
        logger.error('Failed to create table', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create table',
        };
      }
    }
  );

  /**
   * Drop a table
   */
  safeHandle(
    'dbexplorer:drop-table',
    dropTableSchema,
    async (
      _event,
      params: {
        connectionId: string;
        name: string;
        schema?: string;
        cascade?: boolean;
      }
    ) => {
      try {
        logger.info('Dropping table', params);
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getAdapter(params.connectionId);

        if (!adapter.dropTable) {
          return {
            success: false,
            error: 'This database type does not support dropping tables',
          };
        }

        await adapter.dropTable(params.name, params.schema, params.cascade);

        logger.info('Table dropped successfully', { name: params.name, schema: params.schema });

        return { success: true };
      } catch (error) {
        logger.error('Failed to drop table', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to drop table',
        };
      }
    }
  );
}
