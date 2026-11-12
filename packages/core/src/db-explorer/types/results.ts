import type { QueryResult } from './query';
import type { TableInfo, TableSchema } from './schema';

/**
 * Generic DB Explorer result
 */
export interface DBExplorerResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

/**
 * Connection result
 */
export interface DBConnectResult {
  success: boolean;
  connectionId?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Tables list result
 */
export interface DBTablesResult {
  success: boolean;
  tables?: TableInfo[];
  error?: string;
}

/**
 * Table schema result
 */
export interface DBSchemaResult {
  success: boolean;
  schema?: TableSchema;
  error?: string;
}

/**
 * Query execution result
 */
export interface DBQueryResult {
  success: boolean;
  result?: QueryResult;
  error?: string;
  errorCode?: string;
}

/**
 * Row operation result
 */
export interface DBRowResult {
  success: boolean;
  affectedRows?: number;
  error?: string;
}
