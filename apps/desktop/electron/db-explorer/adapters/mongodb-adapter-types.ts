import type { ConnectionOptions } from 'node:tls';
import type { CreateDatabaseUserOptions } from './database-user-types';

/**
 * MongoDB connection configuration
 */
export interface MongoDBAdapterConnectionConfig {
  /** Connection URI (mongodb://...) or individual parts */
  connectionUri?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  /** Database name */
  database: string;
  /** Auth source database (default: admin) */
  authDatabase?: string;
  /** Node TLS options from buildTlsOptions(); undefined = no TLS */
  tls?: ConnectionOptions;
  /** Replica set name */
  replicaSet?: string;
  /** Force direct connection */
  directConnection?: boolean;
  /** Read preference */
  readPreference?: string;
}

export interface MongoCollectionInfo {
  name: string;
  type: 'collection' | 'view';
  documentCount: number;
  avgDocumentSize: number;
  totalSize: number;
  indexes: number;
}

export interface MongoDocument {
  _id: string;
  [key: string]: unknown;
}

/** Complete normalized snapshot; flat JSON avoids deeply cloning its graph across contextBridge. */
export interface MongoDocumentSnapshot {
  _id: string;
  fieldNames: readonly string[];
  json: string;
}

export interface MongoFindOptions {
  filter?: Record<string, unknown>;
  projection?: Record<string, number>;
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
}

export type MongoAggregationStage = Record<string, unknown>;

export interface MongoIndexInfo {
  name: string;
  key: Record<string, 1 | -1 | 'text' | '2d' | '2dsphere'>;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  background?: boolean;
}

export interface IMongoDBAdapter {
  readonly type: 'mongodb';

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  testConnection(): Promise<boolean>;

  getServerInfo(): Promise<{
    version: string;
    host: string;
    uptime: number;
    connections: number;
  }>;

  getDbStats(): Promise<{
    collections: number;
    documents: number;
    dataSize: number;
    storageSize: number;
    indexes: number;
    indexSize: number;
  }>;

  listDatabases(): Promise<Array<{ name: string; sizeOnDisk: number }>>;
  createUser(username: string, options: CreateDatabaseUserOptions): Promise<void>;
  listCollections(): Promise<MongoCollectionInfo[]>;
  getCollectionStats(collection: string): Promise<MongoCollectionInfo>;
  createCollection(name: string, options?: { capped?: boolean; size?: number }): Promise<void>;
  dropCollection(collection: string): Promise<void>;
  renameCollection(oldName: string, newName: string): Promise<void>;

  findDocuments(collection: string, options?: MongoFindOptions): Promise<MongoDocument[]>;
  findDocumentById(collection: string, id: string): Promise<MongoDocument | null>;
  countDocuments(collection: string, filter?: Record<string, unknown>): Promise<number>;
  insertDocument(collection: string, document: Record<string, unknown>): Promise<string>;
  insertDocuments(collection: string, documents: Array<Record<string, unknown>>): Promise<string[]>;
  updateDocumentById(
    collection: string,
    id: string,
    update: Record<string, unknown>,
    options?: { upsert?: boolean; replace?: boolean }
  ): Promise<number>;
  updateDocuments(
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ): Promise<number>;
  deleteDocumentById(collection: string, id: string): Promise<number>;
  deleteDocuments(collection: string, filter: Record<string, unknown>): Promise<number>;

  aggregate(collection: string, pipeline: MongoAggregationStage[]): Promise<unknown[]>;
  distinct(collection: string, field: string, filter?: Record<string, unknown>): Promise<unknown[]>;

  listIndexes(collection: string): Promise<MongoIndexInfo[]>;
  createIndex(
    collection: string,
    keys: Record<string, 1 | -1 | 'text'>,
    options?: { unique?: boolean; sparse?: boolean; expireAfterSeconds?: number; name?: string }
  ): Promise<string>;
  dropIndex(collection: string, indexName: string): Promise<void>;

  runCommand(command: Record<string, unknown>): Promise<unknown>;
}
