import type { IpcRenderer } from 'electron';
import type { MongoDocumentSnapshot } from '../db-explorer/adapters/mongodb-adapter-types';

export function createRedisApi(ipcRenderer: IpcRenderer) {
  return {
    // Server info
    serverInfo: (connectionId: string) => ipcRenderer.invoke('redis:server-info', { connectionId }),

    // Key operations
    scanKeys: (params: {
      connectionId: string;
      pattern?: string;
      cursor?: string;
      count?: number;
      type?: 'string' | 'hash' | 'list' | 'set' | 'zset';
    }) => ipcRenderer.invoke('redis:scan-keys', params),

    keyInfo: (connectionId: string, key: string) =>
      ipcRenderer.invoke('redis:key-info', { connectionId, key }),

    getValue: (connectionId: string, key: string) =>
      ipcRenderer.invoke('redis:get-value', { connectionId, key }),

    deleteKeys: (connectionId: string, keys: string[]) =>
      ipcRenderer.invoke('redis:delete-keys', { connectionId, keys }),

    renameKey: (connectionId: string, oldKey: string, newKey: string) =>
      ipcRenderer.invoke('redis:rename-key', { connectionId, oldKey, newKey }),

    // TTL operations
    setTtl: (connectionId: string, key: string, seconds: number) =>
      ipcRenderer.invoke('redis:set-ttl', { connectionId, key, seconds }),

    persist: (connectionId: string, key: string) =>
      ipcRenderer.invoke('redis:persist', { connectionId, key }),

    // String operations
    setString: (connectionId: string, key: string, value: string, ttl?: number) =>
      ipcRenderer.invoke('redis:set-string', { connectionId, key, value, ttl }),

    // Hash operations
    setHash: (connectionId: string, key: string, fields: Record<string, string>) =>
      ipcRenderer.invoke('redis:set-hash', { connectionId, key, fields }),

    deleteHashFields: (connectionId: string, key: string, fields: string[]) =>
      ipcRenderer.invoke('redis:delete-hash-fields', { connectionId, key, fields }),

    // List operations
    listPush: (connectionId: string, key: string, values: string[], direction: 'left' | 'right') =>
      ipcRenderer.invoke('redis:list-push', { connectionId, key, values, direction }),

    listPop: (connectionId: string, key: string, direction: 'left' | 'right') =>
      ipcRenderer.invoke('redis:list-pop', { connectionId, key, direction }),

    listSet: (connectionId: string, key: string, index: number, value: string) =>
      ipcRenderer.invoke('redis:list-set', { connectionId, key, index, value }),

    // Set operations
    setAdd: (connectionId: string, key: string, members: string[]) =>
      ipcRenderer.invoke('redis:set-add', { connectionId, key, members }),

    setRemove: (connectionId: string, key: string, members: string[]) =>
      ipcRenderer.invoke('redis:set-remove', { connectionId, key, members }),

    // Sorted set operations
    zsetAdd: (
      connectionId: string,
      key: string,
      members: Array<{ member: string; score: number }>
    ) => ipcRenderer.invoke('redis:zset-add', { connectionId, key, members }),

    zsetRemove: (connectionId: string, key: string, members: string[]) =>
      ipcRenderer.invoke('redis:zset-remove', { connectionId, key, members }),

    // Raw command execution
    execute: (connectionId: string, command: string, args: string[]) =>
      ipcRenderer.invoke('redis:execute', { connectionId, command, args }),
  };
}

export function createMongodbApi(ipcRenderer: IpcRenderer) {
  return {
    // Server info
    serverInfo: (connectionId: string) =>
      ipcRenderer.invoke('mongodb:server-info', { connectionId }),

    // Database operations
    listDatabases: (connectionId: string) =>
      ipcRenderer.invoke('mongodb:list-databases', { connectionId }),

    // Collection operations
    listCollections: (connectionId: string) =>
      ipcRenderer.invoke('mongodb:list-collections', { connectionId }),

    collectionStats: (connectionId: string, collection: string) =>
      ipcRenderer.invoke('mongodb:collection-stats', { connectionId, collection }),

    createCollection: (
      connectionId: string,
      name: string,
      options?: { capped?: boolean; size?: number }
    ) => ipcRenderer.invoke('mongodb:create-collection', { connectionId, name, options }),

    dropCollection: (connectionId: string, collection: string) =>
      ipcRenderer.invoke('mongodb:drop-collection', { connectionId, collection }),

    // Document operations
    findDocuments: (
      connectionId: string,
      collection: string,
      options?: {
        filter?: Record<string, unknown>;
        projection?: Record<string, number>;
        sort?: Record<string, 1 | -1>;
        skip?: number;
        limit?: number;
      }
    ): Promise<{ success: boolean; documents?: MongoDocumentSnapshot[]; error?: string }> =>
      ipcRenderer.invoke('mongodb:find-documents', { connectionId, collection, ...options }),

    findDocumentById: (connectionId: string, collection: string, id: string): Promise<{ success: boolean; document?: MongoDocumentSnapshot | null; error?: string }> =>
      ipcRenderer.invoke('mongodb:find-document-by-id', { connectionId, collection, id }),

    countDocuments: (connectionId: string, collection: string, filter?: Record<string, unknown>) =>
      ipcRenderer.invoke('mongodb:count-documents', { connectionId, collection, filter }),

    insertDocument: (connectionId: string, collection: string, document: Record<string, unknown>) =>
      ipcRenderer.invoke('mongodb:insert-document', { connectionId, collection, document }),

    updateDocument: (
      connectionId: string,
      collection: string,
      id: string,
      update: Record<string, unknown>,
      options?: { upsert?: boolean; replace?: boolean }
    ) =>
      ipcRenderer.invoke('mongodb:update-document', {
        connectionId,
        collection,
        id,
        update,
        options,
      }),

    deleteDocument: (connectionId: string, collection: string, id: string) =>
      ipcRenderer.invoke('mongodb:delete-document', { connectionId, collection, id }),

    deleteDocuments: (connectionId: string, collection: string, filter: Record<string, unknown>) =>
      ipcRenderer.invoke('mongodb:delete-documents', { connectionId, collection, filter }),

    // Aggregation
    aggregate: (
      connectionId: string,
      collection: string,
      pipeline: Array<Record<string, unknown>>
    ) => ipcRenderer.invoke('mongodb:aggregate', { connectionId, collection, pipeline }),

    // Index operations
    listIndexes: (connectionId: string, collection: string) =>
      ipcRenderer.invoke('mongodb:list-indexes', { connectionId, collection }),

    createIndex: (
      connectionId: string,
      collection: string,
      keys: Record<string, 1 | -1 | 'text'>,
      options?: { unique?: boolean; sparse?: boolean; expireAfterSeconds?: number; name?: string }
    ) => ipcRenderer.invoke('mongodb:create-index', { connectionId, collection, keys, options }),

    dropIndex: (connectionId: string, collection: string, indexName: string) =>
      ipcRenderer.invoke('mongodb:drop-index', { connectionId, collection, indexName }),

    // Raw command
    runCommand: (connectionId: string, command: Record<string, unknown>) =>
      ipcRenderer.invoke('mongodb:run-command', { connectionId, command }),
  };
}
