import { DBConnectionConfig, DBConnectionError, DBType } from '@ownshell/core';
import {
  AdapterConnectionConfig,
  ISQLAdapter,
  MongoDBAdapter,
  MySQLAdapter,
  PostgresAdapter,
  RedisAdapter,
  SQLiteAdapter,
} from '../adapters';
import { logger } from '../../logger';
import type { AnyAdapter, TestConnectionConfig } from './types';

export function createSQLiteAdapter(config: DBConnectionConfig, connectionId: string): SQLiteAdapter {
  const filePath = (config as any).filePath;
  if (!filePath) {
    throw new DBConnectionError('File path required for SQLite connection', 'INVALID_CONFIG');
  }

  logger.info('SQLite connection (file-based)', {
    connectionId,
    filePath,
    isRemote: (config as any).isRemote,
  });

  const effectivePath = (config as any).localCachePath || filePath;

  return new SQLiteAdapter({
    filePath: effectivePath,
    readOnly: config.readOnly === true,
  });
}

export function createNetworkAdapter(
  config: DBConnectionConfig,
  effectiveHost: string,
  effectivePort: number
): AnyAdapter {
  if (config.type === 'redis') {
    return new RedisAdapter({
      host: effectiveHost,
      port: effectivePort,
      password: config.password,
      database: 0,
      tls: config.ssl,
    });
  }

  if (config.type === 'mongodb') {
    if (!config.database) {
      throw new DBConnectionError('Database name is required for MongoDB', 'INVALID_CONFIG');
    }

    return new MongoDBAdapter({
      connectionUri: config.connectionMode === 'local' ? (config as any).connectionUri : undefined,
      host: effectiveHost,
      port: effectivePort,
      username: config.username,
      password: config.password,
      database: config.database,
      authDatabase: (config as any).authDatabase || 'admin',
      replicaSet: (config as any).replicaSet,
      directConnection: (config as any).directConnection,
      readPreference: (config as any).readPreference,
      tls: config.ssl,
    });
  }

  return createSQLAdapter(config.type, {
    host: effectiveHost,
    port: effectivePort,
    database: config.database,
    username: config.username,
    password: config.password,
    ssl: config.ssl,
  });
}

export function createSQLAdapter(type: DBType, config: AdapterConnectionConfig): ISQLAdapter {
  const normalizedConfig = {
    ...config,
    username: config.username || '',
    password: config.password || '',
  };

  switch (type) {
    case 'postgres':
      if (!config.host || config.port == null) {
        throw new DBConnectionError('Host and port are required for PostgreSQL', 'INVALID_CONFIG');
      }
      return new PostgresAdapter({ ...normalizedConfig, host: config.host, port: config.port });
    case 'mysql':
      if (!config.host || config.port == null) {
        throw new DBConnectionError('Host and port are required for MySQL', 'INVALID_CONFIG');
      }
      return new MySQLAdapter({ ...normalizedConfig, host: config.host, port: config.port });
    case 'redis':
      throw new DBConnectionError(
        'Redis connections are handled directly in connect(). Do not use createSQLAdapter() for Redis.',
        'REDIS_USE_CONNECT'
      );
    case 'sqlite':
      throw new DBConnectionError(
        'SQLite connections are handled directly in connect(). Do not use createSQLAdapter() for SQLite.',
        'SQLITE_USE_CONNECT'
      );
    case 'mongodb':
      throw new DBConnectionError(
        'MongoDB connections are handled directly in connect(). Do not use createSQLAdapter() for MongoDB.',
        'MONGODB_USE_CONNECT'
      );
    default:
      throw new DBConnectionError(`Unsupported database type: ${type}`, 'UNSUPPORTED_DB_TYPE');
  }
}

export function createTestAdapter(config: TestConnectionConfig): AnyAdapter {
  const username = config.username || '';
  const password = config.password || '';

  switch (config.type) {
    case 'postgres':
      return new PostgresAdapter({
        host: config.host,
        port: config.port,
        database: config.database || 'postgres',
        username,
        password,
        ssl: config.sslEnabled || false,
      });
    case 'mysql':
      return new MySQLAdapter({
        host: config.host,
        port: config.port,
        database: config.database,
        username,
        password,
        ssl: config.sslEnabled || false,
      });
    case 'redis':
      return new RedisAdapter({
        host: config.host,
        port: config.port,
        password: password || undefined,
        database: 0,
        tls: config.sslEnabled || false,
      });
    case 'mongodb':
      if (!config.database) {
        throw new DBConnectionError('Database name is required for MongoDB', 'INVALID_CONFIG');
      }
      return new MongoDBAdapter({
        connectionUri: config.connectionMode === 'local' ? config.connectionUri : undefined,
        host: config.host,
        port: config.port,
        database: config.database,
        username,
        password,
        authDatabase: config.authDatabase || 'admin',
        replicaSet: config.replicaSet,
        directConnection: config.directConnection,
        readPreference: config.readPreference,
        tls: config.sslEnabled || false,
      });
    default:
      throw new DBConnectionError(`Unsupported database type: ${config.type}`, 'UNSUPPORTED_DB_TYPE');
  }
}
