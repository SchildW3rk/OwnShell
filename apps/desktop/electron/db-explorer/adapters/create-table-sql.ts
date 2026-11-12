import {
  buildQualifiedSqlIdentifier,
  quoteBacktickIdentifier,
  quoteDoubleIdentifier,
} from '../sql-identifiers';

export type CreateTableDialect = 'postgres' | 'mysql' | 'sqlite';

export interface CreateTableColumn {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable?: boolean;
  primaryKey?: boolean;
  defaultValue?: string | null;
  unique?: boolean;
}

const MAX_IDENTIFIER_LENGTH: Record<CreateTableDialect, number> = {
  postgres: 63,
  mysql: 64,
  sqlite: 1024,
};

// Unquoted defaults: keywords, NOW() where the engine has it, numbers. Everything else is a string.
const KEYWORD_DEFAULTS = new Set(['NULL', 'TRUE', 'FALSE', 'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME']);
const NUMBER_DEFAULT = /^-?\d+(\.\d+)?$/;

function quoteIdentifier(dialect: CreateTableDialect, name: string): string {
  return dialect === 'mysql' ? quoteBacktickIdentifier(name) : quoteDoubleIdentifier(name);
}

function assertIdentifier(dialect: CreateTableDialect, name: string, label: string): void {
  if (!name.trim()) throw new Error(`${label} name cannot be empty`);
  if (name.length > MAX_IDENTIFIER_LENGTH[dialect]) {
    throw new Error(`${label} name cannot exceed ${MAX_IDENTIFIER_LENGTH[dialect]} characters`);
  }
  if (name.includes('\0')) throw new Error(`${label} name is invalid`);
}

function normalizeType(type: string): string {
  const normalized = type.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_ ]*$/.test(normalized)) throw new Error(`Invalid column type: ${type}`);
  return normalized;
}

function positiveInteger(value: number, name: string, min = 1): number {
  if (!Number.isInteger(value) || value < min) throw new Error(`Invalid ${name}`);
  return value;
}

export function defaultLiteral(dialect: CreateTableDialect, value: string): string {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (KEYWORD_DEFAULTS.has(upper) || NUMBER_DEFAULT.test(trimmed)) return upper;
  if (upper === 'NOW()') return dialect === 'sqlite' ? 'CURRENT_TIMESTAMP' : 'NOW()';
  // MySQL treats backslash as an escape character inside literals by default.
  const escaped = dialect === 'mysql' ? value.replace(/\\/g, '\\\\') : value;
  return `'${escaped.replace(/'/g, "''")}'`;
}

function columnDefinition(dialect: CreateTableDialect, column: CreateTableColumn): string {
  assertIdentifier(dialect, column.name, 'Column');
  const type = normalizeType(column.type);
  let definition = `${quoteIdentifier(dialect, column.name)} ${type}`;

  if (column.length && (type === 'VARCHAR' || type === 'CHAR')) {
    definition += `(${positiveInteger(column.length, 'length')})`;
  } else if (column.precision && (type === 'DECIMAL' || type === 'NUMERIC')) {
    const precision = positiveInteger(column.precision, 'precision');
    definition +=
      column.scale !== undefined
        ? `(${precision}, ${positiveInteger(column.scale, 'scale', 0)})`
        : `(${precision})`;
  }

  if (!column.nullable) definition += ' NOT NULL';
  if (column.unique) definition += ' UNIQUE';
  // An empty default field means "no default".
  if (column.defaultValue != null && column.defaultValue.trim() !== '') {
    definition += ` DEFAULT ${defaultLiteral(dialect, column.defaultValue)}`;
  }
  return definition;
}

export function buildCreateTableSql(
  dialect: CreateTableDialect,
  name: string,
  columns: CreateTableColumn[],
  schema?: string
): string {
  assertIdentifier(dialect, name, 'Table');
  if (!columns.length) throw new Error('At least one column is required');

  const definitions = columns.map((column) => columnDefinition(dialect, column));
  const primaryKey = columns
    .filter((column) => column.primaryKey)
    .map((column) => quoteIdentifier(dialect, column.name));
  if (primaryKey.length > 0) definitions.push(`PRIMARY KEY (${primaryKey.join(', ')})`);

  const table =
    dialect === 'postgres'
      ? buildQualifiedSqlIdentifier(name, schema)
      : quoteIdentifier(dialect, name);
  return `CREATE TABLE ${table} (${definitions.join(', ')})`;
}
