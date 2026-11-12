/**
 * PostgreSQL Database Adapter
 *
 * Implements the ISQLAdapter interface for PostgreSQL databases.
 * Uses the 'pg' library for database connections.
 */

import { Pool, PoolClient, QueryResult as PgQueryResult } from 'pg';
import {
  BaseSQLAdapter,
  CreateDatabaseUserOptions,
  SQLAdapterConnectionConfig,
  TableInfo,
  TableSchema,
  QueryResult,
} from './base-adapter';
import { DBType, ColumnSchema, IndexInfo } from '@ownshell/core';
import { dbErrorCodes, logger } from '../../logger';
import { PostgresDdl } from './postgres-ddl';
import { formatPostgresDataType } from './postgres-format';

/**
 * PostgreSQL Adapter
 */
export class PostgresAdapter extends BaseSQLAdapter {
  readonly type: DBType = 'postgres';
  private pool: Pool | null = null;
  private client: PoolClient | null = null;
  private ddl: PostgresDdl;

  constructor(config: SQLAdapterConnectionConfig) {
    super(config);
    this.ddl = new PostgresDdl({
      getPool: () => {
        if (!this.pool) {
          throw new Error('Not connected to database');
        }
        return this.pool;
      },
      escapeIdentifier: (identifier) => this.escapeIdentifier(identifier),
      buildQualifiedTableName: (tableName, schema) =>
        this.buildQualifiedTableName(tableName, schema),
    });
  }

  /**
   * Connect to PostgreSQL database
   */
  async connect(): Promise<void> {
    if (this.connected && this.pool) {
      return;
    }

    try {
      logger.info('Connecting to PostgreSQL', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
      });

      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database || 'postgres',
        user: this.config.username || '',
        password: this.config.password || '', // pg requires string, not undefined
        ssl: this.config.ssl ?? false,
        max: 5, // Maximum pool size
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Test connection
      this.client = await this.pool.connect();
      await this.client.query('SELECT 1');

      this.connected = true;
      logger.info('PostgreSQL connected successfully');
    } catch (error) {
      this.connected = false;
      logger.error('PostgreSQL connection failed', error);
      throw error;
    }
  }

  /**
   * Disconnect from PostgreSQL database
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        this.client.release();
        this.client = null;
      }

      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }

      this.connected = false;
      logger.info('PostgreSQL disconnected');
    } catch (error) {
      logger.error('PostgreSQL disconnect error', error);
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
      const result = await this.pool.query('SELECT 1 as test');
      return result.rows.length > 0;
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

    const query = `
      SELECT 
        t.table_schema as schema,
        t.table_name as name,
        t.table_type,
        COALESCE(s.n_live_tup, 0) as row_count,
        obj_description(('"' || t.table_schema || '"."' || t.table_name || '"')::regclass, 'pg_class') as comment
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s 
        ON t.table_name = s.relname 
        AND t.table_schema = s.schemaname
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY t.table_schema, t.table_name
    `;

    const result = await this.pool.query(query);

    return result.rows.map((row) => ({
      name: row.name,
      schema: row.schema,
      rowCount: Number(row.row_count) || undefined,
      type: row.table_type === 'VIEW' ? 'view' : 'table',
      comment: row.comment || undefined,
    }));
  }

  /**
   * Get schema information for a table
   */
  async getTableSchema(tableName: string, schema = 'public'): Promise<TableSchema> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }

    // Get columns
    const columnsQuery = `
      SELECT 
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        col_description(('"' || c.table_schema || '"."' || c.table_name || '"')::regclass, c.ordinal_position) as comment,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
        fk.foreign_table_schema,
        fk.foreign_table_name,
        fk.foreign_column_name,
        CASE WHEN c.column_default LIKE 'nextval%' THEN true ELSE false END as is_auto_increment
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name, kcu.table_name, kcu.table_schema
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.column_name = pk.column_name 
        AND c.table_name = pk.table_name 
        AND c.table_schema = pk.table_schema
      LEFT JOIN (
        SELECT 
          kcu.column_name,
          kcu.table_name,
          kcu.table_schema,
          ccu.table_schema as foreign_table_schema,
          ccu.table_name as foreign_table_name,
          ccu.column_name as foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
      ) fk ON c.column_name = fk.column_name 
        AND c.table_name = fk.table_name 
        AND c.table_schema = fk.table_schema
      WHERE c.table_name = $1 AND c.table_schema = $2
      ORDER BY c.ordinal_position
    `;

    const columnsResult = await this.pool.query(columnsQuery, [tableName, schema]);

    const columns: ColumnSchema[] = columnsResult.rows.map((row) => ({
      name: row.column_name,
      type: formatPostgresDataType(row),
      nullable: row.is_nullable === 'YES',
      primaryKey: row.is_primary_key,
      defaultValue: row.column_default || undefined,
      foreignKey: row.foreign_table_name
        ? {
            table: row.foreign_table_name,
            column: row.foreign_column_name,
            schema: row.foreign_table_schema,
          }
        : undefined,
      comment: row.comment || undefined,
      maxLength: row.character_maximum_length || undefined,
      precision: row.numeric_precision || undefined,
      scale: row.numeric_scale || undefined,
      autoIncrement: row.is_auto_increment,
    }));

    // Get indexes
    const indexesQuery = `
      SELECT
        i.relname as index_name,
        array_agg(a.attname ORDER BY x.ordinality) as columns,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        am.amname as index_type
      FROM pg_class t
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON i.relam = am.oid
      CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
      WHERE t.relname = $1 AND n.nspname = $2
      GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname
    `;

    const indexesResult = await this.pool.query(indexesQuery, [tableName, schema]);

    const indexes: IndexInfo[] = indexesResult.rows.map((row) => ({
      name: row.index_name,
      columns: row.columns,
      unique: row.is_unique,
      primary: row.is_primary,
      type: row.index_type,
    }));

    // Get primary key columns
    const primaryKey = columns.filter((c) => c.primaryKey).map((c) => c.name);

    // Get row count
    const countQuery = `SELECT COUNT(*) as count FROM ${this.buildQualifiedTableName(tableName, schema)}`;
    let rowCount: number | undefined;
    try {
      const countResult = await this.pool.query(countQuery);
      rowCount = Number(countResult.rows[0]?.count) || undefined;
    } catch {
      // Ignore count errors (e.g., permission issues)
    }

    return {
      name: tableName,
      schema,
      columns,
      indexes,
      primaryKey,
      rowCount,
    };
  }

  /**
   * Get primary key columns for a table
   */
  async getPrimaryKeyColumns(tableName: string, schema = 'public'): Promise<string[]> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }

    const query = `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = $1
        AND tc.table_schema = $2
      ORDER BY kcu.ordinal_position
    `;

    const result = await this.pool.query(query, [tableName, schema]);
    return result.rows.map((row) => row.column_name);
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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      return await this.runQuery(client, sql);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  private async runQuery(
    target: Pool | PoolClient,
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const result: PgQueryResult = await target.query(sql, params);
      const executionTime = Date.now() - startTime;

      return {
        columns: result.fields?.map((f) => f.name) || [],
        rows: result.rows || [],
        rowCount: result.rows?.length || 0,
        affectedRows: result.rowCount ?? undefined,
        executionTime,
      };
    } catch (error) {
      // Never log the SQL text: it may carry secrets (e.g. ALTER USER ... PASSWORD).
      logger.error('PostgreSQL query error', { ...dbErrorCodes(error), sqlLength: sql.length });
      throw error;
    }
  }

  async listDatabases(): Promise<string[]> {
    return this.ddl.listDatabases();
  }

  async createDatabase(name: string, options?: Record<string, unknown>): Promise<void> {
    return this.ddl.createDatabase(name, options);
  }

  async createUser(username: string, options: CreateDatabaseUserOptions): Promise<void> {
    return this.ddl.createUser(username, {
      ...options,
      database: options.database || this.config.database || 'postgres',
    });
  }

  async dropDatabase(name: string): Promise<void> {
    return this.ddl.dropDatabase(name);
  }

  async listSchemas(): Promise<string[]> {
    return this.ddl.listSchemas();
  }

  async createSchema(name: string, options?: Record<string, unknown>): Promise<void> {
    return this.ddl.createSchema(name, options);
  }

  async dropSchema(name: string, cascade = false): Promise<void> {
    return this.ddl.dropSchema(name, cascade);
  }

  async createTable(
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
    schema = 'public'
  ): Promise<void> {
    return this.ddl.createTable(name, columns, schema);
  }

  async dropTable(name: string, schema = 'public', cascade = false): Promise<void> {
    return this.ddl.dropTable(name, schema, cascade);
  }
}
