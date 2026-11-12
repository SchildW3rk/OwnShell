/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json' | 'sql';

/**
 * Export options
 */
export interface ExportOptions {
  /** Table to export */
  table: string;
  /** Schema (PostgreSQL) */
  schema?: string;
  /** Export format */
  format: ExportFormat;
  /** Include column headers (CSV) */
  includeHeaders?: boolean;
  /** WHERE clause for filtering */
  whereClause?: string;
  /** Columns to include (empty = all) */
  columns?: string[];
  /** Maximum rows to export */
  limit?: number;
}

/**
 * Export result
 */
export interface ExportResult {
  /** Export data as string */
  data: string;
  /** Number of rows exported */
  rowCount: number;
  /** File size in bytes */
  size: number;
  /** Suggested filename */
  filename: string;
}
