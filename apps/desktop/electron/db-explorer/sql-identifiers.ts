export function quoteSqlIdentifier(identifier: string, quoteChar: '"' | '`' = '"'): string {
  return `${quoteChar}${identifier.split(quoteChar).join(quoteChar + quoteChar)}${quoteChar}`;
}

export function quoteDoubleIdentifier(identifier: string): string {
  return quoteSqlIdentifier(identifier, '"');
}

export function quoteBacktickIdentifier(identifier: string): string {
  return quoteSqlIdentifier(identifier, '`');
}

export function buildQualifiedSqlIdentifier(tableName: string, schema?: string): string {
  return schema
    ? `${quoteDoubleIdentifier(schema)}.${quoteDoubleIdentifier(tableName)}`
    : quoteDoubleIdentifier(tableName);
}
