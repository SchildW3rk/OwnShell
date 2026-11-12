/**
 * Query execution result
 */
export interface QueryResult {
  /** Column names */
  columns: string[];
  /** Result rows */
  rows: Record<string, unknown>[];
  /** Number of rows returned */
  rowCount: number;
  /** Number of rows affected (for INSERT/UPDATE/DELETE) */
  affectedRows?: number;
  /** Query execution time in milliseconds */
  executionTime: number;
  /** Whether query was truncated due to size limits */
  truncated?: boolean;
  /** Total rows available (before truncation) */
  totalRows?: number;
}

/**
 * Query history entry
 */
export interface QueryHistoryEntry {
  /** Unique identifier */
  id: string;
  /** Connection ID */
  connectionId: string;
  /** SQL query text */
  query: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Number of rows returned/affected */
  rowCount: number;
  /** Whether query was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** When query was executed */
  executedAt: number;
}

/**
 * Primary key value for row identification
 */
export type PrimaryKeyValue = Record<string, unknown>;

/**
 * Row update parameters
 */
export interface RowUpdateParams {
  /** Table name */
  table: string;
  /** Schema name (PostgreSQL) */
  schema?: string;
  /** Primary key values to identify the row */
  primaryKey: PrimaryKeyValue;
  /** Column changes */
  changes: Record<string, unknown>;
}

/**
 * Row insert parameters
 */
export interface RowInsertParams {
  /** Table name */
  table: string;
  /** Schema name (PostgreSQL) */
  schema?: string;
  /** Row data */
  data: Record<string, unknown>;
}

/**
 * Row delete parameters
 */
export interface RowDeleteParams {
  /** Table name */
  table: string;
  /** Schema name (PostgreSQL) */
  schema?: string;
  /** Primary key values to identify the row */
  primaryKey: PrimaryKeyValue;
}
