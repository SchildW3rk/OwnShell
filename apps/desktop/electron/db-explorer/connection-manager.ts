/**
 * Database Connection Manager
 *
 * Singleton manager for database connections with SSH tunnel support.
 * Handles connection lifecycle, tunnel creation, and error recovery.
 */

import { v4 as uuidv4 } from 'uuid';
import type { BrowserWindow } from 'electron';
import {
  DBConnectionError,
  type DBConnectionConfig,
  type DBConnectionState,
  type DBType,
} from '@ownshell/core';
import type { IMongoDBAdapter, IRedisAdapter, ISQLAdapter } from './adapters';
import { logger } from '../logger';
import { createNetworkAdapter, createSQLiteAdapter } from './connection/adapter-factory';
import { formatConnectionError } from './connection/errors';
import { downloadRemoteSqlite, removeRemoteSqliteCopy } from './connection/remote-sqlite';
import { testDatabaseConnection } from './connection/test-connection';
import {
  disconnectAutoCreatedSshSessionIfUnused,
  setupDatabaseTunnel,
  stopDatabaseTunnel,
} from './connection/tunnel';
import type { ActiveConnection, AnyAdapter, TestConnectionConfig } from './connection/types';

type ConnectionMode = 'local' | 'ssh';

/**
 * Database Connection Manager - Singleton
 */
export class DBConnectionManager {
  private connections: Map<string, ActiveConnection> = new Map();
  private mainWindow: BrowserWindow | null = null;

  /**
   * Set the main window for IPC events.
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Connect to a database.
   */
  async connect(config: DBConnectionConfig, sshSessionId?: string): Promise<string> {
    const connectionId = uuidv4();
    const connectionMode = (config.connectionMode ||
      (config.sshTunnelEnabled ? 'ssh' : 'local')) as ConnectionMode;

    logger.info('Starting database connection', {
      connectionId,
      configId: config.id,
      type: config.type,
      host: config.host,
      port: config.port,
      database: config.database,
      connectionMode,
      sshTunnelEnabled: config.sshTunnelEnabled,
    });

    const connection: ActiveConnection = {
      id: connectionId,
      configId: config.id,
      type: config.type,
      adapter: null as unknown as AnyAdapter,
      readOnly: config.readOnly === true,
      status: 'connecting',
    };

    this.connections.set(connectionId, connection);
    this.emitConnectionStatus(connectionId);

    try {
      const adapter = await this.createAdapterForConnection(
        config,
        connectionMode,
        sshSessionId,
        connectionId,
        connection
      );

      connection.adapter = adapter;

      await adapter.connect();

      const isConnected = await adapter.testConnection();
      if (!isConnected) {
        throw new DBConnectionError('Connection test failed', 'CONNECTION_TEST_FAILED');
      }

      connection.status = 'connected';
      connection.connectedAt = new Date();
      this.emitConnectionStatus(connectionId);

      logger.info('Database connected successfully', {
        connectionId,
        type: config.type,
        database: config.database,
      });

      return connectionId;
    } catch (error) {
      await this.handleConnectionFailure(connection, connectionId, error);
      throw new DBConnectionError(
        connection.error || 'Database connection failed',
        error instanceof DBConnectionError ? error.code : 'CONNECTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Disconnect from a database.
   */
  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);

    if (!connection) {
      logger.warn('Attempted to disconnect non-existent connection', { connectionId });
      return;
    }

    logger.info('Disconnecting database', {
      connectionId,
      type: connection.type,
      autoCreatedSshSession: connection.autoCreatedSshSession,
    });

    try {
      if (connection.adapter) {
        await connection.adapter.disconnect();
      }

      if (connection.tunnelId) {
        await stopDatabaseTunnel(connection.tunnelId);
      }

      if (connection.tempDir) {
        await removeRemoteSqliteCopy(connection.tempDir);
      }

      disconnectAutoCreatedSshSessionIfUnused(connectionId, connection, this.connections);

      connection.status = 'disconnected';
      this.emitConnectionStatus(connectionId);
      this.connections.delete(connectionId);

      logger.info('Database disconnected', { connectionId });
    } catch (error) {
      logger.error('Error during database disconnect', {
        connectionId,
        error,
      });

      this.connections.delete(connectionId);
    }
  }

  /**
   * Get a SQL database adapter by connection ID.
   */
  getAdapter(connectionId: string): ISQLAdapter {
    const connection = this.getConnectedConnection(connectionId);

    if (connection.type === 'redis') {
      throw new DBConnectionError(
        'Use getRedisAdapter() for Redis connections',
        'WRONG_ADAPTER_TYPE'
      );
    }

    if (connection.type === 'mongodb') {
      throw new DBConnectionError(
        'Use getMongoDBAdapter() for MongoDB connections',
        'WRONG_ADAPTER_TYPE'
      );
    }

    return connection.adapter as ISQLAdapter;
  }

  /**
   * Get a Redis adapter by connection ID.
   */
  getRedisAdapter(connectionId: string): IRedisAdapter {
    const connection = this.getConnectedConnection(connectionId);

    if (connection.type !== 'redis') {
      throw new DBConnectionError('Use getAdapter() for SQL connections', 'WRONG_ADAPTER_TYPE');
    }

    return connection.adapter as IRedisAdapter;
  }

  /**
   * Get a MongoDB adapter by connection ID.
   */
  getMongoDBAdapter(connectionId: string): IMongoDBAdapter {
    const connection = this.getConnectedConnection(connectionId);

    if (connection.type !== 'mongodb') {
      throw new DBConnectionError(
        'Use getAdapter() for SQL connections or getRedisAdapter() for Redis',
        'WRONG_ADAPTER_TYPE'
      );
    }

    return connection.adapter as IMongoDBAdapter;
  }

  getConnectionType(connectionId: string): DBType | null {
    const connection = this.connections.get(connectionId);
    return connection?.type || null;
  }

  getConnectionState(connectionId: string): DBConnectionState | null {
    const connection = this.connections.get(connectionId);
    return connection ? this.toConnectionState(connection) : null;
  }

  /**
   * Get connection info for dump/export operations.
   */
  getConnectionInfo(connectionId: string): {
    sshSessionId?: string;
    localPort?: number;
    type: DBType;
    status: 'connecting' | 'connected' | 'error' | 'disconnected';
  } | null {
    const connection = this.connections.get(connectionId);

    if (!connection) {
      return null;
    }

    return {
      sshSessionId: connection.sshSessionId,
      localPort: connection.localPort,
      type: connection.type,
      status: connection.status,
    };
  }

  getAllConnections(): DBConnectionState[] {
    return Array.from(this.connections.values()).map((connection) =>
      this.toConnectionState(connection)
    );
  }

  isConnected(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    return connection?.status === 'connected' && connection.adapter?.isConnected() === true;
  }

  isReadOnly(connectionId: string): boolean {
    return this.getConnectedConnection(connectionId).readOnly === true;
  }

  assertWritable(connectionId: string): void {
    if (this.isReadOnly(connectionId)) {
      throw new DBConnectionError(
        'This connection is read-only. Disable read-only to run write operations.',
        'READ_ONLY_CONNECTION'
      );
    }
  }

  async disconnectAll(): Promise<void> {
    logger.info('Disconnecting all database connections');

    const disconnectPromises = Array.from(this.connections.keys()).map((id) =>
      this.disconnect(id).catch((error) => {
        logger.error('Error disconnecting', { connectionId: id, error });
      })
    );

    await Promise.all(disconnectPromises);

    logger.info('All database connections disconnected');
  }

  /**
   * Disconnect all connections for a specific SSH session.
   */
  async disconnectForSession(sshSessionId: string): Promise<void> {
    logger.info('Disconnecting database connections for SSH session', { sshSessionId });

    const connectionIds = Array.from(this.connections.entries())
      .filter(([, connection]) => connection.sshSessionId === sshSessionId)
      .map(([id]) => id);

    for (const id of connectionIds) {
      await this.disconnect(id);
    }

    logger.info('Disconnected database connections for SSH session', {
      sshSessionId,
      count: connectionIds.length,
    });
  }

  /**
   * Test a database connection without saving it.
   */
  async testConnection(
    config: TestConnectionConfig
  ): Promise<{ success: boolean; error?: string }> {
    return testDatabaseConnection(config);
  }

  private async createAdapterForConnection(
    config: DBConnectionConfig,
    connectionMode: ConnectionMode,
    sshSessionId: string | undefined,
    connectionId: string,
    connection: ActiveConnection
  ): Promise<AnyAdapter> {
    if (config.type === 'sqlite') {
      if (!(config as { isRemote?: boolean }).isRemote) {
        return createSQLiteAdapter(config, connectionId);
      }
      const copy = await downloadRemoteSqlite(config, sshSessionId, connectionId);
      connection.tempDir = copy.tempDir;
      connection.readOnly = true;
      return createSQLiteAdapter(
        { ...config, readOnly: true, localCachePath: copy.localPath } as DBConnectionConfig,
        connectionId
      );
    }

    let effectiveHost: string | null = config.host;
    let effectivePort: number | null = config.port;

    if (connectionMode === 'ssh' && config.sshHostId) {
      const tunnelResult = await setupDatabaseTunnel(config, sshSessionId, connectionId);
      effectiveHost = '127.0.0.1';
      effectivePort = tunnelResult.localPort;
      connection.tunnelId = tunnelResult.tunnelId;
      connection.sshSessionId = tunnelResult.sshSessionId;
      connection.localPort = tunnelResult.localPort;
      connection.autoCreatedSshSession = tunnelResult.autoCreatedSshSession;

      logger.info(`SSH tunnel established for ${config.type}`, {
        connectionId,
        tunnelId: tunnelResult.tunnelId,
        localPort: tunnelResult.localPort,
        autoCreatedSession: tunnelResult.autoCreatedSshSession,
      });
    } else if (connectionMode === 'local') {
      logger.info('Local database connection (no SSH tunnel)', {
        connectionId,
        host: effectiveHost,
        port: effectivePort,
      });
    }

    if (!effectiveHost || effectivePort == null) {
      throw new DBConnectionError(`Host and port are required for ${config.type}`, 'INVALID_CONFIG');
    }

    return createNetworkAdapter(config, effectiveHost, effectivePort);
  }

  private async handleConnectionFailure(
    connection: ActiveConnection,
    connectionId: string,
    error: unknown
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Database connection failed', {
      connectionId,
      error: errorMessage,
    });

    if (connection.tunnelId) {
      try {
        await stopDatabaseTunnel(connection.tunnelId);
      } catch {
        // Ignore cleanup errors.
      }
    }

    if (connection.tempDir) {
      await connection.adapter?.disconnect().catch(() => undefined);
      await removeRemoteSqliteCopy(connection.tempDir);
    }

    disconnectAutoCreatedSshSessionIfUnused(connectionId, connection, this.connections);

    connection.status = 'error';
    connection.error = formatConnectionError(error);
    this.emitConnectionStatus(connectionId);
    this.connections.delete(connectionId);
  }

  private getConnectedConnection(connectionId: string): ActiveConnection {
    const connection = this.connections.get(connectionId);

    if (!connection) {
      throw new DBConnectionError('Connection not found', 'CONNECTION_NOT_FOUND');
    }

    if (connection.status !== 'connected') {
      throw new DBConnectionError(
        `Connection is ${connection.status}: ${connection.error || 'Unknown error'}`,
        'CONNECTION_NOT_READY'
      );
    }

    return connection;
  }

  private toConnectionState(connection: ActiveConnection): DBConnectionState {
    return {
      connectionId: connection.id,
      configId: connection.configId,
      type: connection.type,
      status: connection.status,
      error: connection.error,
      tunnelId: connection.tunnelId,
      localPort: connection.localPort,
      connectedAt: connection.connectedAt,
      readOnly: connection.readOnly === true,
    };
  }

  private emitConnectionStatus(connectionId: string): void {
    if (!this.mainWindow) return;

    const state = this.getConnectionState(connectionId);
    if (state) {
      this.mainWindow.webContents.send('db:connection:status', state);
    }
  }
}

// Singleton instance
export const dbConnectionManager = new DBConnectionManager();
