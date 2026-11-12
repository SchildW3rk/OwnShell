/**
 * Database Explorer Query Hooks
 *
 * TanStack Query hooks for reading database data.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';

/**
 * Get all stored database connections
 */
export function useDBConnections() {
  return useQuery({
    queryKey: queryKeys.dbExplorer.connections(),
    queryFn: async () => {
      const result = await window.electronAPI.dbConnections.getAll();
      if (!result.success) {
        throw new Error(result.error || 'Failed to load connections');
      }
      return result.connections || [];
    },
  });
}

/**
 * Get a single database connection by ID
 */
export function useDBConnection(id: string | null) {
  return useQuery({
    queryKey: queryKeys.dbExplorer.connection(id ?? ''),
    queryFn: async () => {
      if (!id) return null;
      const result = await window.electronAPI.dbConnections.getById(id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to load connection');
      }
      return result.connection;
    },
    enabled: !!id,
  });
}

/**
 * Get all tables for a connected database
 */
export function useDBTables(connectionId: string | null) {
  return useQuery({
    queryKey: queryKeys.dbExplorer.tables(connectionId ?? ''),
    queryFn: async () => {
      if (!connectionId) return [];
      const result = await window.electronAPI.dbExplorer.tables(connectionId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to load tables');
      }
      return result.tables || [];
    },
    enabled: !!connectionId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Get table schema
 */
export function useDBTableSchema(
  connectionId: string | null,
  tableName: string | null,
  schema?: string
) {
  return useQuery({
    queryKey: queryKeys.dbExplorer.schema(connectionId ?? '', tableName ?? ''),
    queryFn: async () => {
      if (!connectionId || !tableName) return null;
      const result = await window.electronAPI.dbExplorer.schema({
        connectionId,
        tableName,
        schema,
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to load schema');
      }
      return result.schema;
    },
    enabled: !!connectionId && !!tableName,
    staleTime: 5 * 60 * 1000, // 5 minutes (schema rarely changes)
  });
}

/**
 * Get table data with pagination
 */
export function useDBTableData(
  connectionId: string | null,
  tableName: string | null,
  options?: {
    schema?: string;
    page?: number;
    pageSize?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
  }
) {
  const { page = 0, pageSize = 100, schema, orderBy, orderDirection } = options || {};

  return useQuery({
    queryKey: queryKeys.dbExplorer.data(
      connectionId ?? '',
      tableName ?? '',
      page,
      schema,
      orderBy,
      orderDirection
    ),
    queryFn: async () => {
      if (!connectionId || !tableName) {
        return { columns: [], rows: [], rowCount: 0, executionTime: 0 };
      }

      const result = await window.electronAPI.dbExplorer.data({
        connectionId,
        tableName,
        schema,
        limit: pageSize,
        offset: page * pageSize,
        orderBy,
        orderDirection,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to load data');
      }

      return result.result || { columns: [], rows: [], rowCount: 0, executionTime: 0 };
    },
    enabled: !!connectionId && !!tableName,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Get row count for a table
 */
export function useDBRowCount(
  connectionId: string | null,
  tableName: string | null,
  options?: { schema?: string }
) {
  const { schema } = options || {};

  return useQuery({
    queryKey: queryKeys.dbExplorer.rowCount(connectionId ?? '', tableName ?? '', schema),
    queryFn: async () => {
      if (!connectionId || !tableName) return 0;

      const result = await window.electronAPI.dbExplorer.rowCount({
        connectionId,
        tableName,
        schema,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to get row count');
      }

      return result.count || 0;
    },
    enabled: !!connectionId && !!tableName,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Get query history for a connection
 */
export function useDBQueryHistory(connectionId: string | null, limit = 50) {
  return useQuery({
    queryKey: queryKeys.dbExplorer.history(connectionId ?? ''),
    queryFn: async () => {
      if (!connectionId) return [];

      const result = await window.electronAPI.dbExplorer.history({
        connectionId,
        limit,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to load history');
      }

      return result.history || [];
    },
    enabled: !!connectionId,
    staleTime: 10 * 1000, // 10 seconds
  });
}
