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
import { buildTlsOptions, type DbSslMode } from './tls-options';
import type { AnyAdapter } from './types';

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

/** Stored connection config plus the decrypted SSL settings (see tls-options.ts). */
export type NetworkAdapterConfig = DBConnectionConfig & { sslMode?: DbSslMode; sslCa?: string };

export function createNetworkAdapter(
  config: NetworkAdapterConfig,
  effectiveHost: string,
  effectivePort: number
): AnyAdapter {
  const tunneled = effectiveHost !== config.host;
  const tls = buildTlsOptions(config.sslMode, {
    ca: config.sslCa,
    verifyHost: tunneled && config.host ? config.host : undefined,
  });

  if (config.type === 'redis') {
    return new RedisAdapter({
      host: effectiveHost,
      port: effectivePort,
      password: config.password,
      database: 0,
      tls,
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
      tls,
    });
  }

  return createSQLAdapter(config.type, {
    host: effectiveHost,
    port: effectivePort,
    database: config.database,
    username: config.username,
    password: config.password,
    ssl: tls,
    tlsHost: tunneled && config.host ? config.host : undefined,
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
