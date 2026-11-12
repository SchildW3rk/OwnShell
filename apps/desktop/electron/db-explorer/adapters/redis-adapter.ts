/**
 * Redis Database Adapter
 *
 * Implements IRedisAdapter interface using ioredis.
 * Provides full key-value store functionality with support for
 * strings, hashes, lists, sets, and sorted sets.
 */

import Redis from 'ioredis';
import { RedisKeyInfo, RedisScanResult, RedisDataType, DBConnectionError } from '@ownshell/core';
import {
  CreateDatabaseUserOptions,
  DatabaseUserAccessLevel,
  IRedisAdapter,
  RedisAdapterConnectionConfig,
} from './base-adapter';

/**
 * Redis Adapter implementation
 */
export class RedisAdapter implements IRedisAdapter {
  readonly type = 'redis' as const;
  private client: Redis | null = null;
  private config: RedisAdapterConnectionConfig;
  private connected = false;

  constructor(config: RedisAdapterConnectionConfig) {
    this.config = config;
  }

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    try {
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password || undefined,
        db: this.config.database || 0,
        tls: this.config.tls ? {} : undefined,
        lazyConnect: true,
        connectTimeout: 10000,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 200, 1000);
        },
      });

      // Listen for events
      this.client.on('error', (err) => {
        console.error('Redis error:', err);
      });

      await this.client.connect();
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw new DBConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to Redis',
        'REDIS_CONNECTION_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.client?.status === 'ready';
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.client) return false;
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  private ensureConnected(): Redis {
    if (!this.client || !this.connected) {
      throw new DBConnectionError('Not connected to Redis', 'NOT_CONNECTED');
    }
    return this.client;
  }

  // ============================================
  // SERVER INFO
  // ============================================

  async getServerInfo(): Promise<Record<string, string>> {
    const client = this.ensureConnected();
    const info = await client.info();

    // Parse INFO response into key-value pairs
    const result: Record<string, string> = {};
    const lines = info.split('\r\n');

    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value !== undefined) {
          result[key] = value;
        }
      }
    }

    return result;
  }

  async getDbStats(): Promise<{
    keys: number;
    expires: number;
    avgTtl: number;
    memoryUsed: number;
    memoryPeak: number;
  }> {
    const client = this.ensureConnected();
    const info = await this.getServerInfo();

    // Get key count for current database
    const dbIndex = this.config.database || 0;
    const dbKey = `db${dbIndex}`;
    let keys = 0;
    let expires = 0;
    let avgTtl = 0;

    if (info[dbKey]) {
      // Format: keys=123,expires=45,avg_ttl=6789
      const dbInfo = info[dbKey];
      const keysMatch = dbInfo.match(/keys=(\d+)/);
      const expiresMatch = dbInfo.match(/expires=(\d+)/);
      const avgTtlMatch = dbInfo.match(/avg_ttl=(\d+)/);

      if (keysMatch) keys = parseInt(keysMatch[1], 10);
      if (expiresMatch) expires = parseInt(expiresMatch[1], 10);
      if (avgTtlMatch) avgTtl = parseInt(avgTtlMatch[1], 10);
    }

    // Fallback: use DBSIZE if db info not available
    if (keys === 0) {
      keys = await client.dbsize();
    }

    return {
      keys,
      expires,
      avgTtl,
      memoryUsed: parseInt(info['used_memory'] || '0', 10),
      memoryPeak: parseInt(info['used_memory_peak'] || '0', 10),
    };
  }

  async createUser(username: string, options: CreateDatabaseUserOptions): Promise<void> {
    const client = this.ensureConnected();
    const normalizedUsername = this.normalizeUserName(username);
    this.assertPassword(options.password);

    const accessLevel = this.normalizeAccessLevel(options.accessLevel);
    const permissions = this.getAclPermissionsForAccessLevel(accessLevel);

    try {
      const existingUser = await client.call('ACL', 'GETUSER', normalizedUsername);
      if (existingUser) {
        throw new Error(`Redis ACL user '${normalizedUsername}' already exists`);
      }

      await client.call(
        'ACL',
        'SETUSER',
        normalizedUsername,
        'reset',
        'on',
        `>${options.password}`,
        ...permissions
      );
    } catch (error) {
      const safeError = this.formatSafeError(error, [options.password]);
      throw new Error(`Failed to create user: ${safeError.message}`);
    }
  }

  // ============================================
  // KEY OPERATIONS
  // ============================================

  async scanKeys(options: {
    pattern?: string;
    cursor?: string;
    count?: number;
    type?: RedisDataType;
  }): Promise<RedisScanResult> {
    const client = this.ensureConnected();
    const { pattern = '*', cursor = '0', count = 100, type } = options;

    // Build SCAN arguments
    const scanArgs: (string | number)[] = [cursor, 'MATCH', pattern, 'COUNT', count];
    if (type && type !== 'none') {
      scanArgs.push('TYPE', type);
    }

    const [nextCursor, rawKeys] = await client.scan(...(scanArgs as [string, ...any[]]));

    // Get detailed info for each key
    const keys: RedisKeyInfo[] = [];
    const pipeline = client.pipeline();

    for (const key of rawKeys) {
      pipeline.type(key);
      pipeline.ttl(key);
    }

    const results = await pipeline.exec();

    if (results) {
      for (let i = 0; i < rawKeys.length; i++) {
        const key = rawKeys[i];
        const typeResult = results[i * 2];
        const ttlResult = results[i * 2 + 1];

        keys.push({
          key,
          type: (typeResult?.[1] as RedisDataType) || 'none',
          ttl: (ttlResult?.[1] as number) ?? -1,
        });
      }
    }

    return {
      keys,
      nextCursor,
      scanned: rawKeys.length,
    };
  }

  async getKeyInfo(key: string): Promise<RedisKeyInfo> {
    const client = this.ensureConnected();

    const [type, ttl, memoryUsage] = await Promise.all([
      client.type(key),
      client.ttl(key),
      client.memory('USAGE', key).catch(() => null),
    ]);

    let length: number | undefined;

    // Get length based on type
    switch (type) {
      case 'string':
        length = await client.strlen(key);
        break;
      case 'hash':
        length = await client.hlen(key);
        break;
      case 'list':
        length = await client.llen(key);
        break;
      case 'set':
        length = await client.scard(key);
        break;
      case 'zset':
        length = await client.zcard(key);
        break;
    }

    return {
      key,
      type: type as RedisDataType,
      ttl,
      memoryUsage: memoryUsage as number | undefined,
      length,
    };
  }

  async getKeyType(key: string): Promise<RedisDataType> {
    const client = this.ensureConnected();
    const type = await client.type(key);
    return type as RedisDataType;
  }

  async deleteKeys(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const client = this.ensureConnected();
    return await client.del(...keys);
  }

  async renameKey(oldKey: string, newKey: string): Promise<void> {
    const client = this.ensureConnected();
    await client.rename(oldKey, newKey);
  }

  async exists(key: string): Promise<boolean> {
    const client = this.ensureConnected();
    const result = await client.exists(key);
    return result === 1;
  }

  // ============================================
  // TTL OPERATIONS
  // ============================================

  async getTtl(key: string): Promise<number> {
    const client = this.ensureConnected();
    return await client.ttl(key);
  }

  async setTtl(key: string, seconds: number): Promise<boolean> {
    const client = this.ensureConnected();
    const result = await client.expire(key, seconds);
    return result === 1;
  }

  async persist(key: string): Promise<boolean> {
    const client = this.ensureConnected();
    const result = await client.persist(key);
    return result === 1;
  }

  // ============================================
  // STRING OPERATIONS
  // ============================================

  async getString(key: string): Promise<string | null> {
    const client = this.ensureConnected();
    return await client.get(key);
  }

  async setString(key: string, value: string, ttl?: number): Promise<void> {
    const client = this.ensureConnected();
    if (ttl && ttl > 0) {
      await client.set(key, value, 'EX', ttl);
    } else {
      await client.set(key, value);
    }
  }

  // ============================================
  // HASH OPERATIONS
  // ============================================

  async getHash(key: string): Promise<Record<string, string>> {
    const client = this.ensureConnected();
    return await client.hgetall(key);
  }

  async getHashField(key: string, field: string): Promise<string | null> {
    const client = this.ensureConnected();
    return await client.hget(key, field);
  }

  async setHashFields(key: string, fields: Record<string, string>): Promise<void> {
    const client = this.ensureConnected();
    if (Object.keys(fields).length > 0) {
      await client.hset(key, fields);
    }
  }

  async deleteHashFields(key: string, fields: string[]): Promise<number> {
    if (fields.length === 0) return 0;
    const client = this.ensureConnected();
    return await client.hdel(key, ...fields);
  }

  async getHashLength(key: string): Promise<number> {
    const client = this.ensureConnected();
    return await client.hlen(key);
  }

  // ============================================
  // LIST OPERATIONS
  // ============================================

  async getList(key: string, start = 0, stop = -1): Promise<string[]> {
    const client = this.ensureConnected();
    return await client.lrange(key, start, stop);
  }

  async getListLength(key: string): Promise<number> {
    const client = this.ensureConnected();
    return await client.llen(key);
  }

  async listPush(key: string, values: string[], direction: 'left' | 'right'): Promise<number> {
    if (values.length === 0) return 0;
    const client = this.ensureConnected();
    if (direction === 'left') {
      return await client.lpush(key, ...values);
    } else {
      return await client.rpush(key, ...values);
    }
  }

  async listPop(key: string, direction: 'left' | 'right'): Promise<string | null> {
    const client = this.ensureConnected();
    if (direction === 'left') {
      return await client.lpop(key);
    } else {
      return await client.rpop(key);
    }
  }

  async listSet(key: string, index: number, value: string): Promise<void> {
    const client = this.ensureConnected();
    await client.lset(key, index, value);
  }

  async listRemove(key: string, count: number, value: string): Promise<number> {
    const client = this.ensureConnected();
    return await client.lrem(key, count, value);
  }

  // ============================================
  // SET OPERATIONS
  // ============================================

  async getSet(key: string): Promise<string[]> {
    const client = this.ensureConnected();
    return await client.smembers(key);
  }

  async getSetSize(key: string): Promise<number> {
    const client = this.ensureConnected();
    return await client.scard(key);
  }

  async setAdd(key: string, members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    const client = this.ensureConnected();
    return await client.sadd(key, ...members);
  }

  async setRemove(key: string, members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    const client = this.ensureConnected();
    return await client.srem(key, ...members);
  }

  async setIsMember(key: string, member: string): Promise<boolean> {
    const client = this.ensureConnected();
    const result = await client.sismember(key, member);
    return result === 1;
  }

  // ============================================
  // SORTED SET OPERATIONS
  // ============================================

  async getZSet(
    key: string,
    start = 0,
    stop = -1,
    reverse = false
  ): Promise<Array<{ member: string; score: number }>> {
    const client = this.ensureConnected();

    let result: string[];
    if (reverse) {
      result = await client.zrevrange(key, start, stop, 'WITHSCORES');
    } else {
      result = await client.zrange(key, start, stop, 'WITHSCORES');
    }

    // Parse result: [member1, score1, member2, score2, ...]
    const members: Array<{ member: string; score: number }> = [];
    for (let i = 0; i < result.length; i += 2) {
      members.push({
        member: result[i],
        score: parseFloat(result[i + 1]),
      });
    }

    return members;
  }

  async getZSetSize(key: string): Promise<number> {
    const client = this.ensureConnected();
    return await client.zcard(key);
  }

  async zSetAdd(key: string, members: Array<{ member: string; score: number }>): Promise<number> {
    if (members.length === 0) return 0;
    const client = this.ensureConnected();

    // Build args: [score1, member1, score2, member2, ...]
    const args: (string | number)[] = [];
    for (const { score, member } of members) {
      args.push(score, member);
    }

    return await client.zadd(key, ...(args as [number, string, ...(string | number)[]]));
  }

  async zSetRemove(key: string, members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    const client = this.ensureConnected();
    return await client.zrem(key, ...members);
  }

  async zSetScore(key: string, member: string): Promise<number | null> {
    const client = this.ensureConnected();
    const score = await client.zscore(key, member);
    return score !== null ? parseFloat(score) : null;
  }

  // ============================================
  // RAW COMMAND EXECUTION
  // ============================================

  async executeCommand(command: string, args: string[]): Promise<unknown> {
    const client = this.ensureConnected();
    return await client.call(command, ...args);
  }

  private normalizeUserName(username: string): string {
    const normalized = username.trim();
    if (!normalized) {
      throw new Error('User name cannot be empty');
    }
    if (normalized.length > 128) {
      throw new Error('Redis ACL user name cannot exceed 128 characters');
    }
    if (!/^[a-zA-Z0-9_.@-]+$/.test(normalized) || normalized.includes('\0')) {
      throw new Error('User name contains invalid characters');
    }
    return normalized;
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

  private getAclPermissionsForAccessLevel(accessLevel: DatabaseUserAccessLevel): string[] {
    if (accessLevel === 'login') {
      return ['resetkeys', 'resetchannels', '-@all'];
    }
    if (accessLevel === 'read') {
      return ['allkeys', 'resetchannels', '-@all', '+@read', '+ping', '+select'];
    }
    if (accessLevel === 'admin') {
      return ['allcommands', 'allkeys', 'allchannels'];
    }
    return ['allkeys', 'resetchannels', '-@all', '+@read', '+@write', '+ping', '+select'];
  }

  private formatSafeError(error: unknown, redactions: string[] = []): { message: string } {
    const message = error instanceof Error ? error.message : String(error);
    return { message: this.redactSecrets(message, redactions) };
  }

  private redactSecrets(message: string, secrets: string[]): string {
    return secrets
      .filter((secret) => secret.length > 0)
      .reduce((current, secret) => current.split(secret).join('[redacted]'), message);
  }
}
