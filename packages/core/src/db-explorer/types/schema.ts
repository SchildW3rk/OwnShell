/**
 * Table/Collection information
 */
export interface TableInfo {
  /** Table name */
  name: string;
  /** Schema name (PostgreSQL) */
  schema?: string;
  /** Estimated row count */
  rowCount?: number;
  /** Type of object */
  type: 'table' | 'view' | 'materialized_view' | 'collection';
  /** Table comment/description */
  comment?: string;
  /** Size in bytes (for MongoDB collections) */
  size?: number;
}

/**
 * Column schema information
 */
export interface ColumnSchema {
  /** Column name */
  name: string;
  /** Data type (e.g., 'varchar(255)', 'integer', 'timestamp') */
  type: string;
  /** Whether column allows NULL */
  nullable: boolean;
  /** Whether column is part of primary key */
  primaryKey: boolean;
  /** Default value expression */
  defaultValue?: string;
  /** Foreign key reference */
  foreignKey?: {
    table: string;
    column: string;
    schema?: string;
  };
  /** Column comment/description */
  comment?: string;
  /** Maximum length (for varchar/char types) */
  maxLength?: number;
  /** Numeric precision */
  precision?: number;
  /** Numeric scale */
  scale?: number;
  /** Auto-increment/serial */
  autoIncrement?: boolean;
}

/**
 * Index information
 */
export interface IndexInfo {
  /** Index name */
  name: string;
  /** Columns included in index */
  columns: string[];
  /** Whether index is unique */
  unique: boolean;
  /** Whether this is the primary key index */
  primary: boolean;
  /** Index type (btree, hash, etc.) */
  type?: string;
}

/**
 * Complete table schema
 */
export interface TableSchema {
  /** Table name */
  name: string;
  /** Schema name (PostgreSQL) */
  schema?: string;
  /** Column definitions */
  columns: ColumnSchema[];
  /** Index definitions */
  indexes: IndexInfo[];
  /** Primary key columns */
  primaryKey: string[];
  /** Estimated row count */
  rowCount?: number;
}
