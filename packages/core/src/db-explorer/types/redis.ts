/**
 * Redis data types
 */
export type RedisDataType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'none';

/**
 * Redis key information
 */
export interface RedisKeyInfo {
  /** Key name */
  key: string;
  /** Data type */
  type: RedisDataType;
  /** Time to live in seconds (-1 = no expiry, -2 = expired) */
  ttl: number;
  /** Approximate memory usage in bytes */
  memoryUsage?: number;
  /** Number of elements (for collections) */
  length?: number;
}

/**
 * Redis scan result
 */
export interface RedisScanResult {
  /** Matched keys */
  keys: RedisKeyInfo[];
  /** Cursor for next scan (0 = complete) */
  nextCursor: string;
  /** Total keys scanned */
  scanned: number;
}

/**
 * Redis value types
 */
export type RedisValue =
  | string
  | Record<string, string>
  | string[]
  | Array<{ member: string; score: number }>;
