/**
 * MySQL Database Adapter
 *
 * Implements the ISQLAdapter interface for MySQL databases.
 * Uses the 'mysql2' library for database connections.
 */

import { connect as netConnect } from 'node:net';
import { Pool, PoolConnection, RowDataPacket, ResultSetHeader, createPool } from 'mysql2/promise';
import {
  BaseSQLAdapter,
  CreateDatabaseUserOptions,
  DatabaseUserAccessLevel,
  SQLAdapterConnectionConfig,
  TableInfo,
  TableSchema,
  QueryResult,
} from './base-adapter';
import { DBType, ColumnSchema, IndexInfo } from '@ownshell/core';
import { dbErrorCodes, logger } from '../../logger';
import { assertKnownColumns, assertKnownTable } from '../identifier-whitelist';
import { quoteBacktickIdentifier } from '../sql-identifiers';
import { buildCreateTableSql, type CreateTableColumn } from './create-table-sql';

/**
 * MySQL Adapter
 */
export class MySQLAdapter extends BaseSQLAdapter {
  readonly type: DBType = 'mysql';
  private pool: Pool | null = null;
  private connection: PoolConnection | null = null;

  constructor(config: SQLAdapterConnectionConfig) {
    super(config);
  }

  /**
   * Connect to MySQL database
   */
  async connect(): Promise<void> {
    if (this.connected && this.pool) {
      return;
    }

    try {
      logger.info('Connecting to MySQL', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
      });

      const { ssl, tlsHost } = this.config;
      this.pool = createPool({
        // Through a tunnel mysql2 must see the original host: it derives SNI and the
        // certificate name check from `host`, while the socket goes to the tunnel.
        host: ssl && tlsHost ? tlsHost : this.config.host,
        port: this.config.port,
        ...(ssl && tlsHost
          ? { stream: () => netConnect(this.config.port, this.config.host) }
          : {}),
        database: this.config.database || undefined,
        user: this.config.username || '',
        password: this.config.password || '', // mysql2 requires string, not undefined
        ssl: ssl
          ? {
              ca: ssl.ca as string | undefined,
              rejectUnauthorized: ssl.rejectUnauthorized !== false,
              verifyIdentity: ssl.rejectUnauthorized !== false,
            }
          : undefined,
        connectionLimit: 5,
        connectTimeout: 10000,
        waitForConnections: true,
        queueLimit: 0,
      });

      // Test connection
      this.connection = await this.pool.getConnection();
      await this.connection.query('SELECT 1');

      this.connected = true;
      logger.info('MySQL connected successfully');
    } catch (error) {
      this.connected = false;
      logger.error('MySQL connection failed', error);
      throw error;
    }
  }

  /**
   * Disconnect from MySQL database
   */
  async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        this.connection.release();
        this.connection = null;
      }

      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }

      this.connected = false;
      logger.info('MySQL disconnected');
    } catch (error) {
      logger.error('MySQL disconnect error', error);
      throw error;
    }
  }

  /**
   * Test the connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.pool) {
        return false;
      }
      const [rows] = await this.pool.query<RowDataPacket[]>('SELECT 1 as test');
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * List all tables in the database
   */
  async listTables(): Promise<TableInfo[]> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }

    const database = this.config.database;
    if (!database) {
      throw new Error('No database selected');
    }

    const query = `
      SELECT 
        TABLE_NAME as name,
        TABLE_TYPE as table_type,
        TABLE_ROWS as row_count,
        TABLE_COMMENT as comment
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `;

    const [rows] = await this.pool.query<RowDataPacket[]>(query, [database]);

    return rows.map((row) => ({
      name: row.name,
      rowCount: Number(row.row_count) || undefined,
      type: row.table_type === 'VIEW' ? 'view' : 'table',
      comment: row.comment || undefined,
    }));
  }

  /**
   * Get schema information for a table
   */
  async getTableSchema(tableName: string): Promise<TableSchema> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }

    const database = this.config.database;
    if (!database) {
      throw new Error('No database selected');
    }

    // Get columns
    const columnsQuery = `
      SELECT 
        c.COLUMN_NAME as column_name,
        c.DATA_TYPE as data_type,
        c.COLUMN_TYPE as column_type,
        c.IS_NULLABLE as is_nullable,
        c.COLUMN_DEFAULT as column_default,
        c.CHARACTER_MAXIMUM_LENGTH as max_length,
        c.NUMERIC_PRECISION as numeric_precision,
        c.NUMERIC_SCALE as numeric_scale,
        c.COLUMN_COMMENT as comment,
        c.COLUMN_KEY as column_key,
        c.EXTRA as extra,
        k.REFERENCED_TABLE_NAME as foreign_table,
        k.REFERENCED_COLUMN_NAME as foreign_column
      FROM information_schema.COLUMNS c
      LEFT JOIN information_schema.KEY_COLUMN_USAGE k
        ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
        AND c.TABLE_NAME = k.TABLE_NAME
        AND c.COLUMN_NAME = k.COLUMN_NAME
        AND k.REFERENCED_TABLE_NAME IS NOT NULL
      WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
      ORDER BY c.ORDINAL_POSITION
    `;

    const [columnRows] = await this.pool.query<RowDataPacket[]>(columnsQuery, [
      database,
      tableName,
    ]);

    const columns: ColumnSchema[] = columnRows.map((row) => ({
      name: row.column_name,
      type: row.column_type || row.data_type,
      nullable: row.is_nullable === 'YES',
      primaryKey: row.column_key === 'PRI',
      defaultValue: row.column_default ?? undefined,
      foreignKey: row.foreign_table
        ? {
            table: row.foreign_table,
            column: row.foreign_column,
          }
        : undefined,
      comment: row.comment || undefined,
      maxLength: row.max_length ? Number(row.max_length) : undefined,
      precision: row.numeric_precision ? Number(row.numeric_precision) : undefined,
      scale: row.numeric_scale ? Number(row.numeric_scale) : undefined,
      autoIncrement: row.extra?.includes('auto_increment') || false,
    }));

    // Get indexes
    const indexesQuery = `
      SELECT 
        INDEX_NAME as index_name,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns,
        NOT NON_UNIQUE as is_unique,
        INDEX_TYPE as index_type
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
    `;

    const [indexRows] = await this.pool.query<RowDataPacket[]>(indexesQuery, [database, tableName]);

    const indexes: IndexInfo[] = indexRows.map((row) => ({
      name: row.index_name,
      columns: row.columns?.split(',') || [],
      unique: Boolean(row.is_unique),
      primary: row.index_name === 'PRIMARY',
      type: row.index_type,
    }));

    // Get primary key columns
    const primaryKey = columns.filter((c) => c.primaryKey).map((c) => c.name);

    // Get row count
    let rowCount: number | undefined;
    try {
      const [countRows] = await this.pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM ${this.escapeIdentifier(tableName)}`
      );
      rowCount = Number(countRows[0]?.count) || undefined;
    } catch {
      // Ignore count errors
    }

    return {
      name: tableName,
      columns,
      indexes,
      primaryKey,
      rowCount,
    };
  }

  /**
   * Get primary key columns for a table
   */
  async getPrimaryKeyColumns(tableName: string): Promise<string[]> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }

    const database = this.config.database;
    if (!database) {
      throw new Error('No database selected');
    }

    const query = `
      SELECT COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = 'PRIMARY'
      ORDER BY ORDINAL_POSITION
    `;

    const [rows] = await this.pool.query<RowDataPacket[]>(query, [database, tableName]);
    return rows.map((row) => row.COLUMN_NAME);
  }

  /**
   * Execute a raw SQL query
   */
  async executeQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }
    return this.runQuery(this.pool, sql, params);
  }

  async executeReadOnlyQuery(sql: string): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }
    const connection = await this.pool.getConnection();
    try {
      await connection.query('START TRANSACTION READ ONLY');
      return await this.runQuery(connection, sql);
    } finally {
      await connection.query('ROLLBACK').catch(() => undefined);
      connection.release();
    }
  }

  private async runQuery(
    target: Pool | PoolConnection,
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const [result, fields] = await target.query(sql, params);
      const executionTime = Date.now() - startTime;

      // Handle SELECT queries
      if (Array.isArray(result)) {
        const rows = result as RowDataPacket[];
        return {
          columns: fields ? (fields as Array<{ name: string }>).map((f) => f.name) : [],
          rows: rows as Record<string, unknown>[],
          rowCount: rows.length,
          executionTime,
        };
      }

      // Handle INSERT/UPDATE/DELETE
      const resultHeader = result as ResultSetHeader;
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        affectedRows: resultHeader.affectedRows,
        executionTime,
      };
    } catch (error) {
      // Never log the SQL text: it may carry secrets (e.g. ALTER USER ... IDENTIFIED BY).
      logger.error('MySQL query error', { ...dbErrorCodes(error), sqlLength: sql.length });
      throw error;
    }
  }

  /**
   * Get table data with pagination (MySQL specific)
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
    const { limit = 100, offset = 0, orderBy, orderDirection = 'ASC' } = options;
    const safeLimit = this.normalizeLimit(limit);
    const safeOffset = this.normalizeOffset(offset);
    const safeOrderDirection = this.normalizeOrderDirection(orderDirection);
    const tableSchema = await this.getTableSchema(tableName);
    assertKnownTable(tableSchema, tableName);
    assertKnownColumns(tableSchema, [orderBy]);

    // Build query with backtick escaping for MySQL
    let sql = `SELECT * FROM ${this.escapeIdentifier(tableSchema.name)}`;

    if (orderBy) {
      sql += ` ORDER BY ${this.escapeIdentifier(orderBy)} ${safeOrderDirection}`;
    }

    sql += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    return this.executeQuery(sql);
  }

  /**
   * Update row (MySQL specific with ? placeholders)
   */
  async updateRow(
    tableName: string,
    primaryKey: Record<string, unknown>,
    changes: Record<string, unknown>
  ): Promise<number> {
    if (Object.keys(changes).length === 0) {
      return 0;
    }

    const tableSchema = await this.getTableSchema(tableName);
    assertKnownTable(tableSchema, tableName);
    assertKnownColumns(tableSchema, [...Object.keys(changes), ...Object.keys(primaryKey)]);

    // Build SET clause with ? placeholders
    const setClauses: string[] = [];
    const values: unknown[] = [];

    Object.entries(changes).forEach(([column, value]) => {
      setClauses.push(`${this.escapeIdentifier(column)} = ?`);
      values.push(value);
    });

    // Build WHERE clause
    const whereClauses: string[] = [];
    Object.entries(primaryKey).forEach(([column, value]) => {
      whereClauses.push(`${this.escapeIdentifier(column)} = ?`);
      values.push(value);
    });

    const sql = `UPDATE ${this.escapeIdentifier(tableSchema.name)} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;

    const result = await this.executeQuery(sql, values);
    return result.affectedRows ?? 0;
  }

  /**
   * Delete row (MySQL specific)
   */
  async deleteRow(tableName: string, primaryKey: Record<string, unknown>): Promise<number> {
    const tableSchema = await this.getTableSchema(tableName);
    assertKnownTable(tableSchema, tableName);
    assertKnownColumns(tableSchema, Object.keys(primaryKey));

    const whereClauses: string[] = [];
    const values: unknown[] = [];

    Object.entries(primaryKey).forEach(([column, value]) => {
      whereClauses.push(`${this.escapeIdentifier(column)} = ?`);
      values.push(value);
    });

    const sql = `DELETE FROM ${this.escapeIdentifier(tableSchema.name)} WHERE ${whereClauses.join(' AND ')}`;

    const result = await this.executeQuery(sql, values);
    return result.affectedRows ?? 0;
  }

  /**
   * Insert row (MySQL specific)
   */
  async insertRow(tableName: string, data: Record<string, unknown>): Promise<QueryResult> {
    const tableSchema = await this.getTableSchema(tableName);
    assertKnownTable(tableSchema, tableName);
    assertKnownColumns(tableSchema, Object.keys(data));

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => '?');

    const escapedColumns = columns.map((column) => this.escapeIdentifier(column)).join(', ');
    const sql = `INSERT INTO ${this.escapeIdentifier(tableSchema.name)} (${escapedColumns}) VALUES (${placeholders.join(', ')})`;

    if (!this.pool) {
      throw new Error('Not connected to database');
    }
    const [header] = await this.pool.query<ResultSetHeader>(sql, values);
    const insertResult: QueryResult = {
      columns: [],
      rows: [],
      rowCount: 0,
      affectedRows: header.affectedRows,
      executionTime: 0,
    };
    if (!header.affectedRows) return insertResult;

    // Re-select the inserted row: by its auto-increment value (insertId comes from the same
    // connection as the INSERT), or by a primary key the caller supplied.
    const autoColumn = tableSchema.columns.find((column) => column.autoIncrement)?.name;
    let key: Record<string, unknown> | null = null;
    if (autoColumn && header.insertId) {
      key = { [autoColumn]: header.insertId };
    } else if (
      tableSchema.primaryKey.length > 0 &&
      tableSchema.primaryKey.every((column) => data[column] !== undefined)
    ) {
      key = Object.fromEntries(tableSchema.primaryKey.map((column) => [column, data[column]]));
    }
    if (!key) return insertResult;

    const where = Object.keys(key)
      .map((column) => `${this.escapeIdentifier(column)} = ?`)
      .join(' AND ');
    return this.executeQuery(
      `SELECT * FROM ${this.escapeIdentifier(tableSchema.name)} WHERE ${where}`,
      Object.values(key)
    );
  }

  async createUser(username: string, options: CreateDatabaseUserOptions): Promise<void> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }

    const normalizedUsername = this.normalizeUserName(username);
    const host = this.normalizeUserHost(options.host);
    const database = options.database?.trim() || this.config.database;
    const accessLevel = this.normalizeAccessLevel(options.accessLevel);
    this.assertPassword(options.password);

    if (accessLevel !== 'login') {
      this.assertDatabaseName(database || '');
    }

    const connection = await this.pool.getConnection();
    let created = false;

    try {
      logger.info('Creating MySQL database user', {
        username: normalizedUsername,
        host,
        database,
        accessLevel,
      });

      await connection.query('CREATE USER ?@? IDENTIFIED BY ?', [
        normalizedUsername,
        host,
        options.password,
      ]);
      created = true;

      if (accessLevel !== 'login' && database) {
        const privileges = this.getPrivilegesForAccessLevel(accessLevel);
        await connection.query(
          `GRANT ${privileges} ON ${this.escapeIdentifier(database)}.* TO ?@?`,
          [normalizedUsername, host]
        );
      }

      logger.info('MySQL database user created successfully', {
        username: normalizedUsername,
        host,
        database,
        accessLevel,
      });
    } catch (error) {
      if (created) {
        await connection.query('DROP USER ?@?', [normalizedUsername, host]).catch(() => undefined);
      }
      const safeError = this.formatSafeError(error, [options.password]);

      logger.error('Failed to create MySQL database user', {
        username: normalizedUsername,
        host,
        database,
        accessLevel,
        error: safeError,
      });
      throw new Error(`Failed to create user: ${safeError.message}`);
    } finally {
      connection.release();
    }
  }

  /**
   * Get row count (MySQL specific)
   */
  async createTable(name: string, columns: CreateTableColumn[]): Promise<void> {
    await this.executeQuery(buildCreateTableSql('mysql', name, columns));
  }

  async getRowCount(tableName: string): Promise<number> {
    const tableSchema = await this.getTableSchema(tableName);
    assertKnownTable(tableSchema, tableName);
    const sql = `SELECT COUNT(*) as count FROM ${this.escapeIdentifier(tableSchema.name)}`;

    const result = await this.executeQuery(sql);
    return Number(result.rows[0]?.count ?? 0);
  }

  protected escapeIdentifier(identifier: string): string {
    return quoteBacktickIdentifier(identifier);
  }

  private normalizeUserName(username: string): string {
    const normalized = username.trim();
    if (!normalized) {
      throw new Error('User name cannot be empty');
    }
    if (normalized.length > 32) {
      throw new Error('MySQL user name cannot exceed 32 characters');
    }
    if (normalized.includes('\0')) {
      throw new Error('User name contains invalid characters');
    }
    return normalized;
  }

  private normalizeUserHost(host?: string): string {
    const normalized = host?.trim() || '%';
    if (normalized.length > 255) {
      throw new Error('MySQL user host cannot exceed 255 characters');
    }
    if (normalized.includes('\0')) {
      throw new Error('User host contains invalid characters');
    }
    return normalized;
  }

  private assertDatabaseName(database: string): void {
    if (!database.trim()) {
      throw new Error('Database name is required for grants');
    }
    if (database.includes('\0')) {
      throw new Error('Database name contains invalid characters');
    }
  }

  private assertPassword(password: string): void {
    if (!password || password.length === 0) {
      throw new Error('Password cannot be empty');
    }
    if (password.length > 10 * 1024) {
      throw new Error('Password is too long');
    }
  }

  private normalizeAccessLevel(accessLevel?: DatabaseUserAccessLevel): DatabaseUserAccessLevel {
    if (accessLevel === 'login' || accessLevel === 'read' || accessLevel === 'admin') {
      return accessLevel;
    }
    return 'readWrite';
  }

  private getPrivilegesForAccessLevel(accessLevel: DatabaseUserAccessLevel): string {
    if (accessLevel === 'read') {
      return 'SELECT';
    }
    if (accessLevel === 'admin') {
      return 'ALL PRIVILEGES';
    }
    return 'SELECT, INSERT, UPDATE, DELETE';
  }

  private formatSafeError(
    error: unknown,
    redactions: string[] = []
  ): {
    message: string;
    code?: string;
    errno?: number;
    sqlState?: string;
  } {
    if (!(error instanceof Error)) {
      return { message: this.redactSecrets(String(error), redactions) };
    }

    const mysqlError = error as Error & {
      code?: string;
      errno?: number;
      sqlState?: string;
    };

    return {
      message: this.redactSecrets(mysqlError.message, redactions),
      code: mysqlError.code,
      errno: mysqlError.errno,
      sqlState: mysqlError.sqlState,
    };
  }

  private redactSecrets(message: string, secrets: string[]): string {
    return secrets
      .filter((secret) => secret.length > 0)
      .reduce((current, secret) => current.split(secret).join('[redacted]'), message);
  }
}
