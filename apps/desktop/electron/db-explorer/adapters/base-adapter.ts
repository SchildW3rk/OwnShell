/**
 * Base Database Adapter Interface
 *
 * Defines the contract for database adapters (PostgreSQL, MySQL, Redis, SQLite)
 * Each adapter implements this interface to provide database-specific functionality.
 */

import {
  TableInfo,
  TableSchema,
  ColumnSchema,
  IndexInfo,
  QueryResult,
  PrimaryKeyValue,
  DBType,
} from '@ownshell/core';
import { assertKnownColumns, assertKnownTable } from '../identifier-whitelist';
import { buildQualifiedSqlIdentifier, quoteDoubleIdentifier } from '../sql-identifiers';
import type { CreateDatabaseUserOptions } from './database-user-types';
import type { ConnectionOptions } from 'node:tls';
export type { CreateDatabaseUserOptions, DatabaseUserAccessLevel } from './database-user-types';

/**
 * Connection configuration for adapters
 * Note: host and port are optional for file-based databases (SQLite)
 */
export interface AdapterConnectionConfig {
  host?: string | null;
  port?: number | null;
  database?: string;
  username?: string;
  password?: string;
  /** Node TLS options from buildTlsOptions(); undefined = no SSL */
  ssl?: ConnectionOptions;
  /** MySQL through a tunnel: the original host for SNI and the certificate name check */
  tlsHost?: string;
  /** SQLite-specific: path to database file */
  filePath?: string;
  /** MongoDB-specific: connection URI */
  connectionUri?: string;
  /** MongoDB-specific: auth database */
  authDatabase?: string;
  /** MongoDB-specific: replica set */
  replicaSet?: string;
  /** MongoDB-specific: force direct connection */
  directConnection?: boolean;
  /** MongoDB-specific: read preference */
  readPreference?: string;
}

/**
 * Connection configuration for SQL adapters (PostgreSQL, MySQL)
 * Requires host and port
 */
export interface SQLAdapterConnectionConfig extends Omit<AdapterConnectionConfig, 'host' | 'port'> {
  host: string;
  port: number;
}

/**
 * Base interface for SQL database adapters (PostgreSQL, MySQL)
 */
export interface ISQLAdapter {
  /**
   * Database type identifier
   */
  readonly type: DBType;

  /**
   * Connect to the database
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the database
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * List all tables in the database
   */
  listTables(): Promise<TableInfo[]>;

  /**
   * Get schema information for a table
   * @param tableName - Table name
   * @param schema - Schema name (PostgreSQL only)
   */
  getTableSchema(tableName: string, schema?: string): Promise<TableSchema>;

  /**
   * Execute a raw SQL query
   * @param sql - SQL query string
   * @param params - Query parameters (optional)
   */
  executeQuery(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * Execute a raw SQL query inside a server-enforced read-only transaction
   * (defense in depth behind the read-only SQL guard)
   */
  executeReadOnlyQuery?(sql: string): Promise<QueryResult>;

  /**
   * Get table data with pagination
   * @param tableName - Table name
   * @param options - Pagination and filter options
   */
  getTableData(
    tableName: string,
    options?: {
      schema?: string;
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDirection?: 'ASC' | 'DESC';
    }
  ): Promise<QueryResult>;

  /**
   * Update a single row
   * @param tableName - Table name
   * @param primaryKey - Primary key values
   * @param changes - Column changes
   * @param schema - Schema name (PostgreSQL only)
   */
  updateRow(
    tableName: string,
    primaryKey: PrimaryKeyValue,
    changes: Record<string, unknown>,
    schema?: string
  ): Promise<number>;

  /**
   * Delete a single row
   * @param tableName - Table name
   * @param primaryKey - Primary key values
   * @param schema - Schema name (PostgreSQL only)
   */
  deleteRow(tableName: string, primaryKey: PrimaryKeyValue, schema?: string): Promise<number>;

  /**
   * Insert a new row
   * @param tableName - Table name
   * @param data - Row data
   * @param schema - Schema name (PostgreSQL only)
   */
  insertRow(
    tableName: string,
    data: Record<string, unknown>,
    schema?: string
  ): Promise<QueryResult>;

  /**
   * Get the primary key columns for a table
   * @param tableName - Table name
   * @param schema - Schema name (PostgreSQL only)
   */
  getPrimaryKeyColumns(tableName: string, schema?: string): Promise<string[]>;

  /**
   * Get row count for a table
   * @param tableName - Table name
   * @param schema - Schema name (PostgreSQL only)
   */
  getRowCount(tableName: string, schema?: string): Promise<number>;

  /**
   * Test the connection
   */
  testConnection(): Promise<boolean>;

  // ============================================
  // DDL OPERATIONS (Database Management)
  // ============================================

  /**
   * List all databases on the server
   * @returns Array of database names
   */
  listDatabases?(): Promise<string[]>;

  /**
   * Create a new database
   * @param name - Database name
   * @param options - Database-specific options (encoding, owner, etc.)
   */
  createDatabase?(name: string, options?: Record<string, unknown>): Promise<void>;

  /**
   * Create a database login/user and optionally grant scoped access.
   * Passwords must never be logged by adapter implementations.
   */
  createUser?(username: string, options: CreateDatabaseUserOptions): Promise<void>;

  /**
   * Drop a database
   * @param name - Database name
   */
  dropDatabase?(name: string): Promise<void>;

  /**
   * List all schemas in the current database (PostgreSQL only)
   * @returns Array of schema names
   */
  listSchemas?(): Promise<string[]>;

  /**
   * Create a new schema (PostgreSQL only)
   * @param name - Schema name
   * @param options - Schema options (owner, etc.)
   */
  createSchema?(name: string, options?: Record<string, unknown>): Promise<void>;

  /**
   * Create a new table
   * @param name - Table name
   * @param columns - Column definitions
   * @param schema - Schema name (PostgreSQL only)
   */
  createTable?(
    name: string,
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
    }>,
    schema?: string
  ): Promise<void>;

  /**
   * Drop a table
   * @param name - Table name
   * @param schema - Schema name
   * @param cascade - Drop dependent objects
   */
  dropTable?(name: string, schema?: string, cascade?: boolean): Promise<void>;

  /**
   * Drop a schema (PostgreSQL only)
   * @param name - Schema name
   * @param cascade - Drop all contained objects
   */
  dropSchema?(name: string, cascade?: boolean): Promise<void>;
}

/**
 * Base class with common functionality for SQL adapters
 * Uses SQLAdapterConnectionConfig which requires host/port
 */
export abstract class BaseSQLAdapter implements ISQLAdapter {
  abstract readonly type: DBType;
  protected config: SQLAdapterConnectionConfig;
  protected connected = false;

  constructor(config: SQLAdapterConnectionConfig) {
    this.config = config;
  }

  isConnected(): boolean {
    return this.connected;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract listTables(): Promise<TableInfo[]>;
  abstract getTableSchema(tableName: string, schema?: string): Promise<TableSchema>;
  abstract executeQuery(sql: string, params?: unknown[]): Promise<QueryResult>;
  abstract getPrimaryKeyColumns(tableName: string, schema?: string): Promise<string[]>;
  abstract testConnection(): Promise<boolean>;

  /**
   * Get table data with pagination (common implementation)
   */
  async getTableData(
    tableName: string,
    options: {
      schema?: string;
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDirection?: 'ASC' | 'DESC';
    } = {}
  ): Promise<QueryResult> {
    const { schema, limit = 100, offset = 0, orderBy, orderDirection = 'ASC' } = options;

    const safeLimit = this.normalizeLimit(limit);
    const safeOffset = this.normalizeOffset(offset);
    const safeOrderDirection = this.normalizeOrderDirection(orderDirection);
    const tableSchema = await this.assertKnownTableAndColumns(tableName, schema, [orderBy]);

    // Build qualified table name
    const qualifiedTable = this.buildQualifiedTableName(tableSchema.name, tableSchema.schema);

    // Build query
    let sql = `SELECT * FROM ${qualifiedTable}`;

    if (orderBy) {
      sql += ` ORDER BY ${this.escapeIdentifier(orderBy)} ${safeOrderDirection}`;
    }

    sql += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    return this.executeQuery(sql);
  }

  /**
   * Update a single row (common implementation)
   */
  async updateRow(
    tableName: string,
    primaryKey: PrimaryKeyValue,
    changes: Record<string, unknown>,
    schema?: string
  ): Promise<number> {
    if (Object.keys(changes).length === 0) {
      return 0;
    }

    const tableSchema = await this.assertKnownTableAndColumns(tableName, schema, [
      ...Object.keys(changes),
      ...Object.keys(primaryKey),
    ]);
    const qualifiedTable = this.buildQualifiedTableName(tableSchema.name, tableSchema.schema);

    // Build SET clause
    const setClauses: string[] = [];
    const values: unknown[] = [];

    Object.entries(changes).forEach(([column, value]) => {
      setClauses.push(`${this.escapeIdentifier(column)} = $${values.length + 1}`);
      values.push(value);
    });

    // Build WHERE clause
    const whereClauses: string[] = [];
    Object.entries(primaryKey).forEach(([column, value]) => {
      whereClauses.push(`${this.escapeIdentifier(column)} = $${values.length + 1}`);
      values.push(value);
    });

    const sql = `UPDATE ${qualifiedTable} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;

    const result = await this.executeQuery(sql, values);
    return result.affectedRows ?? 0;
  }

  /**
   * Delete a single row (common implementation)
   */
  async deleteRow(
    tableName: string,
    primaryKey: PrimaryKeyValue,
    schema?: string
  ): Promise<number> {
    const tableSchema = await this.assertKnownTableAndColumns(
      tableName,
      schema,
      Object.keys(primaryKey)
    );
    const qualifiedTable = this.buildQualifiedTableName(tableSchema.name, tableSchema.schema);

    // Build WHERE clause
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    Object.entries(primaryKey).forEach(([column, value]) => {
      whereClauses.push(`${this.escapeIdentifier(column)} = $${values.length + 1}`);
      values.push(value);
    });

    const sql = `DELETE FROM ${qualifiedTable} WHERE ${whereClauses.join(' AND ')}`;

    const result = await this.executeQuery(sql, values);
    return result.affectedRows ?? 0;
  }

  /**
   * Insert a new row (common implementation)
   */
  async insertRow(
    tableName: string,
    data: Record<string, unknown>,
    schema?: string
  ): Promise<QueryResult> {
    const tableSchema = await this.assertKnownTableAndColumns(tableName, schema, Object.keys(data));
    const qualifiedTable = this.buildQualifiedTableName(tableSchema.name, tableSchema.schema);

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`);

    const escapedColumns = columns.map((column) => this.escapeIdentifier(column)).join(', ');
    const sql = `INSERT INTO ${qualifiedTable} (${escapedColumns}) VALUES (${placeholders.join(', ')}) RETURNING *`;

    return this.executeQuery(sql, values);
  }

  /**
   * Get row count (common implementation)
   */
  async getRowCount(tableName: string, schema?: string): Promise<number> {
    const tableSchema = await this.assertKnownTableAndColumns(tableName, schema);
    const qualifiedTable = this.buildQualifiedTableName(tableSchema.name, tableSchema.schema);

    const sql = `SELECT COUNT(*) as count FROM ${qualifiedTable}`;

    const result = await this.executeQuery(sql);
    return Number(result.rows[0]?.count ?? 0);
  }

  /**
   * Helper: Escape identifier for SQL
   */
  protected escapeIdentifier(identifier: string): string {
    return quoteDoubleIdentifier(identifier);
  }

  protected buildQualifiedTableName(tableName: string, schema?: string): string {
    return buildQualifiedSqlIdentifier(tableName, schema);
  }

  protected async assertKnownTableAndColumns(
    tableName: string,
    schema?: string,
    columns: Array<string | undefined> = []
  ): Promise<TableSchema> {
    const tableSchema = await this.getTableSchema(tableName, schema);
    assertKnownTable(tableSchema, tableName);
    assertKnownColumns(tableSchema, columns);
    return tableSchema;
  }

  protected normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit)) return 100;
    return Math.min(Math.max(Math.floor(limit), 1), 1000);
  }

  protected normalizeOffset(offset: number): number {
    if (!Number.isFinite(offset)) return 0;
    return Math.max(Math.floor(offset), 0);
  }

  protected normalizeOrderDirection(orderDirection: string): 'ASC' | 'DESC' {
    return orderDirection === 'DESC' ? 'DESC' : 'ASC';
  }

  /**
   * Helper: Build WHERE clause from primary key
   */
  protected buildPrimaryKeyWhere(
    primaryKey: PrimaryKeyValue,
    startIndex = 1
  ): { clause: string; values: unknown[] } {
    const conditions: string[] = [];
    const values: unknown[] = [];

    Object.entries(primaryKey).forEach(([column, value], index) => {
      conditions.push(`${this.escapeIdentifier(column)} = $${startIndex + index}`);
      values.push(value);
    });

    return {
      clause: conditions.join(' AND '),
      values,
    };
  }
}

export * from './redis-adapter-types';
export * from './mongodb-adapter-types';

// Re-export types for convenience
export type { TableInfo, TableSchema, ColumnSchema, IndexInfo, QueryResult, PrimaryKeyValue };
