import type { DBConnectionConfig } from './connection';

/**
 * MongoDB connection configuration
 * Extends base config with NoSQL-specific options
 */
export interface MongoDBConnectionConfig extends DBConnectionConfig {
  type: 'mongodb';
  /** Authentication database (default: 'admin') */
  authDatabase?: string;
  /** Replica set name */
  replicaSet?: string;
  /** Full connection URI (alternative to host/port) */
  connectionUri?: string;
  /** Direct connection (bypass replica set discovery) */
  directConnection?: boolean;
  /** Read preference */
  readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
}

/**
 * MongoDB collection info
 */
export interface MongoCollectionInfo {
  /** Collection name */
  name: string;
  /** Document count */
  count: number;
  /** Average document size in bytes */
  avgObjSize?: number;
  /** Total size in bytes */
  size?: number;
  /** Whether collection is capped */
  capped: boolean;
}

/**
 * MongoDB document with metadata
 */
export interface MongoDocument {
  /** Document ID */
  _id: string;
  /** Document data */
  [key: string]: unknown;
}

/**
 * MongoDB query options
 */
export interface MongoQueryOptions {
  /** Filter query */
  filter?: Record<string, unknown>;
  /** Projection (fields to include/exclude) */
  projection?: Record<string, 0 | 1>;
  /** Sort order */
  sort?: Record<string, 1 | -1>;
  /** Number of documents to skip */
  skip?: number;
  /** Maximum number of documents to return */
  limit?: number;
}

/**
 * MongoDB aggregation pipeline stage
 */
export type MongoPipelineStage = Record<string, unknown>;
