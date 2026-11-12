import { dbConnectionManager } from '../../db-explorer/connection-manager';
import { readOnlyFailure } from '../../db-explorer/read-only-guard';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { connectionOnlySchema, redisKeySchema, redisScanKeysSchema, redisSetStringSchema, redisHashSchema, redisHashDeleteSchema, redisListPushSchema, redisListPopSchema, redisListSetSchema, redisMembersSchema, redisZSetAddSchema, redisDeleteKeysSchema, redisRenameKeySchema, redisSetTtlSchema, redisExecuteSchema } from '../schemas/database-explorer';

export function setupRedisHandlers() {
  // ============================================
  // REDIS-SPECIFIC HANDLERS
  // ============================================

  /**
   * Redis: Get server info and stats
   */
  safeHandle('redis:server-info', connectionOnlySchema, async (_event, params) => {
    try {
      const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
      const [serverInfo, dbStats] = await Promise.all([
        adapter.getServerInfo(),
        adapter.getDbStats(),
      ]);
      return { success: true, serverInfo, dbStats };
    } catch (error) {
      logger.error('Failed to get Redis server info', params, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get server info',
      };
    }
  });

  /**
   * Redis: Scan keys with pattern matching
   */
  safeHandle(
    'redis:scan-keys',
    redisScanKeysSchema,
    async (_event, params) => {
      try {
        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const result = await adapter.scanKeys({
          pattern: params.pattern,
          cursor: params.cursor,
          count: params.count,
          type: params.type,
        });
        return { success: true, result };
      } catch (error) {
        logger.error('Failed to scan Redis keys', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to scan keys',
        };
      }
    }
  );

  /**
   * Redis: Get key info
   */
  safeHandle(
    'redis:key-info',
    redisKeySchema,
    async (_event, params) => {
      try {
        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const keyInfo = await adapter.getKeyInfo(params.key);
        return { success: true, keyInfo };
      } catch (error) {
        logger.error('Failed to get Redis key info', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get key info',
        };
      }
    }
  );

  /**
   * Redis: Get value by key (type-aware)
   */
  safeHandle(
    'redis:get-value',
    redisKeySchema,
    async (_event, params) => {
      try {
        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const keyType = await adapter.getKeyType(params.key);

        let value: unknown;
        switch (keyType) {
          case 'string':
            value = await adapter.getString(params.key);
            break;
          case 'hash':
            value = await adapter.getHash(params.key);
            break;
          case 'list':
            value = await adapter.getList(params.key);
            break;
          case 'set':
            value = await adapter.getSet(params.key);
            break;
          case 'zset':
            value = await adapter.getZSet(params.key);
            break;
          default:
            value = null;
        }

        const ttl = await adapter.getTtl(params.key);

        return { success: true, type: keyType, value, ttl };
      } catch (error) {
        logger.error('Failed to get Redis value', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get value',
        };
      }
    }
  );

  /**
   * Redis: Set string value
   */
  safeHandle(
    'redis:set-string',
    redisSetStringSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        await adapter.setString(params.key, params.value, params.ttl);
        return { success: true };
      } catch (error) {
        logger.error('Failed to set Redis string', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set string',
        };
      }
    }
  );

  /**
   * Redis: Set hash fields
   */
  safeHandle(
    'redis:set-hash',
    redisHashSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        await adapter.setHashFields(params.key, params.fields);
        return { success: true };
      } catch (error) {
        logger.error('Failed to set Redis hash', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set hash',
        };
      }
    }
  );

  /**
   * Redis: Delete hash fields
   */
  safeHandle(
    'redis:delete-hash-fields',
    redisHashDeleteSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const deleted = await adapter.deleteHashFields(params.key, params.fields);
        return { success: true, deleted };
      } catch (error) {
        logger.error('Failed to delete Redis hash fields', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete hash fields',
        };
      }
    }
  );

  /**
   * Redis: List operations
   */
  safeHandle(
    'redis:list-push',
    redisListPushSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const length = await adapter.listPush(params.key, params.values, params.direction);
        return { success: true, length };
      } catch (error) {
        logger.error('Failed to push to Redis list', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to push to list',
        };
      }
    }
  );

  safeHandle(
    'redis:list-pop',
    redisListPopSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const value = await adapter.listPop(params.key, params.direction);
        return { success: true, value };
      } catch (error) {
        logger.error('Failed to pop from Redis list', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to pop from list',
        };
      }
    }
  );

  safeHandle(
    'redis:list-set',
    redisListSetSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        await adapter.listSet(params.key, params.index, params.value);
        return { success: true };
      } catch (error) {
        logger.error('Failed to set Redis list item', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set list item',
        };
      }
    }
  );

  /**
   * Redis: Set operations
   */
  safeHandle(
    'redis:set-add',
    redisMembersSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const added = await adapter.setAdd(params.key, params.members);
        return { success: true, added };
      } catch (error) {
        logger.error('Failed to add to Redis set', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add to set',
        };
      }
    }
  );

  safeHandle(
    'redis:set-remove',
    redisMembersSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const removed = await adapter.setRemove(params.key, params.members);
        return { success: true, removed };
      } catch (error) {
        logger.error('Failed to remove from Redis set', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove from set',
        };
      }
    }
  );

  /**
   * Redis: Sorted set operations
   */
  safeHandle(
    'redis:zset-add',
    redisZSetAddSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const added = await adapter.zSetAdd(params.key, params.members);
        return { success: true, added };
      } catch (error) {
        logger.error('Failed to add to Redis sorted set', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add to sorted set',
        };
      }
    }
  );

  safeHandle(
    'redis:zset-remove',
    redisMembersSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const removed = await adapter.zSetRemove(params.key, params.members);
        return { success: true, removed };
      } catch (error) {
        logger.error('Failed to remove from Redis sorted set', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove from sorted set',
        };
      }
    }
  );

  /**
   * Redis: Delete keys
   */
  safeHandle(
    'redis:delete-keys',
    redisDeleteKeysSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const deleted = await adapter.deleteKeys(params.keys);
        return { success: true, deleted };
      } catch (error) {
        logger.error('Failed to delete Redis keys', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete keys',
        };
      }
    }
  );

  /**
   * Redis: Rename key
   */
  safeHandle(
    'redis:rename-key',
    redisRenameKeySchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        await adapter.renameKey(params.oldKey, params.newKey);
        return { success: true };
      } catch (error) {
        logger.error('Failed to rename Redis key', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to rename key',
        };
      }
    }
  );

  /**
   * Redis: Set TTL
   */
  safeHandle(
    'redis:set-ttl',
    redisSetTtlSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const result = await adapter.setTtl(params.key, params.seconds);
        return { success: true, result };
      } catch (error) {
        logger.error('Failed to set Redis TTL', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set TTL',
        };
      }
    }
  );

  /**
   * Redis: Remove TTL (persist)
   */
  safeHandle('redis:persist', redisKeySchema, async (_event, params) => {
    try {
      if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

      const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
      const result = await adapter.persist(params.key);
      return { success: true, result };
    } catch (error) {
      logger.error('Failed to persist Redis key', params, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to persist key',
      };
    }
  });

  /**
   * Redis: Execute raw command
   */
  safeHandle(
    'redis:execute',
    redisExecuteSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getRedisAdapter(params.connectionId);
        const result = await adapter.executeCommand(params.command, params.args);
        return { success: true, result };
      } catch (error) {
        logger.error('Failed to execute Redis command', error, { connectionId: params.connectionId });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to execute command',
        };
      }
    }
  );


}
