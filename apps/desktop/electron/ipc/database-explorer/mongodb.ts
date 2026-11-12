import { dbConnectionManager } from '../../db-explorer/connection-manager';
import type { MongoDocument, MongoDocumentSnapshot } from '../../db-explorer/adapters/mongodb-adapter-types';
import { mongoPipelineWrites, readOnlyFailure } from '../../db-explorer/read-only-guard';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { connectionOnlySchema, mongoCollectionSchema, mongoCreateCollectionSchema, mongoFindDocumentsSchema, mongoDocumentIdSchema, mongoFilterSchema, mongoRequiredFilterSchema, mongoInsertDocumentSchema, mongoUpdateDocumentSchema, mongoAggregateSchema, mongoCreateIndexSchema, mongoDropIndexSchema, mongoRunCommandSchema } from '../schemas/database-explorer';

function snapshotDocument(document: MongoDocument): MongoDocumentSnapshot {
  return { _id: document._id, fieldNames: Object.keys(document), json: JSON.stringify(document) };
}

export function setupMongoDBHandlers() {
  // ============================================
  // MONGODB-SPECIFIC HANDLERS
  // ============================================

  /**
   * MongoDB: Get server info and stats
   */
  safeHandle('mongodb:server-info', connectionOnlySchema, async (_event, params) => {
    try {
      const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
      const [serverInfo, dbStats] = await Promise.all([
        adapter.getServerInfo(),
        adapter.getDbStats(),
      ]);
      return { success: true, serverInfo, dbStats };
    } catch (error) {
      logger.error('Failed to get MongoDB server info', params, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get server info',
      };
    }
  });

  /**
   * MongoDB: List databases
   */
  safeHandle('mongodb:list-databases', connectionOnlySchema, async (_event, params) => {
    try {
      const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
      const databases = await adapter.listDatabases();
      return { success: true, databases };
    } catch (error) {
      logger.error('Failed to list MongoDB databases', params, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list databases',
      };
    }
  });

  /**
   * MongoDB: List collections
   */
  safeHandle('mongodb:list-collections', connectionOnlySchema, async (_event, params) => {
    try {
      const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
      const collections = await adapter.listCollections();
      return { success: true, collections };
    } catch (error) {
      logger.error('Failed to list MongoDB collections', params, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list collections',
      };
    }
  });

  /**
   * MongoDB: Get collection stats
   */
  safeHandle(
    'mongodb:collection-stats',
    mongoCollectionSchema,
    async (_event, params) => {
      try {
        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const stats = await adapter.getCollectionStats(params.collection);
        return { success: true, stats };
      } catch (error) {
        logger.error('Failed to get MongoDB collection stats', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get collection stats',
        };
      }
    }
  );

  /**
   * MongoDB: Create collection
   */
  safeHandle(
    'mongodb:create-collection',
    mongoCreateCollectionSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        await adapter.createCollection(params.name, params.options);
        return { success: true };
      } catch (error) {
        logger.error('Failed to create MongoDB collection', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create collection',
        };
      }
    }
  );

  /**
   * MongoDB: Drop collection
   */
  safeHandle(
    'mongodb:drop-collection',
    mongoCollectionSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        await adapter.dropCollection(params.collection);
        return { success: true };
      } catch (error) {
        logger.error('Failed to drop MongoDB collection', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to drop collection',
        };
      }
    }
  );

  /**
   * MongoDB: Find documents
   */
  safeHandle(
    'mongodb:find-documents',
    mongoFindDocumentsSchema,
    async (_event, params) => {
      try {
        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const documents = await adapter.findDocuments(params.collection, {
          filter: params.filter,
          projection: params.projection,
          sort: params.sort,
          skip: params.skip,
          limit: params.limit,
        });
        return { success: true, documents: documents.map(snapshotDocument) };
      } catch (error) {
        logger.error('Failed to find MongoDB documents', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to find documents',
        };
      }
    }
  );

  /**
   * MongoDB: Find document by ID
   */
  safeHandle(
    'mongodb:find-document-by-id',
    mongoDocumentIdSchema,
    async (_event, params) => {
      try {
        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const document = await adapter.findDocumentById(params.collection, params.id);
        return { success: true, document: document ? snapshotDocument(document) : null };
      } catch (error) {
        logger.error('Failed to find MongoDB document by ID', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to find document',
        };
      }
    }
  );

  /**
   * MongoDB: Count documents
   */
  safeHandle(
    'mongodb:count-documents',
    mongoFilterSchema,
    async (_event, params) => {
      try {
        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const count = await adapter.countDocuments(params.collection, params.filter);
        return { success: true, count };
      } catch (error) {
        logger.error('Failed to count MongoDB documents', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to count documents',
        };
      }
    }
  );

  /**
   * MongoDB: Insert document
   */
  safeHandle(
    'mongodb:insert-document',
    mongoInsertDocumentSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const insertedId = await adapter.insertDocument(params.collection, params.document);
        return { success: true, insertedId };
      } catch (error) {
        logger.error('Failed to insert MongoDB document', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to insert document',
        };
      }
    }
  );

  /**
   * MongoDB: Update document by ID
   */
  safeHandle(
    'mongodb:update-document',
    mongoUpdateDocumentSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const modifiedCount = await adapter.updateDocumentById(
          params.collection,
          params.id,
          params.update,
          params.options
        );
        return { success: true, modifiedCount };
      } catch (error) {
        logger.error('Failed to update MongoDB document', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update document',
        };
      }
    }
  );

  /**
   * MongoDB: Delete document by ID
   */
  safeHandle(
    'mongodb:delete-document',
    mongoDocumentIdSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const deletedCount = await adapter.deleteDocumentById(params.collection, params.id);
        return { success: true, deletedCount };
      } catch (error) {
        logger.error('Failed to delete MongoDB document', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete document',
        };
      }
    }
  );

  /**
   * MongoDB: Delete multiple documents
   */
  safeHandle(
    'mongodb:delete-documents',
    mongoRequiredFilterSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const deletedCount = await adapter.deleteDocuments(params.collection, params.filter);
        return { success: true, deletedCount };
      } catch (error) {
        logger.error('Failed to delete MongoDB documents', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete documents',
        };
      }
    }
  );

  /**
   * MongoDB: Run aggregation pipeline
   */
  safeHandle(
    'mongodb:aggregate',
    mongoAggregateSchema,
    async (_event, params) => {
      try {
        if (
          dbConnectionManager.isReadOnly(params.connectionId) &&
          mongoPipelineWrites(params.pipeline)
        ) {
          return readOnlyFailure();
        }

        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const results = await adapter.aggregate(params.collection, params.pipeline);
        return { success: true, results };
      } catch (error) {
        logger.error('Failed to run MongoDB aggregation', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to run aggregation',
        };
      }
    }
  );

  /**
   * MongoDB: List indexes
   */
  safeHandle(
    'mongodb:list-indexes',
    mongoCollectionSchema,
    async (_event, params) => {
      try {
        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const indexes = await adapter.listIndexes(params.collection);
        return { success: true, indexes };
      } catch (error) {
        logger.error('Failed to list MongoDB indexes', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list indexes',
        };
      }
    }
  );

  /**
   * MongoDB: Create index
   */
  safeHandle(
    'mongodb:create-index',
    mongoCreateIndexSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const indexName = await adapter.createIndex(params.collection, params.keys, params.options);
        return { success: true, indexName };
      } catch (error) {
        logger.error('Failed to create MongoDB index', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create index',
        };
      }
    }
  );

  /**
   * MongoDB: Drop index
   */
  safeHandle(
    'mongodb:drop-index',
    mongoDropIndexSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        await adapter.dropIndex(params.collection, params.indexName);
        return { success: true };
      } catch (error) {
        logger.error('Failed to drop MongoDB index', params, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to drop index',
        };
      }
    }
  );

  /**
   * MongoDB: Run command
   */
  safeHandle(
    'mongodb:run-command',
    mongoRunCommandSchema,
    async (_event, params) => {
      try {
        if (dbConnectionManager.isReadOnly(params.connectionId)) return readOnlyFailure();

        const adapter = dbConnectionManager.getMongoDBAdapter(params.connectionId);
        const result = await adapter.runCommand(params.command);
        return { success: true, result };
      } catch (error) {
        logger.error('Failed to run MongoDB command', error, { connectionId: params.connectionId });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to run command',
        };
      }
    }
  );


}
