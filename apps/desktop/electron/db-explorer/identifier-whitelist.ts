import type { TableSchema } from '@ownshell/core';

export function assertKnownTable(tableSchema: TableSchema, tableName: string): void {
  if (tableSchema.name !== tableName || tableSchema.columns.length === 0) {
    throw new Error(`Unknown table: ${tableName}`);
  }
}

export function assertKnownColumns(
  tableSchema: TableSchema,
  columns: Array<string | undefined>,
  label = 'column'
): void {
  const knownColumns = new Set(tableSchema.columns.map((column) => column.name));

  for (const column of columns) {
    if (column && !knownColumns.has(column)) {
      throw new Error(`Unknown ${label}: ${column}`);
    }
  }
}
