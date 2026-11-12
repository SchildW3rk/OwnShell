/**
 * Supported database types
 */
export type DBType = 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'mongodb';

/**
 * Connection mode for database connections
 * - 'local': Direct connection (localhost or network DB)
 * - 'ssh': Connection via SSH tunnel through linked host
 */
export type DBConnectionMode = 'local' | 'ssh';

/**
 * Database connection configuration
 * Used for both stored connections and runtime connections
 */
export interface DBConnectionConfig {
  /** Unique identifier */
  id: string;
  /** Display name (e.g., "Production DB", "Staging MySQL") */
  name: string;
  /** Database type */
  type: DBType;
  /** Database host (IP or hostname) - null for SQLite (file-based) */
  host: string | null;
  /** Database port - null for SQLite (file-based) */
  port: number | null;
  /** Database name (optional for Redis/SQLite) */
  database?: string;
  /** Username for authentication */
  username?: string;
  /** Password (encrypted when stored) */
  password?: string;
  /** Optional sanitized connection URI without embedded credentials */
  connectionUri?: string;
  /** Authentication database for MongoDB */
  authDatabase?: string;
  /** Replica set name for MongoDB */
  replicaSet?: string;
  /** Force a direct MongoDB connection */
  directConnection?: boolean;
  /** MongoDB read preference */
  readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
  /** Connection mode: 'local' for direct, 'ssh' for tunnel */
  connectionMode: DBConnectionMode;
  /** Optional SSH host ID for tunnel (required when connectionMode is 'ssh') */
  sshHostId?: string | null;
  /** Whether to use SSH tunnel for connection (legacy, derived from connectionMode) */
  sshTunnelEnabled: boolean;
  /** UI color badge (hex color) */
  color?: string;
  /** SSL/TLS enabled */
  ssl?: boolean;
  /**
   * App-level read-only guard.
   * This blocks write operations in OwnShell's database explorer; use a real DB read-only
   * user for hard enforcement outside OwnShell or inside native shells.
   */
  readOnly?: boolean;
  /** Created timestamp */
  createdAt?: number;
  /** Updated timestamp */
  updatedAt?: number;
  /**
   * Execution mode for export/import operations (v1.21.0)
   * - 'direct': Run pg_dump/mysqldump directly on the local machine
   * - 'docker': Run pg_dump/mysqldump inside a Docker container
   */
  executionMode?: 'direct' | 'docker';
  /** Docker container name/ID when executionMode is 'docker' */
  dockerContainer?: string;
}

/**
 * Default ports for each database type
 */
export const DB_DEFAULT_PORTS: Record<DBType, number> = {
  postgres: 5432,
  mysql: 3306,
  redis: 6379,
  sqlite: 0,
  mongodb: 27017,
};

/**
 * SQLite connection configuration
 * Extends base config with file-based connection options
 */
export interface SQLiteConnectionConfig extends Omit<DBConnectionConfig, 'type' | 'host' | 'port'> {
  type: 'sqlite';
  /** Path to the .db/.sqlite file (local) */
  filePath: string;
  /** Whether this is a remote file accessed via SFTP */
  isRemote: boolean;
  /** Remote SFTP path (when isRemote is true) */
  remotePath?: string;
  /** SSH host ID for remote file access */
  remoteHostId?: string;
  /** Local cached copy path (for remote files) */
  localCachePath?: string;
  /** Last sync timestamp */
  lastSyncAt?: number;
}

/**
 * SQLite file info
 */
export interface SQLiteFileInfo {
  /** File path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modifiedAt: number;
  /** Whether file is read-only */
  readOnly: boolean;
  /** SQLite version */
  sqliteVersion?: string;
}

/**
 * Active connection state
 */
export interface DBConnectionState {
  /** Connection ID (runtime) */
  connectionId: string;
  /** Config ID (stored connection) */
  configId: string;
  /** Database type */
  type: DBType;
  /** Connection status */
  status: 'connecting' | 'connected' | 'error' | 'disconnected';
  /** Error message if status is 'error' */
  error?: string;
  /** Tunnel ID if using SSH tunnel */
  tunnelId?: string;
  /** Local port (if tunneled) */
  localPort?: number;
  /** Connected timestamp */
  connectedAt?: Date;
  /** Whether OwnShell blocks write operations for this connection */
  readOnly?: boolean;
}
