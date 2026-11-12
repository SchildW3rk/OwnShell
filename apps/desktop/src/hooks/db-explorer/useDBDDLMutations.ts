/**
 * Database DDL Mutation Hooks (TanStack Query)
 *
 * Provides React Query mutation hooks for database DDL operations:
 * - useCreateDatabase: Create a new database
 * - useDropDatabase: Drop a database
 * - useListDatabases: List all databases on the server
 * - useCreateSchema: Create a new schema (PostgreSQL)
 * - useDropSchema: Drop a schema (PostgreSQL)
 * - useListSchemas: List all schemas (PostgreSQL)
 * - useCreateTable: Create a new table
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { i18n } from '../../i18n';
import { queryKeys } from '../../lib/queryClient';
import toast from 'react-hot-toast';

export type DatabaseUserAccessLevel = 'login' | 'read' | 'readWrite' | 'admin';

export interface CreateDatabaseUserOptions {
  password: string;
  host?: string;
  database?: string;
  schema?: string;
  accessLevel?: DatabaseUserAccessLevel;
}

/**
 * List all databases on the server
 */
export function useListDatabases(connectionId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dbExplorer.databases(connectionId ?? ''),
    queryFn: async () => {
      if (!connectionId) {
        throw new Error('No connection ID provided');
      }

      const result = await window.electronAPI.dbExplorer.listDatabases(connectionId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to list databases');
      }

      return result.databases || [];
    },
    enabled: !!connectionId && enabled,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Create a new database
 */
export function useCreateDatabase(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { name: string; options?: Record<string, unknown> }) => {
      if (!connectionId) {
        throw new Error('No connection ID provided');
      }

      const result = await window.electronAPI.dbExplorer.createDatabase({
        connectionId,
        name: params.name,
        options: params.options,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create database');
      }

      return params.name;
    },

    onSuccess: (dbName) => {
      toast.success(i18n.t('db.databaseCreated', { name: dbName }));
      // Invalidate databases list
      queryClient.invalidateQueries({
        queryKey: queryKeys.dbExplorer.databases(connectionId ?? ''),
      });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('db.createDatabaseFailed')}: ${error.message}`);
    },
  });
}

/**
 * Create a database user/login
 */
export function useCreateDatabaseUser(connectionId: string | null) {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (params: { username: string; options: CreateDatabaseUserOptions }) => {
      if (!connectionId) {
        throw new Error('No connection ID provided');
      }

      const result = await window.electronAPI.dbExplorer.createUser({
        connectionId,
        username: params.username,
        options: params.options,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create user');
      }

      return params.username;
    },

    onSuccess: (username) => {
      toast.success(
        t('db.userCreated', "User '{{name}}' created successfully", { name: username })
      );
    },

    onError: (error: Error) => {
      toast.error(`${t('db.createUserFailed')}: ${error.message}`);
    },
  });
}

/**
 * Drop a database
 */
export function useDropDatabase(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!connectionId) {
        throw new Error('No connection ID provided');
      }

      const result = await window.electronAPI.dbExplorer.dropDatabase({
        connectionId,
        name,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to drop database');
      }

      return name;
    },

    onSuccess: (dbName) => {
      toast.success(i18n.t('db.databaseDeleted', { name: dbName }));
      // Invalidate databases list
      queryClient.invalidateQueries({
        queryKey: queryKeys.dbExplorer.databases(connectionId ?? ''),
      });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('db.dropDatabaseFailed')}: ${error.message}`);
    },
  });
}

/**
 * List all schemas in the current database (PostgreSQL)
 */
export function useListSchemas(connectionId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dbExplorer.schemas(connectionId ?? ''),
    queryFn: async () => {
      if (!connectionId) {
        throw new Error('No connection ID provided');
      }

      const result = await window.electronAPI.dbExplorer.listSchemas(connectionId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to list schemas');
      }

      return result.schemas || [];
    },
    enabled: !!connectionId && enabled,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Create a new schema (PostgreSQL)
 */
export function useCreateSchema(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { name: string; options?: Record<string, unknown> }) => {
      if (!connectionId) {
        throw new Error('No connection ID provided');
      }

      const result = await window.electronAPI.dbExplorer.createSchema({
        connectionId,
        name: params.name,
        options: params.options,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create schema');
      }

      return params.name;
    },

    onSuccess: (schemaName) => {
      toast.success(i18n.t('db.schemaCreated', { name: schemaName }));
      // Invalidate schemas list and tables (new schema = new tables list)
      if (connectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.dbExplorer.schemas(connectionId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.dbExplorer.tables(connectionId),
        });
      }
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('db.createSchemaFailed')}: ${error.message}`);
    },
  });
}

/**
 * Drop a schema (PostgreSQL)
 */
export function useDropSchema(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { name: string; cascade?: boolean }) => {
      if (!connectionId) {
        throw new Error('No connection ID provided');
      }

      const result = await window.electronAPI.dbExplorer.dropSchema({
        connectionId,
        name: params.name,
        cascade: params.cascade,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to drop schema');
      }

      return params.name;
    },

    onSuccess: (schemaName) => {
      toast.success(i18n.t('db.schemaDeleted', { name: schemaName }));
      // Invalidate schemas list and tables
      if (connectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.dbExplorer.schemas(connectionId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.dbExplorer.tables(connectionId),
        });
      }
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('db.dropSchemaFailed')}: ${error.message}`);
    },
  });
}

/**
 * Create a new table
 */
export function useCreateTable(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
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
    }) => {
      if (!connectionId) {
        throw new Error('No connection ID provided');
      }

      const result = await window.electronAPI.dbExplorer.createTable({
        connectionId,
        name: params.name,
        columns: params.columns,
        schema: params.schema,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create table');
      }

      return params.name;
    },

    onSuccess: (tableName) => {
      toast.success(i18n.t('db.tableCreated', { name: tableName }));
      // Invalidate tables list
      if (connectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.dbExplorer.tables(connectionId),
        });
      }
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('db.createTableFailed')}: ${error.message}`);
    },
  });
}

/**
 * Drop a table
 */
export function useDropTable(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { name: string; schema?: string; cascade?: boolean }) => {
      if (!connectionId) {
        throw new Error('No connection ID provided');
      }

      const result = await window.electronAPI.dbExplorer.dropTable({
        connectionId,
        name: params.name,
        schema: params.schema,
        cascade: params.cascade,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to drop table');
      }

      return params.name;
    },

    onSuccess: (tableName) => {
      toast.success(i18n.t('db.tableDeleted', { name: tableName }));
      // Invalidate tables list
      if (connectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.dbExplorer.tables(connectionId),
        });
      }
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('db.dropTableFailed')}: ${error.message}`);
    },
  });
}
