import { v4 as uuidv4 } from 'uuid';
import type { DBConnectionsTable } from '@ownshell/core';
import { z } from 'zod';
import { dbConnectionManager } from '../../db-explorer/connection-manager';
import { localPtyManager } from '../../pty/local-pty-manager';
import { cryptoManager } from '../../security/crypto';
import { logger } from '../../logger';
import { resolveExecutable } from '../../utils/executable-resolver';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import { idSchema, noPayloadSchema, dbConnectionBaseSchema, dbConnectionUpdateArgsSchema, dbConnectionTestSchema } from '../schemas/database-explorer';
import { DBExplorerHandlerContext } from './context';

const createDbShellPtySchema = z.object({
  connectionId: idSchema,
  cols: z.number().finite().positive().optional(),
  rows: z.number().finite().positive().optional(),
});

function appendArg(args: string[], flag: string, value?: string | number | null): void {
  if (value === undefined || value === null || value === '') return;
  args.push(flag, String(value));
}

function getHost(connection: DBConnectionsTable): string | null {
  return connection.host?.trim() || null;
}

function getPort(connection: DBConnectionsTable, fallback: number): number {
  return connection.port && Number.isFinite(connection.port) ? connection.port : fallback;
}

function getStoredPassword(connection: DBConnectionsTable): string | undefined {
  if (!connection.password_encrypted) return undefined;
  return cryptoManager.decryptData(connection.password_encrypted);
}

function sanitizeConnectionUriForStorage(value?: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return value;
  }
}

function buildMongoUri(connection: DBConnectionsTable, password?: string): string {
  if (connection.connection_uri) {
    try {
      const url = new URL(connection.connection_uri);
      if (connection.username && !url.username) {
        url.username = connection.username;
      }
      if (password && !url.password) {
        url.password = password;
      }
      return url.toString();
    } catch {
      return connection.connection_uri;
    }
  }

  const host = getHost(connection) || '127.0.0.1';
  const port = getPort(connection, 27017);
  const database = connection.database?.trim() || '';
  const uriPath = database ? `/${encodeURIComponent(database)}` : '';
  const params = new URLSearchParams();
  const authSource = connection.auth_database?.trim();
  if (authSource) params.set('authSource', authSource);
  if (connection.replica_set) params.set('replicaSet', connection.replica_set);
  if (connection.direct_connection !== null && connection.direct_connection !== undefined) {
    params.set('directConnection', connection.direct_connection === 1 ? 'true' : 'false');
  }
  if (connection.read_preference) params.set('readPreference', connection.read_preference);
  const uriQuery = params.size > 0 ? `?${params.toString()}` : '';
  const username = connection.username?.trim();
  const auth =
    username && password
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
      : '';

  return `mongodb://${auth}${host}:${port}${uriPath}${uriQuery}`;
}

function buildShellLaunch(connection: DBConnectionsTable): {
  shell: string | null;
  args: string[];
  env?: Record<string, string>;
  tool?: string;
  reason?: 'ssh' | 'unsupported' | 'missing-target' | 'missing-tool';
} {
  if (connection.connection_mode === 'ssh') {
    return { shell: null, args: [], reason: 'ssh' };
  }

  const password = getStoredPassword(connection);

  switch (connection.type) {
    case 'postgres': {
      const host = getHost(connection);
      if (!host) return { shell: null, args: [], reason: 'missing-target' };

      const tool = 'psql';
      const shell = resolveExecutable(tool);
      if (!shell) return { shell: null, args: [], reason: 'missing-tool', tool };

      const args: string[] = [];
      appendArg(args, '-h', host);
      appendArg(args, '-p', getPort(connection, 5432));
      appendArg(args, '-U', connection.username);
      appendArg(args, '-d', connection.database);

      return {
        shell,
        args,
        tool,
        env: password ? { PGPASSWORD: password } : undefined,
      };
    }

    case 'mysql': {
      const host = getHost(connection);
      if (!host) return { shell: null, args: [], reason: 'missing-target' };

      const tool = 'mysql';
      const shell = resolveExecutable(tool);
      if (!shell) return { shell: null, args: [], reason: 'missing-tool', tool };

      const args: string[] = [];
      appendArg(args, '-h', host);
      appendArg(args, '-P', getPort(connection, 3306));
      appendArg(args, '-u', connection.username);
      if (connection.database) {
        args.push(connection.database);
      }

      return {
        shell,
        args,
        tool,
        env: password ? { MYSQL_PWD: password } : undefined,
      };
    }

    case 'mongodb': {
      const host = getHost(connection);
      if (!host) return { shell: null, args: [], reason: 'missing-target' };

      const tool = 'mongosh';
      const shell = resolveExecutable(tool);
      if (!shell) return { shell: null, args: [], reason: 'missing-tool', tool };

      if (password) {
        return {
          shell: '/bin/zsh',
          args: ['-lc', 'exec "$OWNSHELL_DB_CLI" "$OWNSHELL_DB_URI"'],
          tool,
          env: {
            OWNSHELL_DB_CLI: shell,
            OWNSHELL_DB_URI: buildMongoUri(connection, password),
          },
        };
      }

      const port = getPort(connection, 27017);
      const database = connection.database?.trim() || '';
      const uriPath = database ? `/${encodeURIComponent(database)}` : '';
      const args = [`mongodb://${host}:${port}${uriPath}`];

      appendArg(args, '--username', connection.username);
      if (connection.username) {
        appendArg(args, '--authenticationDatabase', connection.auth_database || 'admin');
      }

      return { shell, args, tool };
    }

    case 'redis': {
      const host = getHost(connection);
      if (!host) return { shell: null, args: [], reason: 'missing-target' };

      const tool = 'redis-cli';
      const shell = resolveExecutable(tool);
      if (!shell) return { shell: null, args: [], reason: 'missing-tool', tool };

      const args: string[] = [];
      appendArg(args, '-h', host);
      appendArg(args, '-p', getPort(connection, 6379));

      const dbIndex = Number(connection.database);
      if (Number.isInteger(dbIndex) && dbIndex >= 0) {
        appendArg(args, '-n', dbIndex);
      }

      return {
        shell,
        args,
        tool,
        env: password ? { REDISCLI_AUTH: password } : undefined,
      };
    }

    case 'sqlite': {
      if (!connection.file_path) return { shell: null, args: [], reason: 'missing-target' };

      const tool = 'sqlite3';
      const shell = resolveExecutable(tool);
      if (!shell) return { shell: null, args: [], reason: 'missing-tool', tool };

      return { shell, args: [connection.file_path], tool };
    }

    default:
      return { shell: null, args: [], reason: 'unsupported' };
  }
}

export function setupDBConnectionHandlers(ctx: DBExplorerHandlerContext) {
  const { dbConnectionQueries } = ctx;
  // ============================================
  // DATABASE CONNECTIONS CRUD
  // ============================================

  /**
   * Get all stored database connections
   */
  safeHandle('db:dbconnections:get-all', noPayloadSchema, async () => {
    try {
      const connections = await dbConnectionQueries.getAll();
      return { success: true, connections };
    } catch (error) {
      logger.error('Failed to get database connections', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Get a single database connection by ID
   */
  safeHandle('db:dbconnections:get-by-id', idSchema, async (_event, id) => {
    try {
      const connection = await dbConnectionQueries.getById(id);
      return { success: true, connection };
    } catch (error) {
      logger.error('Failed to get database connection', { id, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Create a local PTY running the database CLI directly.
   * Secrets are decrypted in the main process and passed via environment variables,
   * so credentials do not get typed into terminal history.
   */
  safeHandle('db:dbconnections:create-shell-pty', createDbShellPtySchema, async (_event, params) => {
    try {
      const connection = await dbConnectionQueries.getById(params.connectionId);
      if (!connection) {
        return { success: false, error: 'Connection configuration not found' };
      }

      const result = buildShellLaunch(connection);
      if (!result.shell) {
        return {
          success: false,
          reason: result.reason || 'unsupported',
          tool: result.tool,
          error:
            result.reason === 'missing-tool'
              ? `${result.tool || 'Database CLI'} is not installed or not in PATH`
              : result.reason === 'ssh'
                ? 'Shell is available for local/direct connections'
                : 'Shell command cannot be built for this connection',
        };
      }

      const pty = localPtyManager.create({
        shell: result.shell,
        args: result.args,
        cols: params.cols,
        rows: params.rows,
        env: result.env,
      });

      return { success: true, sessionId: pty.sessionId, pid: pty.pid, tool: result.tool };
    } catch (error) {
      logger.error('Failed to create database shell PTY', {
        connectionId: params.connectionId,
        error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Create a new database connection
   */
  safeHandle(
    'db:dbconnections:create',
    dbConnectionBaseSchema,
    async (
      _event,
      data: {
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
      }
    ) => {
      try {
        const id = uuidv4();
        const now = Date.now();

        // Encrypt password if provided
        const passwordEncrypted = data.password ? cryptoManager.encryptData(data.password) : null;

        const newConnection: Record<string, unknown> = {
          id,
          name: data.name,
          type: data.type,
          host: data.host || null,
          port: data.port ?? null,
          database: data.database || null,
          username: data.username || null,
          password_encrypted: passwordEncrypted,
          connection_uri: sanitizeConnectionUriForStorage(data.connectionUri),
          connection_mode: data.connectionMode || (data.type === 'sqlite' ? 'local' : 'ssh'),
          ssh_host_id: data.sshHostId || null,
          ssh_tunnel_enabled: data.sshTunnelEnabled ? 1 : 0,
          ssl_enabled: data.sslEnabled ? 1 : 0,
          read_only: data.readOnly ? 1 : 0,
          auth_database: data.authDatabase || null,
          replica_set: data.replicaSet || null,
          direct_connection: data.directConnection ? 1 : 0,
          read_preference: data.readPreference || null,
          color: data.color || null,
          favorite: data.favorite ?? 0,
          folder_id: data.folderId ?? null,
          sort_order: data.sortOrder ?? 0,
          created_at: now,
          updated_at: now,
        };

        // SQLite-specific fields
        if (data.type === 'sqlite') {
          newConnection.file_path = data.filePath || null;
          newConnection.is_remote = data.isRemote ? 1 : 0;
          newConnection.remote_host_id = data.remoteHostId || null;
        }

        // Export/Import execution mode (v1.21.0)
        if (data.executionMode) {
          newConnection.execution_mode = data.executionMode;
          newConnection.docker_container = data.dockerContainer || null;
        }

        await dbConnectionQueries.create(newConnection as any);

        logger.info('Database connection created', { id, name: data.name, type: data.type });

        return { success: true, connection: { ...newConnection, id } };
      } catch (error) {
        logger.error('Failed to create database connection', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Update an existing database connection
   */
  safeHandleArgs(
    'db:dbconnections:update',
    dbConnectionUpdateArgsSchema,
    async (_event, [id, update]) => {
      try {
        const dbUpdate: Record<string, unknown> = {
          updated_at: Date.now(),
        };

        if (update.name !== undefined) dbUpdate.name = update.name;
        if (update.type !== undefined) dbUpdate.type = update.type;
        if (update.host !== undefined) dbUpdate.host = update.host;
        if (update.port !== undefined) dbUpdate.port = update.port;
        if (update.database !== undefined) dbUpdate.database = update.database;
        if (update.username !== undefined) dbUpdate.username = update.username;
        if (update.connectionUri !== undefined) {
          dbUpdate.connection_uri = sanitizeConnectionUriForStorage(update.connectionUri);
        }
        if (update.connectionMode !== undefined) dbUpdate.connection_mode = update.connectionMode;
        if (update.sshHostId !== undefined) dbUpdate.ssh_host_id = update.sshHostId;
        if (update.sshTunnelEnabled !== undefined)
          dbUpdate.ssh_tunnel_enabled = update.sshTunnelEnabled ? 1 : 0;
        if (update.sslEnabled !== undefined) dbUpdate.ssl_enabled = update.sslEnabled ? 1 : 0;
        if (update.readOnly !== undefined) dbUpdate.read_only = update.readOnly ? 1 : 0;
        if (update.authDatabase !== undefined) dbUpdate.auth_database = update.authDatabase;
        if (update.replicaSet !== undefined) dbUpdate.replica_set = update.replicaSet;
        if (update.directConnection !== undefined)
          dbUpdate.direct_connection = update.directConnection ? 1 : 0;
        if (update.readPreference !== undefined) dbUpdate.read_preference = update.readPreference;
        if (update.color !== undefined) dbUpdate.color = update.color;

        // SQLite-specific fields
        if (update.filePath !== undefined) dbUpdate.file_path = update.filePath;
        if (update.isRemote !== undefined) dbUpdate.is_remote = update.isRemote ? 1 : 0;
        if (update.remoteHostId !== undefined) dbUpdate.remote_host_id = update.remoteHostId;

        // Export/Import execution mode (v1.21.0)
        if (update.executionMode !== undefined) dbUpdate.execution_mode = update.executionMode;
        if (update.dockerContainer !== undefined)
          dbUpdate.docker_container = update.dockerContainer;
        if (update.favorite !== undefined) dbUpdate.favorite = update.favorite;
        if (update.folderId !== undefined) dbUpdate.folder_id = update.folderId;
        if (update.sortOrder !== undefined) dbUpdate.sort_order = update.sortOrder;

        // Handle password update
        if (update.password !== undefined) {
          dbUpdate.password_encrypted = update.password
            ? cryptoManager.encryptData(update.password)
            : null;
        }

        await dbConnectionQueries.update(id, dbUpdate as any);

        logger.info('Database connection updated', { id });

        return { success: true };
      } catch (error) {
        logger.error('Failed to update database connection', { id, error });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Delete a database connection
   */
  safeHandle('db:dbconnections:delete', idSchema, async (_event, id) => {
    try {
      // Disconnect if connected
      const state = dbConnectionManager.getConnectionState(id);
      if (state) {
        await dbConnectionManager.disconnect(state.connectionId);
      }

      await dbConnectionQueries.delete(id);

      logger.info('Database connection deleted', { id });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete database connection', { id, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Test a database connection (without saving)
   */
  safeHandle(
    'db:dbconnections:test',
    dbConnectionTestSchema,
    async (_event, data) => {
      // testConnection() handles its own error catching and logging internally
      return dbConnectionManager.testConnection({
        type: data.type,
        name: data.name,
        host: data.host,
        port: data.port,
        database: data.database,
        username: data.username,
        password: data.password,
        connectionUri: data.connectionUri,
        connectionMode: data.connectionMode,
        sshHostId: data.sshHostId,
        sshTunnelEnabled: data.sshTunnelEnabled,
        sslEnabled: data.sslEnabled || false,
        authDatabase: data.authDatabase,
        replicaSet: data.replicaSet,
        directConnection: data.directConnection,
        readPreference: data.readPreference,
        executionMode: data.executionMode,
        dockerContainer: data.dockerContainer,
      });
    }
  );


}
