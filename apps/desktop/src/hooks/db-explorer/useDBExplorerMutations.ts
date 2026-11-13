/**
 * Database Explorer Mutation Hooks
 *
 * TanStack Query hooks for modifying database data with optimistic updates.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import toast from 'react-hot-toast';
import { i18n } from '../../i18n';

/** Translated text for a failed connect/test (main sends a stable code for known failures). */
export function connectionErrorText(error: string | undefined, code?: string): string {
  const fallback = error || i18n.t('db.connectionFailed');
  return code ? i18n.t(`db.connectionErrors.${code}`, { defaultValue: fallback }) : fallback;
}

// ============================================
// CONNECTION MUTATIONS
// ============================================

/**
 * Create a new database connection
 */
export function useCreateDBConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      type: 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'mongodb';
      // Network database fields (Postgres, MySQL)
      host?: string | null;
      port?: number | null;
      database?: string;
      username?: string;
      password?: string;
      connectionUri?: string;
      connectionMode?: 'local' | 'ssh';
      sshHostId?: string;
      sshTunnelEnabled?: boolean;
      sslEnabled?: boolean;
      sslMode?: 'disabled' | 'require' | 'require-no-verify';
      sslCa?: string;
      readOnly?: boolean;
      authDatabase?: string;
      replicaSet?: string;
      directConnection?: boolean;
      readPreference?: string;
      color?: string;
      // SQLite-specific fields
      filePath?: string;
      isRemote?: boolean;
      remoteHostId?: string;
    }) => {
      const result = await window.electronAPI.dbConnections.create(data as any);
      if (!result.success) {
        throw new Error(result.error || 'Failed to create connection');
      }
      return result.connection;
    },
    onSuccess: () => {
      toast.success(i18n.t('db.connectionCreated'));
      queryClient.invalidateQueries({ queryKey: queryKeys.dbExplorer.connections() });
    },
    onError: (error: Error) => {
      toast.error(`${i18n.t('db.createConnectionFailed')}: ${error.message}`);
    },
  });
}

/**
 * Update a database connection
 */
export function useUpdateDBConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      update,
      silent,
    }: {
      id: string;
      update: {
        name?: string;
        type?: 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'mongodb';
        host?: string;
        port?: number;
        database?: string | null;
        username?: string | null;
        password?: string | null;
        connectionUri?: string | null;
        connectionMode?: 'local' | 'ssh';
        sshHostId?: string | null;
        sshTunnelEnabled?: boolean;
        sslEnabled?: boolean;
        sslMode?: 'disabled' | 'require' | 'require-no-verify';
        sslCa?: string | null;
        sslLegacyHint?: false;
        readOnly?: boolean;
        authDatabase?: string | null;
        replicaSet?: string | null;
        directConnection?: boolean;
        readPreference?: string | null;
        color?: string | null;
      };
      silent?: boolean;
    }) => {
      const result = await window.electronAPI.dbConnections.update(id, update);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update connection');
      }
      return { silent };
    },
    onSuccess: (data) => {
      if (!data?.silent) {
        toast.success(i18n.t('db.connectionUpdated'));
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.dbExplorer.connections() });
    },
    onError: (error: Error, variables) => {
      if (!variables.silent) {
        toast.error(`${i18n.t('db.updateConnectionFailed')}: ${error.message}`);
      }
    },
  });
}

/**
 * Delete a database connection
 */
export function useDeleteDBConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await window.electronAPI.dbConnections.delete(id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete connection');
      }
    },
    onSuccess: () => {
      toast.success(i18n.t('db.connectionDeleted'));
      queryClient.invalidateQueries({ queryKey: queryKeys.dbExplorer.connections() });
    },
    onError: (error: Error) => {
      toast.error(`${i18n.t('db.deleteConnectionFailed')}: ${error.message}`);
    },
  });
}

// ============================================
// LIVE CONNECTION MUTATIONS
// ============================================

/**
 * Connect to a database
 */
export function useConnectDB() {
  return useMutation({
    mutationFn: async (params: { configId: string; sshSessionId?: string; silent?: boolean }) => {
      const result = await window.electronAPI.dbExplorer.connect(params);
      if (!result.success) {
        throw new Error(connectionErrorText(result.error, result.code));
      }
      // Return plain connectionId for backward compatibility when not silent
      // Return object with connectionId when silent (for handleDatabaseSwitch)
      if (params.silent) {
        return { connectionId: result.connectionId, silent: true } as const;
      }
      return result.connectionId as string;
    },
    onSuccess: (data) => {
      // Only show toast if data is a string (non-silent mode)
      if (typeof data === 'string') {
        toast.success(i18n.t('db.connected'));
      }
    },
    onError: (error: Error, variables) => {
      if (!variables.silent) {
        toast.error(`${i18n.t('db.connectionFailed')}: ${error.message}`);
      }
    },
  });
}

/**
 * Disconnect from a database
 */
export function useDisconnectDB() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: string | { connectionId: string; silent?: boolean }) => {
      const connectionId = typeof params === 'string' ? params : params.connectionId;
      const result = await window.electronAPI.dbExplorer.disconnect(connectionId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to disconnect');
      }
      return {
        connectionId,
        silent: typeof params === 'object' ? (params.silent ?? false) : false,
      };
    },
    onSuccess: (data) => {
      if (!data.silent) {
        toast.success(i18n.t('db.disconnected'));
      }
      // Clear cached data for this connection
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey[0] === 'dbExplorer' && query.queryKey[2] === data.connectionId,
      });
    },
    onError: (error: Error, variables) => {
      const silent = typeof variables === 'object' ? (variables.silent ?? false) : false;
      if (!silent) {
        toast.error(`${i18n.t('db.disconnectFailed')}: ${error.message}`);
      }
    },
  });
}

// ============================================
// QUERY EXECUTION
// ============================================

/**
 * Execute a SQL query
 */
export function useExecuteQuery(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: () => connectionId,
    mutationFn: async (sql: string) => {
      if (!connectionId) {
        throw new Error('No connection');
      }
      const result = await window.electronAPI.dbExplorer.query({
        connectionId,
        sql,
      });
      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }
      return result.result;
    },
    onSettled: (_data, _error, _sql, executionConnectionId) => {
      // Failed statements are saved too; refresh the connection that executed them.
      if (executionConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.dbExplorer.history(executionConnectionId),
        });
      }
    },
    onError: (error: Error) => {
      toast.error(`${i18n.t('db.queryFailed')}: ${error.message}`);
    },
  });
}

// ============================================
// ROW OPERATIONS
// ============================================

/**
 * Update a single row with optimistic update
 */
export function useUpdateRow(connectionId: string | null, tableName: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      primaryKey,
      changes,
      schema,
    }: {
      primaryKey: Record<string, unknown>;
      changes: Record<string, unknown>;
      schema?: string;
    }) => {
      if (!connectionId || !tableName) {
        throw new Error('No connection or table');
      }
      const result = await window.electronAPI.dbExplorer.updateRow({
        connectionId,
        tableName,
        schema,
        primaryKey,
        changes,
      });
      if (!result.success) {
        throw new Error(result.error || 'Update failed');
      }
      return result.affectedRows;
    },
    // Optimistic update
    onMutate: async ({ primaryKey, changes }) => {
      if (!connectionId || !tableName) return;

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['dbExplorer', 'data', connectionId, tableName],
      });

      // Snapshot previous value
      const queryKey = queryKeys.dbExplorer.data(connectionId, tableName, 0);
      const previousData = queryClient.getQueryData(queryKey);

      // Optimistically update
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old?.rows) return old;
        return {
          ...old,
          rows: old.rows.map((row: Record<string, unknown>) => {
            // Check if this row matches the primary key
            const matches = Object.entries(primaryKey).every(([key, value]) => row[key] === value);
            if (matches) {
              return { ...row, ...changes };
            }
            return row;
          }),
        };
      });

      return { previousData, queryKey };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.error(`${i18n.t('db.updateFailed')}: ${error.message}`);
    },
    onSuccess: () => {
      toast.success(i18n.t('db.rowUpdated'));
    },
    onSettled: () => {
      // Always refetch after error or success
      if (connectionId && tableName) {
        queryClient.invalidateQueries({
          queryKey: ['dbExplorer', 'data', connectionId, tableName],
        });
      }
    },
  });
}

/**
 * Delete a single row
 */
export function useDeleteRow(connectionId: string | null, tableName: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      primaryKey,
      schema,
    }: {
      primaryKey: Record<string, unknown>;
      schema?: string;
    }) => {
      if (!connectionId || !tableName) {
        throw new Error('No connection or table');
      }
      const result = await window.electronAPI.dbExplorer.deleteRow({
        connectionId,
        tableName,
        schema,
        primaryKey,
      });
      if (!result.success) {
        throw new Error(result.error || 'Delete failed');
      }
      return result.affectedRows;
    },
    // Optimistic update
    onMutate: async ({ primaryKey }) => {
      if (!connectionId || !tableName) return;

      await queryClient.cancelQueries({
        queryKey: ['dbExplorer', 'data', connectionId, tableName],
      });

      const queryKey = queryKeys.dbExplorer.data(connectionId, tableName, 0);
      const previousData = queryClient.getQueryData(queryKey);

      // Optimistically remove the row
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old?.rows) return old;
        return {
          ...old,
          rows: old.rows.filter((row: Record<string, unknown>) => {
            const matches = Object.entries(primaryKey).every(([key, value]) => row[key] === value);
            return !matches;
          }),
          rowCount: (old.rowCount || 0) - 1,
        };
      });

      return { previousData, queryKey };
    },
    onError: (error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.error(`${i18n.t('db.deleteFailed')}: ${error.message}`);
    },
    onSuccess: () => {
      toast.success(i18n.t('db.rowDeleted'));
    },
    onSettled: () => {
      if (connectionId && tableName) {
        queryClient.invalidateQueries({
          queryKey: ['dbExplorer', 'data', connectionId, tableName],
        });
        queryClient.invalidateQueries({
          queryKey: ['dbExplorer', 'rowCount', connectionId, tableName],
        });
      }
    },
  });
}

/**
 * Insert a new row
 */
export function useInsertRow(connectionId: string | null, tableName: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data, schema }: { data: Record<string, unknown>; schema?: string }) => {
      if (!connectionId || !tableName) {
        throw new Error('No connection or table');
      }
      const result = await window.electronAPI.dbExplorer.insertRow({
        connectionId,
        tableName,
        schema,
        data,
      });
      if (!result.success) {
        throw new Error(result.error || 'Insert failed');
      }
      return result.result;
    },
    onSuccess: () => {
      toast.success(i18n.t('db.rowInserted'));
      if (connectionId && tableName) {
        queryClient.invalidateQueries({
          queryKey: ['dbExplorer', 'data', connectionId, tableName],
        });
        queryClient.invalidateQueries({
          queryKey: ['dbExplorer', 'rowCount', connectionId, tableName],
        });
      }
    },
    onError: (error: Error) => {
      toast.error(`${i18n.t('db.insertFailed')}: ${error.message}`);
    },
  });
}

/**
 * Clear query history
 */
export function useClearQueryHistory(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!connectionId) {
        throw new Error('No connection');
      }
      const result = await window.electronAPI.dbExplorer.clearHistory(connectionId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to clear history');
      }
    },
    onSuccess: () => {
      toast.success(i18n.t('db.historyCleared'));
      if (connectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.dbExplorer.history(connectionId),
        });
      }
    },
    onError: (error: Error) => {
      toast.error(`${i18n.t('db.clearHistoryFailed')}: ${error.message}`);
    },
  });
}
