/**
 * Database type union
 */
export type DBConnectionType = 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'mongodb';

/**
 * Database Connection table (v1.15.0 Multi-DB Suite)
 * Stores database connections for the DB Explorer
 * Supports PostgreSQL, MySQL, Redis, SQLite, and MongoDB
 */
export interface DBConnectionsTable {
  id: string; // UUID v4
  name: string; // Display name (e.g., "Production Postgres")
  type: DBConnectionType; // Database type
  host: string | null; // Database host (IP or hostname) - null for SQLite
  port: number | null; // Database port - null for SQLite
  database: string | null; // Database name (null for Redis/SQLite)
  username: string | null; // Username (null for Redis without auth)
  password_encrypted: string | null; // AES-256-GCM encrypted password
  connection_mode: 'local' | 'ssh'; // Connection mode: direct or via SSH tunnel
  ssh_host_id: string | null; // Foreign key to hosts table (for SSH tunnel)
  ssh_tunnel_enabled: number; // 0 or 1 (SQLite boolean) - legacy, kept for compatibility
  ssl_enabled: number; // 0 or 1 (SQLite boolean), kept in sync with ssl_mode
  ssl_mode: 'disabled' | 'require' | 'require-no-verify' | null; // null = derive from ssl_enabled
  ssl_ca_encrypted: string | null; // encrypted CA PEM; never sent to the renderer
  ssl_ca_fingerprint: string | null; // SHA-256 of the CA certificate, safe to show
  ssl_legacy_hint: number | null; // 1 = migrated SSL connection that does not verify yet (one-time hint); column is NOT NULL DEFAULT 0
  read_only: number; // 0 or 1 (SQLite boolean) - block write operations in the DB explorer
  color: string | null; // UI color badge (hex)
  // SQLite-specific fields (v1.15.0)
  file_path: string | null; // Path to .db/.sqlite file
  is_remote: number | null; // 0 or 1 - whether file is accessed via SFTP
  remote_path: string | null; // Remote SFTP path
  remote_host_id: string | null; // SSH host ID for remote file access
  local_cache_path: string | null; // Local cached copy path
  last_sync_at: number | null; // Last sync timestamp
  // MongoDB-specific fields (v1.15.0)
  auth_database: string | null; // Authentication database (default: 'admin')
  replica_set: string | null; // Replica set name
  connection_uri: string | null; // Full connection URI
  direct_connection: number | null; // 0 or 1 - bypass replica set discovery
  read_preference: string | null; // Read preference setting
  // Export/Import execution mode (v1.21.0)
  execution_mode: 'direct' | 'docker' | null; // How to run pg_dump/mysql_dump (null = 'direct')
  docker_container: string | null; // Docker container name (when execution_mode = 'docker')
  // Sidebar organization
  favorite: number; // SQLite boolean (0/1)
  folder_id: string | null;
  sort_order: number;
  // Timestamps
  created_at: number; // Unix timestamp in milliseconds
  updated_at: number; // Unix timestamp in milliseconds
}

export interface NewDBConnection {
  id: string;
  name: string;
  type: DBConnectionType;
  host: string | null;
  port: number | null;
  database: string | null;
  username: string | null;
  password_encrypted: string | null;
  connection_mode: 'local' | 'ssh';
  ssh_host_id: string | null;
  ssh_tunnel_enabled: number;
  ssl_enabled: number;
  ssl_mode?: 'disabled' | 'require' | 'require-no-verify' | null;
  ssl_ca_encrypted?: string | null;
  ssl_ca_fingerprint?: string | null;
  ssl_legacy_hint?: number;
  read_only?: number;
  color: string | null;
  // SQLite fields
  file_path?: string | null;
  is_remote?: number | null;
  remote_path?: string | null;
  remote_host_id?: string | null;
  local_cache_path?: string | null;
  last_sync_at?: number | null;
  // MongoDB fields
  auth_database?: string | null;
  replica_set?: string | null;
  connection_uri?: string | null;
  direct_connection?: number | null;
  read_preference?: string | null;
  // Export/Import execution mode
  execution_mode?: 'direct' | 'docker' | null;
  docker_container?: string | null;
  // Sidebar organization
  favorite?: number;
  folder_id?: string | null;
  sort_order?: number;
  // Timestamps
  created_at: number;
  updated_at: number;
}

export interface DBConnectionUpdate {
  name?: string;
  type?: DBConnectionType;
  host?: string | null;
  port?: number | null;
  database?: string | null;
  username?: string | null;
  password_encrypted?: string | null;
  connection_mode?: 'local' | 'ssh';
  ssh_host_id?: string | null;
  ssh_tunnel_enabled?: number;
  ssl_enabled?: number;
  ssl_mode?: 'disabled' | 'require' | 'require-no-verify' | null;
  ssl_ca_encrypted?: string | null;
  ssl_ca_fingerprint?: string | null;
  ssl_legacy_hint?: number;
  read_only?: number;
  color?: string | null;
  // SQLite fields
  file_path?: string | null;
  is_remote?: number | null;
  remote_path?: string | null;
  remote_host_id?: string | null;
  local_cache_path?: string | null;
  last_sync_at?: number | null;
  // MongoDB fields
  auth_database?: string | null;
  replica_set?: string | null;
  connection_uri?: string | null;
  direct_connection?: number | null;
  read_preference?: string | null;
  // Export/Import execution mode
  execution_mode?: 'direct' | 'docker' | null;
  docker_container?: string | null;
  // Sidebar organization
  favorite?: number;
  folder_id?: string | null;
  sort_order?: number;
  // Timestamps
  updated_at: number;
}

/**
 * Database Query History table
 * Stores executed queries for history and quick access
 */
export interface DBQueryHistoryTable {
  id: string; // UUID v4
  connection_id: string; // Foreign key to db_connections table
  query: string; // SQL query text
  execution_time: number; // Execution time in milliseconds
  row_count: number; // Number of rows returned/affected
  success: number; // 0 or 1 (SQLite boolean)
  error: string | null; // Error message if failed
  executed_at: number; // Unix timestamp in milliseconds
}

export interface NewDBQueryHistory {
  id: string;
  connection_id: string;
  query: string;
  execution_time: number;
  row_count: number;
  success: number;
  error: string | null;
  executed_at: number;
}
