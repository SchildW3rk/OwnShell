/**
 * SQLite Database Adapter (v1.15.0)
 *
 * Implements the ISQLAdapter interface for SQLite databases.
 * Uses the 'better-sqlite3' library for synchronous database access.
 * Supports both local files and remote files (via SFTP download).
 */

import Database from 'better-sqlite3';
import {
  ISQLAdapter,
  AdapterConnectionConfig,
  TableInfo,
  TableSchema,
  QueryResult,
} from './base-adapter';
import { DBType, ColumnSchema, IndexInfo, PrimaryKeyValue } from '@ownshell/core';
import { dbErrorCodes, logger } from '../../logger';
import { assertKnownColumns, assertKnownTable } from '../identifier-whitelist';
import { quoteDoubleIdentifier } from '../sql-identifiers';

/**
 * SQLite-specific connection configuration
 */
export interface SQLiteAdapterConfig extends Omit<AdapterConnectionConfig, 'host' | 'port'> {
  /** Path to the SQLite database file */
  filePath: string;
  /** Whether to open in read-only mode */
  readOnly?: boolean;
}

/**
 * SQLite Adapter
 * Note: Does NOT extend BaseSQLAdapter because SQLite uses different parameter syntax (?)
 */
export class SQLiteAdapter implements ISQLAdapter {
  readonly type: DBType = 'sqlite';
  private db: Database.Database | null = null;
  private config: SQLiteAdapterConfig;
  private connected = false;

  constructor(config: SQLiteAdapterConfig) {
    this.config = config;
  }

  /**
   * Connect to SQLite database (open file)
   */
  async connect(): Promise<void> {
    if (this.connected && this.db) {
      return;
    }

    try {
      logger.info('Opening SQLite database', {
        filePath: this.config.filePath,
        readOnly: this.config.readOnly,
      });

      this.db = new Database(this.config.filePath, {
        readonly: this.config.readOnly ?? false,
        fileMustExist: true,
      });

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      this.connected = true;

      logger.info('SQLite database opened successfully', {
        filePath: this.config.filePath,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to open SQLite database', { error: errorMessage });
      throw new Error(`Failed to open SQLite database: ${errorMessage}`);
    }
  }

  /**
   * Disconnect from SQLite database (close file)
   */
  async disconnect(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
        this.connected = false;
        logger.info('SQLite database closed');
      } catch (error) {
        logger.error('Error closing SQLite database', { error });
      }
    }
  }

  isConnected(): boolean {
    return this.connected && this.db !== null;
  }

  /**
   * List all tables in the database
   */
  async listTables(): Promise<TableInfo[]> {
    if (!this.db) throw new Error('Database not connected');

    const tables = this.db
      .prepare(
        `
        SELECT name, type 
        FROM sqlite_master 
        WHERE type IN ('table', 'view') 
          AND name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `
      )
      .all() as Array<{ name: string; type: string }>;

    return tables.map((t) => ({
      name: t.name,
      type: t.type === 'view' ? 'view' : 'table',
      rowCount: this.getTableRowCountSync(t.name),
    }));
  }

  /**
   * Get table row count (synchronous helper)
   */
  private getTableRowCountSync(tableName: string): number {
    if (!this.db) return 0;
    try {
      const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.escapeIdentifier(tableName)}`).get() as {
        count: number;
      };
      return result?.count ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get table schema
   */
  async getTableSchema(tableName: string): Promise<TableSchema> {
    if (!this.db) throw new Error('Database not connected');

    // Get column info
    const columns = this.db.prepare(`PRAGMA table_info(${this.escapeIdentifier(tableName)})`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    // Get index info
    const indexList = this.db.prepare(`PRAGMA index_list(${this.escapeIdentifier(tableName)})`).all() as Array<{
      seq: number;
      name: string;
      unique: number;
      origin: string;
      partial: number;
    }>;

    const indexes: IndexInfo[] = [];
    const primaryKeyColumns: string[] = [];

    // Find primary key columns
    columns.forEach((col) => {
      if (col.pk > 0) {
        primaryKeyColumns.push(col.name);
      }
    });

    // Get index details
    for (const idx of indexList) {
      const indexInfo = this.db.prepare(`PRAGMA index_info(${this.escapeIdentifier(idx.name)})`).all() as Array<{
        seqno: number;
        cid: number;
        name: string;
      }>;

      indexes.push({
        name: idx.name,
        columns: indexInfo.map((i) => i.name),
        unique: idx.unique === 1,
        primary: idx.origin === 'pk',
        type: 'btree',
      });
    }

    // Add primary key as index if not already present
    if (primaryKeyColumns.length > 0 && !indexes.some((i) => i.primary)) {
      indexes.unshift({
        name: 'PRIMARY',
        columns: primaryKeyColumns,
        unique: true,
        primary: true,
        type: 'btree',
      });
    }

    const columnSchemas: ColumnSchema[] = columns.map((col) => ({
      name: col.name,
      type: col.type || 'TEXT',
      nullable: col.notnull === 0,
      primaryKey: col.pk > 0,
      defaultValue: col.dflt_value ?? undefined,
      autoIncrement: col.type.toUpperCase() === 'INTEGER' && col.pk === 1,
    }));

    return {
      name: tableName,
      columns: columnSchemas,
      indexes,
      primaryKey: primaryKeyColumns,
      rowCount: this.getTableRowCountSync(tableName),
    };
  }

  /**
   * Execute raw SQL query
   */
  async executeQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.db) throw new Error('Database not connected');

    const startTime = Date.now();

    try {
      const stmt = this.db.prepare(sql);
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

      if (isSelect) {
        const rows = params ? stmt.all(...params) : stmt.all();
        const columns = rows.length > 0 ? Object.keys(rows[0] as object) : [];

        return {
          columns,
          rows: rows as Record<string, unknown>[],
          rowCount: rows.length,
          executionTime: Date.now() - startTime,
        };
      } else {
        const result = params ? stmt.run(...params) : stmt.run();

        return {
          columns: [],
          rows: [],
          rowCount: 0,
          affectedRows: result.changes,
          executionTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('SQLite query error', { ...dbErrorCodes(error), sqlLength: sql.length });
      throw new Error(`Query failed: ${errorMessage}`);
    }
  }

  /**
   * Get table data with pagination
   */
  async getTableData(
    tableName: string,
    options?: {
      schema?: string;
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDirection?: 'ASC' | 'DESC';
    }
  ): Promise<QueryResult> {
    if (!this.db) throw new Error('Database not connected');

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const orderBy = options?.orderBy ?? 'rowid';
    const orderDirection = options?.orderDirection ?? 'ASC';

    const tableSchema = await this.getTableSchema(tableName);
    assertKnownTable(tableSchema, tableName);
    assertKnownColumns(tableSchema, [orderBy === 'rowid' ? undefined : orderBy]);

    let sql = `SELECT * FROM ${this.escapeIdentifier(tableSchema.name)}`;

    sql += ` ORDER BY ${this.escapeIdentifier(orderBy)} ${this.normalizeOrderDirection(orderDirection)}`;
    sql += ` LIMIT ${this.normalizeLimit(limit)} OFFSET ${this.normalizeOffset(offset)}`;

    return this.executeQuery(sql);
  }

  /**
   * Update a row
   */
  async updateRow(
    tableName: string,
    primaryKey: PrimaryKeyValue,
    changes: Record<string, unknown>
  ): Promise<number> {
    if (!this.db) throw new Error('Database not connected');
    const tableSchema = await this.getTableSchema(tableName);
    assertKnownTable(tableSchema, tableName);
    assertKnownColumns(tableSchema, [...Object.keys(changes), ...Object.keys(primaryKey)]);

    const setClauses = Object.keys(changes)
      .map((col) => `${this.escapeIdentifier(col)} = ?`)
      .join(', ');

    const whereClauses = Object.keys(primaryKey)
      .map((col) => `${this.escapeIdentifier(col)} = ?`)
      .join(' AND ');

    const sql = `UPDATE ${this.escapeIdentifier(tableSchema.name)} SET ${setClauses} WHERE ${whereClauses}`;
    const params = [...Object.values(changes), ...Object.values(primaryKey)];

    const result = await this.executeQuery(sql, params);
    return result.affectedRows ?? 0;
  }

  /**
   * Delete a row
   */
  async deleteRow(tableName: string, primaryKey: PrimaryKeyValue): Promise<number> {
    if (!this.db) throw new Error('Database not connected');
    const tableSchema = await this.getTableSchema(tableName);
    assertKnownTable(tableSchema, tableName);
    assertKnownColumns(tableSchema, Object.keys(primaryKey));

    const whereClauses = Object.keys(primaryKey)
      .map((col) => `${this.escapeIdentifier(col)} = ?`)
      .join(' AND ');

    const sql = `DELETE FROM ${this.escapeIdentifier(tableSchema.name)} WHERE ${whereClauses}`;
    const params = Object.values(primaryKey);

    const result = await this.executeQuery(sql, params);
    return result.affectedRows ?? 0;
  }

  /**
   * Insert a row
   */
  async insertRow(tableName: string, data: Record<string, unknown>): Promise<QueryResult> {
    if (!this.db) throw new Error('Database not connected');
    const tableSchema = await this.getTableSchema(tableName);
    assertKnownTable(tableSchema, tableName);
    assertKnownColumns(tableSchema, Object.keys(data));

    const columns = Object.keys(data)
      .map((c) => this.escapeIdentifier(c))
      .join(', ');
    const placeholders = Object.keys(data)
      .map(() => '?')
      .join(', ');
    const values = Object.values(data);

    const sql = `INSERT INTO ${this.escapeIdentifier(tableSchema.name)} (${columns}) VALUES (${placeholders})`;

    return this.executeQuery(sql, values);
  }

  /**
   * Get primary key columns for a table
   */
  async getPrimaryKeyColumns(tableName: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not connected');

    const columns = this.db.prepare(`PRAGMA table_info(${this.escapeIdentifier(tableName)})`).all() as Array<{
      name: string;
      pk: number;
    }>;

    return columns.filter((c) => c.pk > 0).map((c) => c.name);
  }

  /**
   * Get row count for a table
   */
  async getRowCount(tableName: string): Promise<number> {
    if (!this.db) throw new Error('Database not connected');

    const tableSchema = await this.getTableSchema(tableName);
    assertKnownTable(tableSchema, tableName);
    const sql = `SELECT COUNT(*) as count FROM ${this.escapeIdentifier(tableSchema.name)}`;

    const result = this.db.prepare(sql).get() as { count: number };
    return result?.count ?? 0;
  }

  private escapeIdentifier(identifier: string): string {
    return quoteDoubleIdentifier(identifier);
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit)) return 100;
    return Math.min(Math.max(Math.floor(limit), 1), 1000);
  }

  private normalizeOffset(offset: number): number {
    if (!Number.isFinite(offset)) return 0;
    return Math.max(Math.floor(offset), 0);
  }

  private normalizeOrderDirection(orderDirection: string): 'ASC' | 'DESC' {
    return orderDirection === 'DESC' ? 'DESC' : 'ASC';
  }

  /**
   * Test the connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.db) return false;

    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get SQLite version
   */
  getSQLiteVersion(): string {
    if (!this.db) return 'Unknown';
    const result = this.db.prepare('SELECT sqlite_version() as version').get() as {
      version: string;
    };
    return result?.version ?? 'Unknown';
  }

  /**
   * Get database file info
   */
  getDatabaseInfo(): { pageSize: number; pageCount: number; encoding: string } | null {
    if (!this.db) return null;

    try {
      const pageSize = this.db.pragma('page_size', { simple: true }) as number;
      const pageCount = this.db.pragma('page_count', { simple: true }) as number;
      const encoding = this.db.pragma('encoding', { simple: true }) as string;

      return { pageSize, pageCount, encoding };
    } catch {
      return null;
    }
  }
}
