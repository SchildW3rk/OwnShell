/**
 * SFTP Connection Manager (v1.16.0)
 *
 * Manages standalone SFTP connections independent of SSH terminal sessions.
 * This allows SFTP-only connections without requiring a full SSH shell.
 *
 * Features:
 * - Standalone SFTP connections (no terminal required)
 * - Connection pooling and reuse
 * - Automatic reconnection on failure
 * - Jump host support
 * - Connection status tracking
 */

import { v4 as uuidv4 } from 'uuid';
import { SSH2Adapter, JumpHostConfig } from '../ssh/ssh2-adapter';
import { ISSHSFTP, SSHConnectionError } from '@ownshell/core';
import { cryptoManager } from '../security/crypto';
import { logger } from '../logger';
import { loadHostKeyCheck } from '../ssh/host-key-store';

/**
 * SFTP Connection status
 */
export type SFTPConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * SFTP Connection configuration
 */
export interface SFTPConnectionConfig {
  hostId: string;
  hostname: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  passwordEncrypted?: string | null;
  privateKeyEncrypted?: string | null;
  passphraseEncrypted?: string | null;
  jumpHostId?: string | null;
}

/**
 * SFTP Connection instance
 */
export interface SFTPConnection {
  id: string;
  hostId: string;
  hostname: string;
  username: string;
  status: SFTPConnectionStatus;
  client: SSH2Adapter;
  sftpClient: ISSHSFTP | null;
  createdAt: number;
  lastActivityAt: number;
  error?: string;
}

/**
 * Database query function types (injected at setup)
 */
export type GetHostById = (id: string) => Promise<{
  id: string;
  label: string;
  hostname: string;
  port: number;
  username: string;
  auth_type: 'password' | 'key';
  password_encrypted?: string | null;
  key_id?: string | null;
  jump_host_id?: string | null;
} | null>;

export type GetKeyById = (id: string) => Promise<{
  private_key_encrypted: string;
  passphrase_encrypted?: string | null;
} | null>;

/**
 * SFTP Connection Manager Singleton
 *
 * Manages all standalone SFTP connections for the application.
 */
class SFTPConnectionManager {
  private connections = new Map<string, SFTPConnection>();
  private queueConnections = new Map<string, string>();
  private pendingHostConnections = new Map<string, Promise<ISSHSFTP>>();
  private getHostById: GetHostById | null = null;
  private getKeyById: GetKeyById | null = null;

  /**
   * Initialize the manager with database query functions
   */
  setup(getHostById: GetHostById, getKeyById: GetKeyById): void {
    this.getHostById = getHostById;
    this.getKeyById = getKeyById;
    logger.info('SFTP Connection Manager initialized');
  }

  /**
   * Connect to an SFTP server
   *
   * @param config - Connection configuration
   * @returns Connection ID
   */
  async connect(config: SFTPConnectionConfig): Promise<string> {
    const connectionId = uuidv4();

    logger.info('SFTP standalone connection requested', {
      connectionId,
      hostId: config.hostId,
      hostname: config.hostname,
      port: config.port,
      username: config.username,
      authType: config.authType,
      hasJumpHost: !!config.jumpHostId,
    });

    // Check if app is unlocked
    if (!cryptoManager.isUnlocked()) {
      throw new SSHConnectionError('App is locked. Please unlock to connect.');
    }

    // Create connection entry
    const connection: SFTPConnection = {
      id: connectionId,
      hostId: config.hostId,
      hostname: config.hostname,
      username: config.username,
      status: 'connecting',
      client: new SSH2Adapter(),
      sftpClient: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.connections.set(connectionId, connection);

    try {
      // Decrypt credentials
      let password: string | undefined;
      let privateKey: string | undefined;
      let passphrase: string | undefined;

      if (config.authType === 'password') {
        // Password auth: either use provided password or load from database
        if (config.passwordEncrypted) {
          password = cryptoManager.decryptData(config.passwordEncrypted);
        } else if (this.getHostById) {
          // Load password from database
          const host = await this.getHostById(config.hostId);
          if (host?.password_encrypted) {
            password = cryptoManager.decryptData(host.password_encrypted);
            logger.debug('Loaded password from database for SFTP connection', { connectionId });
          } else {
            throw new SSHConnectionError(
              'Password authentication requires a password, but none stored'
            );
          }
        } else {
          throw new SSHConnectionError('Password authentication failed: database not initialized');
        }
      } else if (config.authType === 'key') {
        // Key auth: either use provided key or load from database
        if (config.privateKeyEncrypted) {
          privateKey = cryptoManager.decryptData(config.privateKeyEncrypted);
        } else if (this.getHostById && this.getKeyById) {
          // Load key from database via host's key_id
          const host = await this.getHostById(config.hostId);
          if (host?.key_id) {
            const key = await this.getKeyById(host.key_id);
            if (key) {
              privateKey = cryptoManager.decryptData(key.private_key_encrypted);
              if (key.passphrase_encrypted) {
                passphrase = cryptoManager.decryptData(key.passphrase_encrypted);
              }
              logger.debug('Loaded SSH key from database for SFTP connection', {
                connectionId,
                keyId: host.key_id,
              });
            } else {
              throw new SSHConnectionError(`SSH key not found: ${host.key_id}`);
            }
          } else {
            throw new SSHConnectionError('Key authentication requires a key, but none configured');
          }
        } else {
          throw new SSHConnectionError('Key authentication failed: database not initialized');
        }

        // Normalize private key
        if (privateKey) {
          privateKey = privateKey.trim();
          if (!privateKey.endsWith('\n')) {
            privateKey += '\n';
          }
        }

        if (config.passphraseEncrypted) {
          passphrase = cryptoManager.decryptData(config.passphraseEncrypted);
        }
      }

      // Build jump host chain if needed
      let jumpChain: JumpHostConfig[] = [];
      if (config.jumpHostId && this.getHostById && this.getKeyById) {
        jumpChain = await this.buildJumpChain(config.jumpHostId);
        logger.info('Jump host chain built for SFTP', {
          connectionId,
          chainLength: jumpChain.length,
        });
      }

      // Connection configuration
      const connectionConfig = {
        host: config.hostname,
        port: config.port,
        username: config.username,
        password,
        privateKey,
        passphrase,
        readyTimeout: 30000,
        keepaliveInterval: 10000,
        hostKey: await loadHostKeyCheck(config.hostId),
      };

      // Connect (with or without jump hosts)
      if (jumpChain.length > 0) {
        await connection.client.connectWithJumpChain(connectionConfig, jumpChain);
      } else {
        await connection.client.connect(connectionConfig);
      }

      // Initialize SFTP session
      connection.sftpClient = await connection.client.sftp();
      connection.status = 'connected';
      connection.lastActivityAt = Date.now();

      logger.info('SFTP standalone connection established', {
        connectionId,
        hostname: config.hostname,
        username: config.username,
      });

      // Setup disconnect handler
      connection.client.onClose(() => {
        logger.info('SFTP connection closed', { connectionId });
        connection.status = 'disconnected';
      });

      connection.client.onError((error) => {
        logger.error('SFTP connection error', { connectionId, error: error.message });
        connection.status = 'error';
        connection.error = error.message;
      });

      return connectionId;
    } catch (error) {
      // Update connection status on error
      connection.status = 'error';
      connection.error = error instanceof Error ? error.message : String(error);

      logger.error('SFTP standalone connection failed', {
        connectionId,
        error: connection.error,
      });

      // Clean up failed connection
      try {
        connection.client.destroy();
      } catch {
        // Ignore cleanup errors
      }
      this.connections.delete(connectionId);

      throw error;
    }
  }

  /**
   * Resolve a queue-owned transport. A standalone pane's connection must not be
   * borrowed: its unmount cleanup is allowed to disconnect that connection.
   */
  async ensureClientForHost(hostId: string): Promise<ISSHSFTP> {
    const queueConnectionId = this.queueConnections.get(hostId);
    const connection = queueConnectionId ? this.connections.get(queueConnectionId) : undefined;
    if (
      connection?.status === 'connected' &&
      connection.sftpClient &&
      connection.client.isConnected()
    ) {
      connection.lastActivityAt = Date.now();
      return connection.sftpClient;
    }

    const pending = this.pendingHostConnections.get(hostId);
    if (pending) return pending;

    const attempt = (async () => {
      this.queueConnections.delete(hostId);
      if (connection) await this.disconnect(connection.id);
      if (!this.getHostById) {
        throw new SSHConnectionError('SFTP connection manager is not initialized');
      }
      const host = await this.getHostById(hostId);
      if (!host) throw new SSHConnectionError('SFTP host not found');

      const connectionId = await this.connect({
        hostId: host.id,
        hostname: host.hostname,
        port: host.port,
        username: host.username,
        authType: host.auth_type,
        jumpHostId: host.jump_host_id,
      });
      const client = this.getSFTPClient(connectionId);
      if (!client) throw new SSHConnectionError('SFTP connection is no longer active');
      this.queueConnections.set(hostId, connectionId);
      return client;
    })();
    this.pendingHostConnections.set(hostId, attempt);
    try {
      return await attempt;
    } finally {
      if (this.pendingHostConnections.get(hostId) === attempt) {
        this.pendingHostConnections.delete(hostId);
      }
    }
  }

  /**
   * Get a connection by ID
   */
  getConnection(connectionId: string): SFTPConnection | undefined {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivityAt = Date.now();
    }
    return connection;
  }

  /**
   * Get SFTP client for a connection
   */
  getSFTPClient(connectionId: string): ISSHSFTP | null {
    const connection = this.getConnection(connectionId);
    if (!connection || connection.status !== 'connected') {
      return null;
    }
    return connection.sftpClient;
  }

  /**
   * Check if a connection is active
   */
  isConnected(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    return connection?.status === 'connected' && connection.client.isConnected();
  }

  /**
   * Disconnect a connection
   */
  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn('Attempted to disconnect non-existent SFTP connection', { connectionId });
      return;
    }

    logger.info('Disconnecting SFTP connection', {
      connectionId,
      hostname: connection.hostname,
    });

    try {
      // Close SFTP session
      if (connection.sftpClient) {
        await connection.sftpClient.close();
      }

      // Disconnect SSH client
      await connection.client.disconnect();

      // Cleanup
      connection.client.destroy();
    } catch (error) {
      logger.warn('Error during SFTP disconnect', {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.connections.delete(connectionId);
    if (this.queueConnections.get(connection.hostId) === connectionId) {
      this.queueConnections.delete(connection.hostId);
    }
    logger.info('SFTP connection disconnected', { connectionId });
  }

  /**
   * Disconnect all connections for a host
   */
  async disconnectByHost(hostId: string): Promise<void> {
    const toDisconnect: string[] = [];

    for (const [id, connection] of this.connections) {
      if (connection.hostId === hostId) {
        toDisconnect.push(id);
      }
    }

    for (const connectionId of toDisconnect) {
      await this.disconnect(connectionId);
    }

    logger.info('Disconnected all SFTP connections for host', {
      hostId,
      count: toDisconnect.length,
    });
  }

  /**
   * Get all active connections
   */
  getAllConnections(): SFTPConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Disconnect all connections
   */
  async disconnectAll(): Promise<void> {
    const connectionIds = Array.from(this.connections.keys());

    for (const connectionId of connectionIds) {
      await this.disconnect(connectionId);
    }

    logger.info('All SFTP connections disconnected', { count: connectionIds.length });
  }

  /**
   * Build jump host chain for a given jump host ID
   */
  private async buildJumpChain(jumpHostId: string): Promise<JumpHostConfig[]> {
    if (!this.getHostById || !this.getKeyById) {
      throw new Error('SFTP Connection Manager not initialized with database functions');
    }

    const chain: JumpHostConfig[] = [];
    const visited = new Set<string>();
    let currentId: string | null | undefined = jumpHostId;

    while (currentId) {
      // Detect circular reference
      if (visited.has(currentId)) {
        throw new SSHConnectionError(`Circular jump host reference detected`);
      }
      visited.add(currentId);

      const host = await this.getHostById(currentId);
      if (!host) {
        throw new SSHConnectionError(`Jump host not found: ${currentId}`);
      }

      // Decrypt credentials
      let password: string | undefined;
      let privateKey: string | undefined;
      let passphrase: string | undefined;

      if (host.auth_type === 'password' && host.password_encrypted) {
        password = cryptoManager.decryptData(host.password_encrypted);
      } else if (host.auth_type === 'key' && host.key_id) {
        const key = await this.getKeyById(host.key_id);
        if (key) {
          privateKey = cryptoManager.decryptData(key.private_key_encrypted);
          if (privateKey) {
            privateKey = privateKey.trim();
            if (!privateKey.endsWith('\n')) {
              privateKey += '\n';
            }
          }
          if (key.passphrase_encrypted) {
            passphrase = cryptoManager.decryptData(key.passphrase_encrypted);
          }
        }
      }

      // Add to chain (prepend)
      chain.unshift({
        label: host.label,
        host: host.hostname,
        port: host.port,
        username: host.username,
        password,
        privateKey,
        passphrase,
        hostKey: await loadHostKeyCheck(currentId),
      });

      currentId = host.jump_host_id;
    }

    return chain;
  }

  /**
   * Get connection stats for debugging
   */
  getStats(): {
    totalConnections: number;
    connectedCount: number;
    disconnectedCount: number;
    errorCount: number;
  } {
    let connectedCount = 0;
    let disconnectedCount = 0;
    let errorCount = 0;

    for (const connection of this.connections.values()) {
      switch (connection.status) {
        case 'connected':
          connectedCount++;
          break;
        case 'disconnected':
          disconnectedCount++;
          break;
        case 'error':
          errorCount++;
          break;
      }
    }

    return {
      totalConnections: this.connections.size,
      connectedCount,
      disconnectedCount,
      errorCount,
    };
  }
}

// Export singleton instance
export const sftpConnectionManager = new SFTPConnectionManager();
