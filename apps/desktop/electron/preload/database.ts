import type { IpcRenderer, IpcRendererEvent } from 'electron';

export interface DbConnectionStatus {
  connectionId: string;
  configId: string;
  type: 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'mongodb';
  status: 'connecting' | 'connected' | 'error' | 'disconnected';
  error?: string;
  tunnelId?: string;
  localPort?: number;
  connectedAt?: Date;
  readOnly?: boolean;
}

export interface DbTransferProgress {
  operationId?: string;
  connectionId?: string;
  bytesProcessed: number;
  totalBytes?: number;
  percentage?: number;
  stage: 'preparing' | 'exporting' | 'importing' | 'completed' | 'error';
  message?: string;
  i18nKey?: string;
  i18nParams?: Record<string, string | number>;
}

export function createDbConnectionsApi(ipcRenderer: IpcRenderer) {
  return {
    getAll: () => ipcRenderer.invoke('db:dbconnections:get-all'),
    getById: (id: string) => ipcRenderer.invoke('db:dbconnections:get-by-id', id),
    create: (data: {
      name: string;
      type: 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'mongodb';
      // Network database fields
      host?: string | null;
      port?: number | null;
      database?: string;
      username?: string;
      password?: string;
      connectionUri?: string;
      connectionMode?: 'local' | 'ssh';
      sshHostId?: string;
      sshTunnelEnabled?: boolean;
      sslEnabled?: boolean;
      sslMode?: 'disabled' | 'require' | 'require-no-verify';
      sslCa?: string;
      readOnly?: boolean;
      authDatabase?: string;
      replicaSet?: string;
      directConnection?: boolean;
      readPreference?: string;
      color?: string;
      // SQLite-specific fields
      filePath?: string;
      isRemote?: boolean;
      remoteHostId?: string;
      // Export/Import execution mode (v1.21.0)
      executionMode?: 'direct' | 'docker';
      dockerContainer?: string;
      favorite?: number;
      folderId?: string | null;
      sortOrder?: number;
    }) => ipcRenderer.invoke('db:dbconnections:create', data),
    update: (
      id: string,
      update: {
        name?: string;
        type?: 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'mongodb';
        host?: string | null;
        port?: number | null;
        database?: string | null;
        username?: string | null;
        password?: string | null;
        connectionUri?: string | null;
        connectionMode?: 'local' | 'ssh';
        sshHostId?: string | null;
        sshTunnelEnabled?: boolean;
        sslEnabled?: boolean;
        sslMode?: 'disabled' | 'require' | 'require-no-verify';
        /** PEM; null removes the stored CA */
        sslCa?: string | null;
        sslLegacyHint?: false;
        readOnly?: boolean;
        authDatabase?: string | null;
        replicaSet?: string | null;
        directConnection?: boolean;
        readPreference?: string | null;
        color?: string | null;
        // SQLite-specific fields
        filePath?: string | null;
        isRemote?: boolean;
        remoteHostId?: string | null;
        // Export/Import execution mode (v1.21.0)
        executionMode?: 'direct' | 'docker';
        dockerContainer?: string | null;
        favorite?: number;
        folderId?: string | null;
        sortOrder?: number;
      }
    ) => ipcRenderer.invoke('db:dbconnections:update', id, update),
    delete: (id: string) => ipcRenderer.invoke('db:dbconnections:delete', id),
    createShellPty: (params: { connectionId: string; cols?: number; rows?: number }) =>
      ipcRenderer.invoke('db:dbconnections:create-shell-pty', params) as Promise<{
        success: boolean;
        sessionId?: string;
        pid?: number;
        tool?: string;
        reason?: 'ssh' | 'unsupported' | 'missing-target' | 'missing-tool';
        error?: string;
      }>,
    test: (data: {
      name?: string;
      type: 'postgres' | 'mysql' | 'redis' | 'mongodb';
      host: string;
      port: number;
      database?: string;
      username?: string;
      password?: string;
      connectionUri?: string;
      connectionMode?: 'local' | 'ssh';
      sshHostId?: string;
      sshTunnelEnabled?: boolean;
      sslMode?: 'disabled' | 'require' | 'require-no-verify';
      sslCa?: string;
      configId?: string;
      authDatabase?: string;
      replicaSet?: string;
      directConnection?: boolean;
      readPreference?: string;
      executionMode?: 'direct' | 'docker';
      dockerContainer?: string;
    }) => ipcRenderer.invoke('db:dbconnections:test', data),
    /** Opens a file dialog in the main process and returns the validated PEM. */
    pickCaCertificate: () =>
      ipcRenderer.invoke('db:dbconnections:pick-ca-file') as Promise<{
        success: boolean;
        pem?: string;
        fingerprint?: string;
        error?: string;
      }>,
  };
}

export function createDbExplorerApi(ipcRenderer: IpcRenderer) {
  return {
    // Connection management
    connect: (params: { configId: string; sshSessionId?: string }) =>
      ipcRenderer.invoke('dbexplorer:connect', params),
    disconnect: (connectionId: string) => ipcRenderer.invoke('dbexplorer:disconnect', connectionId),
    status: (connectionId: string) => ipcRenderer.invoke('dbexplorer:status', connectionId),
    connections: () => ipcRenderer.invoke('dbexplorer:connections'),

    // Schema & metadata
    tables: (connectionId: string) => ipcRenderer.invoke('dbexplorer:tables', connectionId),
    schema: (params: { connectionId: string; tableName: string; schema?: string }) =>
      ipcRenderer.invoke('dbexplorer:schema', params),
    rowCount: (params: {
      connectionId: string;
      tableName: string;
      schema?: string;
    }) => ipcRenderer.invoke('dbexplorer:row-count', params),

    // Data operations
    data: (params: {
      connectionId: string;
      tableName: string;
      schema?: string;
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDirection?: 'ASC' | 'DESC';
    }) => ipcRenderer.invoke('dbexplorer:data', params),
    query: (params: { connectionId: string; sql: string }) =>
      ipcRenderer.invoke('dbexplorer:query', params),

    // Row operations
    updateRow: (params: {
      connectionId: string;
      tableName: string;
      schema?: string;
      primaryKey: Record<string, unknown>;
      changes: Record<string, unknown>;
    }) => ipcRenderer.invoke('dbexplorer:update-row', params),
    deleteRow: (params: {
      connectionId: string;
      tableName: string;
      schema?: string;
      primaryKey: Record<string, unknown>;
    }) => ipcRenderer.invoke('dbexplorer:delete-row', params),
    insertRow: (params: {
      connectionId: string;
      tableName: string;
      schema?: string;
      data: Record<string, unknown>;
    }) => ipcRenderer.invoke('dbexplorer:insert-row', params),

    // Query history
    history: (params: { connectionId: string; limit?: number }) =>
      ipcRenderer.invoke('dbexplorer:history', params),
    clearHistory: (connectionId: string) =>
      ipcRenderer.invoke('dbexplorer:history:clear', connectionId),

    // DDL Operations - Database Management
    listDatabases: (connectionId: string) =>
      ipcRenderer.invoke('dbexplorer:list-databases', { connectionId }),
    createDatabase: (params: {
      connectionId: string;
      name: string;
      options?: Record<string, unknown>;
    }) => ipcRenderer.invoke('dbexplorer:create-database', params),
    createUser: (params: {
      connectionId: string;
      username: string;
      options: {
        password: string;
        host?: string;
        database?: string;
        schema?: string;
        accessLevel?: 'login' | 'read' | 'readWrite' | 'admin';
      };
    }) => ipcRenderer.invoke('dbexplorer:create-user', params),
    dropDatabase: (params: { connectionId: string; name: string }) =>
      ipcRenderer.invoke('dbexplorer:drop-database', params),

    // DDL Operations - Schema Management (PostgreSQL)
    listSchemas: (connectionId: string) =>
      ipcRenderer.invoke('dbexplorer:list-schemas', { connectionId }),
    createSchema: (params: {
      connectionId: string;
      name: string;
      options?: Record<string, unknown>;
    }) => ipcRenderer.invoke('dbexplorer:create-schema', params),
    dropSchema: (params: { connectionId: string; name: string; cascade?: boolean }) =>
      ipcRenderer.invoke('dbexplorer:drop-schema', params),
    createTable: (params: {
      connectionId: string;
      name: string;
      columns: Array<{
        name: string;
        type: string;
        length?: number;
        precision?: number;
        scale?: number;
        nullable?: boolean;
        primaryKey?: boolean;
        defaultValue?: string | null;
        unique?: boolean;
      }>;
      schema?: string;
    }) => ipcRenderer.invoke('dbexplorer:create-table', params),

    dropTable: (params: {
      connectionId: string;
      name: string;
      schema?: string;
      cascade?: boolean;
    }) => ipcRenderer.invoke('dbexplorer:drop-table', params),

    // Connection status events
    onConnectionStatus: (callback: (state: DbConnectionStatus) => void) => {
      const subscription = (_event: IpcRendererEvent, data: DbConnectionStatus) => {
        callback(data);
      };
      ipcRenderer.on('db:connection:status', subscription);
      return () => ipcRenderer.removeListener('db:connection:status', subscription);
    },

    // Export/Import operations
    exportDatabase: (params: {
      connectionId: string;
      configId: string;
      operationId?: string;
      compress: boolean;
      tables?: string[];
      schemaOnly?: boolean;
      dataOnly?: boolean;
      // pg_dump specific options
      clean?: boolean;
      noOwner?: boolean;
      create?: boolean;
    }) => ipcRenderer.invoke('dbexplorer:export', params),

    importDatabase: (params: {
      connectionId: string;
      configId: string;
      operationId?: string;
      clearMode?: 'none' | 'truncate' | 'drop';
    }) => ipcRenderer.invoke('dbexplorer:import', params),

    checkTools: (dbType: 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'mongodb') =>
      ipcRenderer.invoke('dbexplorer:check-tools', { dbType }),

    // Export/Import progress events
    onExportProgress: (callback: (progress: DbTransferProgress) => void) => {
      const subscription = (_event: IpcRendererEvent, data: DbTransferProgress) => {
        callback(data);
      };
      ipcRenderer.on('dbexplorer:export-progress', subscription);
      return () => ipcRenderer.removeListener('dbexplorer:export-progress', subscription);
    },

    onImportProgress: (callback: (progress: DbTransferProgress) => void) => {
      const subscription = (_event: IpcRendererEvent, data: DbTransferProgress) => {
        callback(data);
      };
      ipcRenderer.on('dbexplorer:import-progress', subscription);
      return () => ipcRenderer.removeListener('dbexplorer:import-progress', subscription);
    },
  };
}
