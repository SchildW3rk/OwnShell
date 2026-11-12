import type { Pool, PoolClient } from 'pg';
import { logger } from '../../logger';
import type { CreateDatabaseUserOptions, DatabaseUserAccessLevel } from './base-adapter';
import { buildCreateTableSql, type CreateTableColumn } from './create-table-sql';

interface PostgresDdlContext {
  getPool: () => Pool;
  escapeIdentifier: (identifier: string) => string;
  buildQualifiedTableName: (tableName: string, schema?: string) => string;
}

export class PostgresDdl {
  constructor(private ctx: PostgresDdlContext) {}

  async listDatabases(): Promise<string[]> {
    try {
      const result = await this.ctx.getPool().query(
        `SELECT datname FROM pg_database 
         WHERE datistemplate = false 
         ORDER BY datname`
      );
      return result.rows.map((row) => row.datname);
    } catch (error) {
      logger.error('Failed to list databases', error);
      throw new Error(
        `Failed to list databases: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async createDatabase(name: string, options?: Record<string, unknown>): Promise<void> {
    this.assertNamedIdentifier(name, 'Database');

    try {
      let sql = `CREATE DATABASE ${this.ctx.escapeIdentifier(name)}`;

      if (options?.encoding && typeof options.encoding === 'string') {
        sql += ` ENCODING ${this.escapeLiteral(options.encoding)}`;
      }
      if (options?.owner && typeof options.owner === 'string') {
        sql += ` OWNER ${this.ctx.escapeIdentifier(options.owner)}`;
      }
      if (options?.template && typeof options.template === 'string') {
        sql += ` TEMPLATE ${this.ctx.escapeIdentifier(options.template)}`;
      }

      logger.info('Creating database', { name, sql });
      await this.ctx.getPool().query(sql);
      logger.info('Database created successfully', { name });
    } catch (error) {
      logger.error('Failed to create database', { name, error });
      throw new Error(
        `Failed to create database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async createUser(username: string, options: CreateDatabaseUserOptions): Promise<void> {
    this.assertNamedIdentifier(username, 'User');
    this.assertPassword(options.password);

    const accessLevel = this.normalizeAccessLevel(options.accessLevel);
    const schema = options.schema?.trim() || 'public';
    let database = options.database?.trim();

    if (accessLevel !== 'login') {
      this.assertNamedIdentifier(schema, 'Schema');
      if (!database) {
        const currentDb = await this.ctx.getPool().query('SELECT current_database() AS name');
        database = currentDb.rows[0]?.name;
      }
      this.assertNamedIdentifier(database || '', 'Database');
    }

    const client = await this.ctx.getPool().connect();
    try {
      logger.info('Creating PostgreSQL database user', {
        username,
        database,
        schema,
        accessLevel,
      });

      await client.query('BEGIN');
      const passwordLiteral = await this.quoteLiteral(client, options.password);
      await client.query(
        `CREATE ROLE ${this.ctx.escapeIdentifier(username)} WITH LOGIN PASSWORD ${passwordLiteral}`
      );

      if (accessLevel !== 'login' && database) {
        await client.query(
          `GRANT CONNECT ON DATABASE ${this.ctx.escapeIdentifier(database)} TO ${this.ctx.escapeIdentifier(username)}`
        );
        await client.query(
          `GRANT USAGE ON SCHEMA ${this.ctx.escapeIdentifier(schema)} TO ${this.ctx.escapeIdentifier(username)}`
        );

        if (accessLevel === 'read') {
          await client.query(
            `GRANT SELECT ON ALL TABLES IN SCHEMA ${this.ctx.escapeIdentifier(schema)} TO ${this.ctx.escapeIdentifier(username)}`
          );
          await client.query(
            `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${this.ctx.escapeIdentifier(schema)} TO ${this.ctx.escapeIdentifier(username)}`
          );
        } else if (accessLevel === 'readWrite') {
          await client.query(
            `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${this.ctx.escapeIdentifier(schema)} TO ${this.ctx.escapeIdentifier(username)}`
          );
          await client.query(
            `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${this.ctx.escapeIdentifier(schema)} TO ${this.ctx.escapeIdentifier(username)}`
          );
        } else {
          await client.query(
            `GRANT CREATE, TEMPORARY ON DATABASE ${this.ctx.escapeIdentifier(database)} TO ${this.ctx.escapeIdentifier(username)}`
          );
          await client.query(
            `GRANT ALL PRIVILEGES ON SCHEMA ${this.ctx.escapeIdentifier(schema)} TO ${this.ctx.escapeIdentifier(username)}`
          );
          await client.query(
            `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${this.ctx.escapeIdentifier(schema)} TO ${this.ctx.escapeIdentifier(username)}`
          );
          await client.query(
            `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${this.ctx.escapeIdentifier(schema)} TO ${this.ctx.escapeIdentifier(username)}`
          );
        }
      }

      await client.query('COMMIT');
      logger.info('PostgreSQL database user created successfully', {
        username,
        database,
        schema,
        accessLevel,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      const safeError = this.formatSafeError(error, [options.password]);
      logger.error('Failed to create PostgreSQL database user', {
        username,
        database,
        schema,
        accessLevel,
        error: safeError,
      });
      throw new Error(`Failed to create user: ${safeError.message}`);
    } finally {
      client.release();
    }
  }

  async dropDatabase(name: string): Promise<void> {
    this.assertNamedIdentifier(name, 'Database');

    const systemDatabases = ['postgres', 'template0', 'template1'];
    if (systemDatabases.includes(name.toLowerCase())) {
      throw new Error(`Cannot drop system database: ${name}`);
    }

    try {
      logger.info('Dropping database', { name });
      await this.ctx.getPool().query(`DROP DATABASE ${this.ctx.escapeIdentifier(name)}`);
      logger.info('Database dropped successfully', { name });
    } catch (error) {
      logger.error('Failed to drop database', { name, error });
      throw new Error(
        `Failed to drop database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async listSchemas(): Promise<string[]> {
    try {
      const result = await this.ctx.getPool().query(
        `SELECT schema_name FROM information_schema.schemata 
         WHERE schema_name NOT LIKE 'pg_%' 
         AND schema_name != 'information_schema'
         ORDER BY schema_name`
      );
      return result.rows.map((row) => row.schema_name);
    } catch (error) {
      logger.error('Failed to list schemas', error);
      throw new Error(
        `Failed to list schemas: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async createSchema(name: string, options?: Record<string, unknown>): Promise<void> {
    this.assertNamedIdentifier(name, 'Schema');

    try {
      let sql = `CREATE SCHEMA ${this.ctx.escapeIdentifier(name)}`;
      if (options?.authorization && typeof options.authorization === 'string') {
        sql += ` AUTHORIZATION ${this.ctx.escapeIdentifier(options.authorization)}`;
      }

      logger.info('Creating schema', { name, sql });
      await this.ctx.getPool().query(sql);
      logger.info('Schema created successfully', { name });
    } catch (error) {
      logger.error('Failed to create schema', { name, error });
      throw new Error(
        `Failed to create schema: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async dropSchema(name: string, cascade = false): Promise<void> {
    this.assertNamedIdentifier(name, 'Schema');
    if (name.toLowerCase() === 'public') {
      throw new Error('Cannot drop the public schema');
    }

    try {
      logger.info('Dropping schema', { name, cascade });
      const cascadeClause = cascade ? ' CASCADE' : '';
      await this.ctx
        .getPool()
        .query(`DROP SCHEMA ${this.ctx.escapeIdentifier(name)}${cascadeClause}`);
      logger.info('Schema dropped successfully', { name });
    } catch (error) {
      logger.error('Failed to drop schema', { name, error });
      throw new Error(
        `Failed to drop schema: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async createTable(name: string, columns: CreateTableColumn[], schema = 'public'): Promise<void> {
    const sql = buildCreateTableSql('postgres', name, columns, schema);
    try {
      logger.info('Creating table', { name, schema, sql });
      await this.ctx.getPool().query(sql);
      logger.info('Table created successfully', { name, schema });
    } catch (error) {
      logger.error('Failed to create table', { name, schema, error });
      throw new Error(
        `Failed to create table: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async dropTable(name: string, schema = 'public', cascade = false): Promise<void> {
    this.assertNamedIdentifier(name, 'Table');

    try {
      const qualifiedTableName = this.ctx.buildQualifiedTableName(name, schema);
      const sql = `DROP TABLE ${qualifiedTableName}${cascade ? ' CASCADE' : ''}`;
      logger.info('Dropping table', { name, schema, cascade });
      await this.ctx.getPool().query(sql);
      logger.info('Table dropped successfully', { name, schema });
    } catch (error) {
      logger.error('Failed to drop table', { name, schema, error });
      throw new Error(
        `Failed to drop table: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private assertNamedIdentifier(name: string, label: string): void {
    if (!name || name.trim().length === 0) {
      throw new Error(`${label} name cannot be empty`);
    }
    if (name.length > 63) {
      throw new Error(`${label} name cannot exceed 63 characters`);
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

  private async quoteLiteral(client: PoolClient, value: string): Promise<string> {
    const result = await client.query('SELECT quote_literal($1) AS value', [value]);
    const literal = result.rows[0]?.value;
    if (typeof literal !== 'string') {
      throw new Error('Failed to quote password literal');
    }
    return literal;
  }

  private formatSafeError(
    error: unknown,
    redactions: string[] = []
  ): { message: string; code?: string } {
    if (!(error instanceof Error)) {
      return { message: this.redactSecrets(String(error), redactions) };
    }

    const postgresError = error as Error & { code?: string };

    return {
      message: this.redactSecrets(postgresError.message, redactions),
      code: postgresError.code,
    };
  }

  private redactSecrets(message: string, secrets: string[]): string {
    return secrets
      .filter((secret) => secret.length > 0)
      .reduce((current, secret) => current.split(secret).join('[redacted]'), message);
  }

  private escapeLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
