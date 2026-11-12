import type { RedisDataType, RedisKeyInfo, RedisScanResult, RedisValue } from '@ownshell/core';
import type { ConnectionOptions } from 'node:tls';
import type { CreateDatabaseUserOptions } from './database-user-types';

/**
 * Redis connection configuration
 */
export interface RedisAdapterConnectionConfig {
  host: string;
  port: number;
  password?: string;
  database?: number; // Redis DB index (0-15)
  /** Node TLS options from buildTlsOptions(); undefined = no TLS */
  tls?: ConnectionOptions;
}

/**
 * Interface for Redis database adapter
 * Redis is a key-value store with different operations than SQL databases
 */
export interface IRedisAdapter {
  readonly type: 'redis';

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  testConnection(): Promise<boolean>;

  getServerInfo(): Promise<Record<string, string>>;
  getDbStats(): Promise<{
    keys: number;
    expires: number;
    avgTtl: number;
    memoryUsed: number;
    memoryPeak: number;
  }>;

  createUser(username: string, options: CreateDatabaseUserOptions): Promise<void>;

  scanKeys(options: {
    pattern?: string;
    cursor?: string;
    count?: number;
    type?: RedisDataType;
  }): Promise<RedisScanResult>;
  getKeyInfo(key: string): Promise<RedisKeyInfo>;
  getKeyType(key: string): Promise<RedisDataType>;
  deleteKeys(keys: string[]): Promise<number>;
  renameKey(oldKey: string, newKey: string): Promise<void>;
  exists(key: string): Promise<boolean>;

  getTtl(key: string): Promise<number>;
  setTtl(key: string, seconds: number): Promise<boolean>;
  persist(key: string): Promise<boolean>;

  getString(key: string): Promise<string | null>;
  setString(key: string, value: string, ttl?: number): Promise<void>;

  getHash(key: string): Promise<Record<string, string>>;
  getHashField(key: string, field: string): Promise<string | null>;
  setHashFields(key: string, fields: Record<string, string>): Promise<void>;
  deleteHashFields(key: string, fields: string[]): Promise<number>;
  getHashLength(key: string): Promise<number>;

  getList(key: string, start?: number, stop?: number): Promise<string[]>;
  getListLength(key: string): Promise<number>;
  listPush(key: string, values: string[], direction: 'left' | 'right'): Promise<number>;
  listPop(key: string, direction: 'left' | 'right'): Promise<string | null>;
  listSet(key: string, index: number, value: string): Promise<void>;
  listRemove(key: string, count: number, value: string): Promise<number>;

  getSet(key: string): Promise<string[]>;
  getSetSize(key: string): Promise<number>;
  setAdd(key: string, members: string[]): Promise<number>;
  setRemove(key: string, members: string[]): Promise<number>;
  setIsMember(key: string, member: string): Promise<boolean>;

  getZSet(
    key: string,
    start?: number,
    stop?: number,
    reverse?: boolean
  ): Promise<Array<{ member: string; score: number }>>;
  getZSetSize(key: string): Promise<number>;
  zSetAdd(key: string, members: Array<{ member: string; score: number }>): Promise<number>;
  zSetRemove(key: string, members: string[]): Promise<number>;
  zSetScore(key: string, member: string): Promise<number | null>;

  executeCommand(command: string, args: string[]): Promise<unknown>;
}

export type { RedisDataType, RedisKeyInfo, RedisScanResult, RedisValue };
