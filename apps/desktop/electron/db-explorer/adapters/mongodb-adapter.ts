/**
 * MongoDB Adapter
 *
 * Implements IMongoDBAdapter for document-oriented database operations.
 * Uses the official MongoDB Node.js driver.
 */

import { BSON, MongoClient, Db, Collection, ObjectId, Document, Filter } from 'mongodb';
import {
  CreateDatabaseUserOptions,
  DatabaseUserAccessLevel,
  IMongoDBAdapter,
  MongoDBAdapterConnectionConfig,
  MongoCollectionInfo,
  MongoDocument,
  MongoFindOptions,
  MongoAggregationStage,
  MongoIndexInfo,
} from './base-adapter';

/**
 * MongoDB Adapter Implementation
 */
export class MongoDBAdapter implements IMongoDBAdapter {
  readonly type = 'mongodb' as const;
  private config: MongoDBAdapterConnectionConfig;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connected = false;

  constructor(config: MongoDBAdapterConnectionConfig) {
    this.config = config;
  }

  /**
   * Build connection URI from config
   */
  private buildConnectionUri(): string {
    if (this.config.connectionUri) {
      return this.applyCredentialsToUri(this.config.connectionUri);
    }

    const {
      host = 'localhost',
      port = 27017,
      username,
      password,
      authDatabase = 'admin',
    } = this.config;

    let uri = 'mongodb://';

    if (username && password) {
      uri += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
    }

    uri += `${host}:${port}`;

    if (this.config.database) {
      uri += `/${this.config.database}`;
    }

    // Add query parameters
    const params: string[] = [];
    if (username && password) {
      params.push(`authSource=${authDatabase}`);
    }
    if (this.config.replicaSet) {
      params.push(`replicaSet=${this.config.replicaSet}`);
    }
    if (this.config.directConnection !== undefined) {
      params.push(`directConnection=${this.config.directConnection ? 'true' : 'false'}`);
    }
    if (this.config.readPreference) {
      params.push(`readPreference=${encodeURIComponent(this.config.readPreference)}`);
    }

    if (params.length > 0) {
      uri += `?${params.join('&')}`;
    }

    return uri;
  }

  private applyCredentialsToUri(uri: string): string {
    if (!this.config.username && !this.config.password) return uri;

    try {
      const url = new URL(uri);
      if (this.config.username && !url.username) {
        url.username = this.config.username;
      }
      if (this.config.password && !url.password) {
        url.password = this.config.password;
      }
      return url.toString();
    } catch {
      return uri;
    }
  }

  /**
   * Get current database
   */
  private getDb(): Db {
    if (!this.db) {
      throw new Error('Not connected to MongoDB');
    }
    return this.db;
  }

  /**
   * Get collection by name
   */
  private getCollection(name: string): Collection {
    return this.getDb().collection(name);
  }

  /**
   * Convert string ID to ObjectId filter
   * MongoDB IDs are typically ObjectId but can also be custom strings
   */
  private toObjectIdFilter(id: string): Filter<Document> {
    try {
      return { _id: new ObjectId(id) } as Filter<Document>;
    } catch {
      // Not a valid ObjectId format, try using string directly
      // Double cast needed because MongoDB driver types are strict
      return { _id: id } as unknown as Filter<Document>;
    }
  }

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const uri = this.buildConnectionUri();
      const tls = this.config.tls;
      this.client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        ...(tls
          ? {
              tls: true,
              tlsAllowInvalidCertificates: tls.rejectUnauthorized === false,
              ca: tls.ca,
              servername: tls.servername,
              checkServerIdentity: tls.checkServerIdentity,
            }
          : {}),
      });

      await this.client.connect();
      this.db = this.client.db(this.config.database);
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw new Error(
        `Failed to connect to MongoDB: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getDb().command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async getServerInfo(): Promise<{
    version: string;
    host: string;
    uptime: number;
    connections: number;
  }> {
    const result = await this.getDb().admin().serverStatus();
    return {
      version: result.version || 'unknown',
      host: result.host || 'unknown',
      uptime: result.uptime || 0,
      connections: result.connections?.current || 0,
    };
  }

  async getDbStats(): Promise<{
    collections: number;
    documents: number;
    dataSize: number;
    storageSize: number;
    indexes: number;
    indexSize: number;
  }> {
    const stats = await this.getDb().stats();
    return {
      collections: stats.collections || 0,
      documents: stats.objects || 0,
      dataSize: stats.dataSize || 0,
      storageSize: stats.storageSize || 0,
      indexes: stats.indexes || 0,
      indexSize: stats.indexSize || 0,
    };
  }

  // ============================================
  // DATABASE & COLLECTION OPERATIONS
  // ============================================

  async listDatabases(): Promise<Array<{ name: string; sizeOnDisk: number }>> {
    const result = await this.client!.db().admin().listDatabases();
    return result.databases.map((db) => ({
      name: db.name,
      sizeOnDisk: db.sizeOnDisk || 0,
    }));
  }

  async createUser(username: string, options: CreateDatabaseUserOptions): Promise<void> {
    const normalizedUsername = this.normalizeUserName(username);
    this.assertPassword(options.password);

    const database = options.database?.trim() || this.config.database;
    this.assertDatabaseName(database);
    const accessLevel = this.normalizeAccessLevel(options.accessLevel);
    const roles = this.getRolesForAccessLevel(accessLevel, database);

    try {
      await this.getUserDatabase(database).command({
        createUser: normalizedUsername,
        pwd: options.password,
        roles,
      });
    } catch (error) {
      const safeError = this.formatSafeError(error, [options.password]);
      throw new Error(`Failed to create user: ${safeError.message}`);
    }
  }

  async listCollections(): Promise<MongoCollectionInfo[]> {
    const collections = await this.getDb().listCollections().toArray();
    const result: MongoCollectionInfo[] = [];

    for (const coll of collections) {
      try {
        const stats = await this.getCollectionStats(coll.name);
        result.push(stats);
      } catch {
        // If stats fail, return basic info
        result.push({
          name: coll.name,
          type: coll.type === 'view' ? 'view' : 'collection',
          documentCount: 0,
          avgDocumentSize: 0,
          totalSize: 0,
          indexes: 0,
        });
      }
    }

    return result;
  }

  async getCollectionStats(collection: string): Promise<MongoCollectionInfo> {
    const stats = await this.getDb().command({ collStats: collection });
    const collInfo = await this.getDb().listCollections({ name: collection }).toArray();

    return {
      name: collection,
      type: collInfo[0]?.type === 'view' ? 'view' : 'collection',
      documentCount: stats.count || 0,
      avgDocumentSize: stats.avgObjSize || 0,
      totalSize: stats.totalSize || stats.size || 0,
      indexes: stats.nindexes || 0,
    };
  }

  async createCollection(
    name: string,
    options?: { capped?: boolean; size?: number }
  ): Promise<void> {
    await this.getDb().createCollection(name, options);
  }

  async dropCollection(collection: string): Promise<void> {
    await this.getDb().dropCollection(collection);
  }

  async renameCollection(oldName: string, newName: string): Promise<void> {
    await this.getDb().renameCollection(oldName, newName);
  }

  // ============================================
  // DOCUMENT OPERATIONS
  // ============================================

  async findDocuments(
    collection: string,
    options: MongoFindOptions = {}
  ): Promise<MongoDocument[]> {
    const { filter = {}, projection, sort, skip = 0, limit = 100 } = options;

    let cursor = this.getCollection(collection).find(filter);

    if (projection) {
      cursor = cursor.project(projection);
    }
    if (sort) {
      cursor = cursor.sort(sort);
    }
    if (skip > 0) {
      cursor = cursor.skip(skip);
    }
    if (limit > 0) {
      cursor = cursor.limit(limit);
    }

    const docs = await cursor.toArray();
    return docs.map((doc) => this.normalizeDocument(doc));
  }

  async findDocumentById(collection: string, id: string): Promise<MongoDocument | null> {
    const filter = this.toObjectIdFilter(id);
    const doc = await this.getCollection(collection).findOne(filter);
    return doc ? this.normalizeDocument(doc) : null;
  }

  async countDocuments(collection: string, filter: Record<string, unknown> = {}): Promise<number> {
    return this.getCollection(collection).countDocuments(filter);
  }

  async insertDocument(collection: string, document: Record<string, unknown>): Promise<string> {
    const result = await this.getCollection(collection).insertOne(document as Document);
    return result.insertedId.toString();
  }

  async insertDocuments(
    collection: string,
    documents: Array<Record<string, unknown>>
  ): Promise<string[]> {
    const result = await this.getCollection(collection).insertMany(documents as Document[]);
    return Object.values(result.insertedIds).map((id) => id.toString());
  }

  async updateDocumentById(
    collection: string,
    id: string,
    update: Record<string, unknown>,
    options: { upsert?: boolean; replace?: boolean } = {}
  ): Promise<number> {
    const filter = this.toObjectIdFilter(id);

    if (options.replace) {
      // Replace entire document (remove _id from update if present)
      const { _id, ...docWithoutId } = update;
      const result = await this.getCollection(collection).replaceOne(
        filter,
        docWithoutId as Document,
        {
          upsert: options.upsert,
        }
      );
      return result.modifiedCount + (result.upsertedCount || 0);
    } else {
      // Use $set operator for partial update
      const result = await this.getCollection(collection).updateOne(
        filter,
        { $set: update },
        { upsert: options.upsert }
      );
      return result.modifiedCount + (result.upsertedCount || 0);
    }
  }

  async updateDocuments(
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ): Promise<number> {
    const result = await this.getCollection(collection).updateMany(filter, { $set: update });
    return result.modifiedCount;
  }

  async deleteDocumentById(collection: string, id: string): Promise<number> {
    const filter = this.toObjectIdFilter(id);
    const result = await this.getCollection(collection).deleteOne(filter);
    return result.deletedCount;
  }

  async deleteDocuments(collection: string, filter: Record<string, unknown>): Promise<number> {
    const result = await this.getCollection(collection).deleteMany(filter);
    return result.deletedCount;
  }

  // ============================================
  // AGGREGATION
  // ============================================

  async aggregate(collection: string, pipeline: MongoAggregationStage[]): Promise<unknown[]> {
    // Extended JSON in the editor ({"$oid": ...}, {"$date": ...}) becomes real BSON values.
    const stages = BSON.EJSON.deserialize(pipeline, { relaxed: true }) as Document[];
    const docs = await this.getCollection(collection).aggregate(stages).toArray();
    return docs.map((doc) => this.normalizeDocument(doc));
  }

  async distinct(
    collection: string,
    field: string,
    filter: Record<string, unknown> = {}
  ): Promise<unknown[]> {
    return this.getCollection(collection).distinct(field, filter);
  }

  // ============================================
  // INDEX OPERATIONS
  // ============================================

  async listIndexes(collection: string): Promise<MongoIndexInfo[]> {
    const indexes = await this.getCollection(collection).indexes();
    return indexes.map((idx) => ({
      name: idx.name || '',
      key: idx.key as Record<string, 1 | -1 | 'text' | '2d' | '2dsphere'>,
      unique: idx.unique,
      sparse: idx.sparse,
      expireAfterSeconds: idx.expireAfterSeconds,
      background: idx.background,
    }));
  }

  async createIndex(
    collection: string,
    keys: Record<string, 1 | -1 | 'text'>,
    options?: { unique?: boolean; sparse?: boolean; expireAfterSeconds?: number; name?: string }
  ): Promise<string> {
    return this.getCollection(collection).createIndex(keys, options);
  }

  async dropIndex(collection: string, indexName: string): Promise<void> {
    await this.getCollection(collection).dropIndex(indexName);
  }

  // ============================================
  // RAW OPERATIONS
  // ============================================

  async runCommand(command: Record<string, unknown>): Promise<unknown> {
    return this.getDb().command(command as Document);
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Normalize a MongoDB document for JSON serialization
   * Converts ObjectId to string, handles special BSON types
   */
  private normalizeDocument(doc: Document): MongoDocument {
    const normalize = (value: unknown): unknown => {
      if (value === null || value === undefined) {
        return value;
      }

      // ObjectId -> string
      if (value instanceof ObjectId) {
        return value.toString();
      }

      // Date -> ISO string
      if (value instanceof Date) {
        return value.toISOString();
      }

      // Binary -> base64
      if (value && typeof value === 'object' && 'buffer' in value) {
        return `[Binary: ${(value as { buffer: Buffer }).buffer.length} bytes]`;
      }

      // Array
      if (Array.isArray(value)) {
        return value.map(normalize);
      }

      // Object
      if (typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = normalize(v);
        }
        return result;
      }

      // Primitive
      return value;
    };

    return normalize(doc) as MongoDocument;
  }

  private getUserDatabase(name: string): Db {
    if (!this.client) {
      throw new Error('Not connected to MongoDB');
    }
    return this.client.db(name);
  }

  private normalizeUserName(username: string): string {
    const normalized = username.trim();
    if (!normalized) {
      throw new Error('User name cannot be empty');
    }
    if (normalized.length > 128) {
      throw new Error('MongoDB user name cannot exceed 128 characters');
    }
    if (!/^[a-zA-Z0-9_.@-]+$/.test(normalized) || normalized.includes('\0')) {
      throw new Error('User name contains invalid characters');
    }
    return normalized;
  }

  private assertDatabaseName(database: string): void {
    if (!database.trim()) {
      throw new Error('Database name is required for MongoDB users');
    }
    if (database.length > 255 || database.includes('\0')) {
      throw new Error('Database name contains invalid characters');
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

  private getRolesForAccessLevel(
    accessLevel: DatabaseUserAccessLevel,
    database: string
  ): Array<{ role: string; db: string }> {
    if (accessLevel === 'login') {
      return [];
    }
    if (accessLevel === 'read') {
      return [{ role: 'read', db: database }];
    }
    if (accessLevel === 'admin') {
      return [{ role: 'dbOwner', db: database }];
    }
    return [{ role: 'readWrite', db: database }];
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

export default MongoDBAdapter;
