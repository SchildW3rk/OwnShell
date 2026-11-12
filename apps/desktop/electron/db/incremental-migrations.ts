import type Database from 'better-sqlite3';
import { logger } from '../logger';

/**
 * Run incremental migrations for schema updates.
 * These handle adding new columns to existing tables and run before the main
 * migration to ensure columns exist for index creation.
 */
export function runIncrementalMigrations(sqlite: Database.Database): void {
  try {
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='db_connections'")
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      logger.info('Migration 007 skipped: db_connections table does not exist yet');
    } else {
      const tableInfo = sqlite.prepare('PRAGMA table_info(db_connections)').all() as Array<{
        name: string;
      }>;
      const hasConnectionMode = tableInfo.some((col) => col.name === 'connection_mode');

      if (!hasConnectionMode) {
        logger.info('Running migration 007: Adding connection_mode to db_connections');
        sqlite.exec(`
          ALTER TABLE db_connections ADD COLUMN connection_mode TEXT DEFAULT 'ssh';
        `);
        sqlite.exec(`
          UPDATE db_connections SET connection_mode = 'ssh' WHERE connection_mode IS NULL;
        `);
        logger.info('Migration 007 completed: connection_mode column added');
      }
    }
  } catch (error) {
    logger.warn('Migration 007 skipped or failed (may already exist)', error);
  }

  try {
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='db_connections'")
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      logger.info('Migration 008 skipped: db_connections table does not exist yet');
    } else {
      const tableInfo = sqlite.prepare('PRAGMA table_info(db_connections)').all() as Array<{
        name: string;
      }>;

      const hasFilePath = tableInfo.some((col) => col.name === 'file_path');
      if (!hasFilePath) {
        logger.info('Running migration 008a: Adding SQLite fields to db_connections');
        sqlite.exec(`
          ALTER TABLE db_connections ADD COLUMN file_path TEXT;
          ALTER TABLE db_connections ADD COLUMN is_remote INTEGER DEFAULT 0;
          ALTER TABLE db_connections ADD COLUMN remote_path TEXT;
          ALTER TABLE db_connections ADD COLUMN remote_host_id TEXT;
          ALTER TABLE db_connections ADD COLUMN local_cache_path TEXT;
          ALTER TABLE db_connections ADD COLUMN last_sync_at INTEGER;
        `);
        logger.info('Migration 008a completed: SQLite fields added');
      }

      const hasAuthDatabase = tableInfo.some((col) => col.name === 'auth_database');
      if (!hasAuthDatabase) {
        logger.info('Running migration 008b: Adding MongoDB fields to db_connections');
        sqlite.exec(`
          ALTER TABLE db_connections ADD COLUMN auth_database TEXT;
          ALTER TABLE db_connections ADD COLUMN replica_set TEXT;
          ALTER TABLE db_connections ADD COLUMN connection_uri TEXT;
          ALTER TABLE db_connections ADD COLUMN direct_connection INTEGER DEFAULT 0;
          ALTER TABLE db_connections ADD COLUMN read_preference TEXT;
        `);
        logger.info('Migration 008b completed: MongoDB fields added');
      }
    }
  } catch (error) {
    logger.warn('Migration 008 skipped or failed', error);
  }

  try {
    const hostsTable = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hosts'")
      .all() as Array<{ name: string }>;

    if (hostsTable.length > 0) {
      const hostsInfo = sqlite.prepare('PRAGMA table_info(hosts)').all() as Array<{
        name: string;
      }>;
      const hasConnectionType = hostsInfo.some((col) => col.name === 'connection_type');

      if (!hasConnectionType) {
        logger.info('Running migration 009a: Adding connection_type to hosts');
        sqlite.exec(`
          ALTER TABLE hosts ADD COLUMN connection_type TEXT DEFAULT 'ssh' CHECK (connection_type IN ('ssh', 'sftp_only'));
        `);
        sqlite.exec(`
          UPDATE hosts SET connection_type = 'ssh' WHERE connection_type IS NULL;
        `);
        logger.info('Migration 009a completed: connection_type column added to hosts');
      }
    }

    const transferQueueExists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='transfer_queue'")
      .all() as Array<{ name: string }>;

    if (transferQueueExists.length === 0) {
      logger.info('Running migration 009b: Creating transfer_queue table');
      sqlite.exec(`
        CREATE TABLE transfer_queue (
          id TEXT PRIMARY KEY NOT NULL,
          host_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('upload', 'download')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'completed', 'failed', 'cancelled')),
          local_path TEXT NOT NULL,
          remote_path TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_size INTEGER,
          transferred INTEGER DEFAULT 0,
          error TEXT,
          priority INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          completed_at INTEGER,
          FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_transfer_queue_host_id ON transfer_queue(host_id);
        CREATE INDEX idx_transfer_queue_status ON transfer_queue(status);
        CREATE INDEX idx_transfer_queue_created_at ON transfer_queue(created_at DESC);
        CREATE INDEX idx_transfer_queue_priority ON transfer_queue(priority DESC);
      `);
      logger.info('Migration 009b completed: transfer_queue table created');
    }

    const transferHistoryExists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='transfer_history'")
      .all() as Array<{ name: string }>;

    if (transferHistoryExists.length === 0) {
      logger.info('Running migration 009c: Creating transfer_history table');
      sqlite.exec(`
        CREATE TABLE transfer_history (
          id TEXT PRIMARY KEY NOT NULL,
          host_id TEXT NOT NULL,
          host_label TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('upload', 'download')),
          status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'cancelled')),
          local_path TEXT NOT NULL,
          remote_path TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_size INTEGER,
          transferred INTEGER DEFAULT 0,
          error TEXT,
          started_at INTEGER,
          completed_at INTEGER NOT NULL,
          FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE SET NULL
        );

        CREATE INDEX idx_transfer_history_host_id ON transfer_history(host_id);
        CREATE INDEX idx_transfer_history_completed_at ON transfer_history(completed_at DESC);
        CREATE INDEX idx_transfer_history_type ON transfer_history(type);
        CREATE INDEX idx_transfer_history_status ON transfer_history(status);
      `);
      logger.info('Migration 009c completed: transfer_history table created');
    }
  } catch (error) {
    logger.warn('Migration 009 skipped or failed', error);
  }

  try {
    const vaultCredentialsExists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vault_credentials'")
      .all() as Array<{ name: string }>;

    if (vaultCredentialsExists.length === 0) {
      logger.info('Running migration 010a: Creating vault_credentials table');
      sqlite.exec(`
        CREATE TABLE vault_credentials (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          username TEXT,
          password_encrypted TEXT NOT NULL,
          url TEXT,
          notes TEXT,
          tags TEXT,
          favorite INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_used_at INTEGER
        );

        CREATE INDEX idx_vault_credentials_title ON vault_credentials(title);
        CREATE INDEX idx_vault_credentials_favorite ON vault_credentials(favorite DESC);
        CREATE INDEX idx_vault_credentials_created_at ON vault_credentials(created_at DESC);
        CREATE INDEX idx_vault_credentials_last_used_at ON vault_credentials(last_used_at DESC);
      `);
      logger.info('Migration 010a completed: vault_credentials table created');
    }

    const vaultEnvironmentsExists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vault_environments'")
      .all() as Array<{ name: string }>;

    if (vaultEnvironmentsExists.length === 0) {
      logger.info('Running migration 010b: Creating vault_environments table');
      sqlite.exec(`
        CREATE TABLE vault_environments (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          project TEXT NOT NULL,
          description TEXT,
          variables TEXT NOT NULL,
          host_id TEXT,
          default_remote_path TEXT,
          favorite INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_deployed_at INTEGER,
          FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE SET NULL
        );

        CREATE INDEX idx_vault_environments_name ON vault_environments(name);
        CREATE INDEX idx_vault_environments_project ON vault_environments(project);
        CREATE INDEX idx_vault_environments_favorite ON vault_environments(favorite DESC);
        CREATE INDEX idx_vault_environments_created_at ON vault_environments(created_at DESC);
        CREATE INDEX idx_vault_environments_host_id ON vault_environments(host_id);
      `);
      logger.info('Migration 010b completed: vault_environments table created');
    }
  } catch (error) {
    logger.warn('Migration 010 skipped or failed', error);
  }

  try {
    const apiCollectionsExists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_collections'")
      .all() as Array<{ name: string }>;

    if (apiCollectionsExists.length === 0) {
      logger.info('Running migration 011a: Creating api_collections table');
      sqlite.exec(`
        CREATE TABLE api_collections (
          id TEXT PRIMARY KEY NOT NULL,
          parent_id TEXT,
          name TEXT NOT NULL,
          description TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (parent_id) REFERENCES api_collections(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_api_collections_parent_id ON api_collections(parent_id);
        CREATE INDEX idx_api_collections_sort_order ON api_collections(sort_order);
        CREATE INDEX idx_api_collections_created_at ON api_collections(created_at DESC);
      `);
      logger.info('Migration 011a completed: api_collections table created');
    }

    const apiRequestsExists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_requests'")
      .all() as Array<{ name: string }>;

    if (apiRequestsExists.length === 0) {
      logger.info('Running migration 011b: Creating api_requests table');
      sqlite.exec(`
        CREATE TABLE api_requests (
          id TEXT PRIMARY KEY NOT NULL,
          collection_id TEXT,
          name TEXT NOT NULL,
          method TEXT NOT NULL DEFAULT 'GET' CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
          url TEXT NOT NULL DEFAULT '',
          params TEXT NOT NULL DEFAULT '[]',
          headers TEXT NOT NULL DEFAULT '[]',
          body TEXT NOT NULL DEFAULT '',
          body_type TEXT NOT NULL DEFAULT 'none' CHECK (body_type IN ('none', 'json', 'form-data', 'form-urlencoded', 'raw', 'binary')),
          auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'basic', 'api-key', 'inherit')),
          auth_config TEXT NOT NULL DEFAULT '{}',
          network_host_id TEXT,
          environment_id TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_executed_at INTEGER,
          FOREIGN KEY (collection_id) REFERENCES api_collections(id) ON DELETE SET NULL,
          FOREIGN KEY (network_host_id) REFERENCES hosts(id) ON DELETE SET NULL,
          FOREIGN KEY (environment_id) REFERENCES vault_environments(id) ON DELETE SET NULL
        );

        CREATE INDEX idx_api_requests_collection_id ON api_requests(collection_id);
        CREATE INDEX idx_api_requests_method ON api_requests(method);
        CREATE INDEX idx_api_requests_sort_order ON api_requests(sort_order);
        CREATE INDEX idx_api_requests_created_at ON api_requests(created_at DESC);
        CREATE INDEX idx_api_requests_network_host_id ON api_requests(network_host_id);
        CREATE INDEX idx_api_requests_environment_id ON api_requests(environment_id);
      `);
      logger.info('Migration 011b completed: api_requests table created');
    }
  } catch (error) {
    logger.warn('Migration 011 skipped or failed', error);
  }

  try {
    const dbConnectionsTable = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='db_connections'")
      .all() as Array<{ name: string }>;

    if (dbConnectionsTable.length > 0) {
      const tableInfo = sqlite.prepare('PRAGMA table_info(db_connections)').all() as Array<{
        name: string;
      }>;
      const hasExecutionMode = tableInfo.some((col) => col.name === 'execution_mode');

      if (!hasExecutionMode) {
        logger.info(
          'Running migration 012: Adding execution_mode and docker_container to db_connections'
        );
        sqlite.exec(`
          ALTER TABLE db_connections ADD COLUMN execution_mode TEXT DEFAULT 'direct' CHECK (execution_mode IN ('direct', 'docker'));
          ALTER TABLE db_connections ADD COLUMN docker_container TEXT;
        `);
        logger.info('Migration 012 completed: Docker execution mode fields added');
      }
    }
  } catch (error) {
    logger.warn('Migration 012 skipped or failed', error);
  }

  try {
    logger.info('Running migration 013: Sidebar folders and favorites metadata');

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS sidebar_folders (
        id TEXT PRIMARY KEY NOT NULL,
        resource_type TEXT NOT NULL CHECK (resource_type IN ('hosts', 's3', 'databases')),
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sidebar_folders_resource_type ON sidebar_folders(resource_type);
      CREATE INDEX IF NOT EXISTS idx_sidebar_folders_sort_order ON sidebar_folders(resource_type, sort_order);
    `);

    const tableExists = (tableName: string) =>
      Boolean(
        sqlite
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
          .get(tableName)
      );

    const addColumnIfMissing = (tableName: string, columnName: string, definition: string) => {
      const existingTable = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .get(tableName);

      if (!existingTable) {
        return;
      }

      const tableInfo = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
        name: string;
      }>;
      const hasColumn = tableInfo.some((col) => col.name === columnName);

      if (!hasColumn) {
        sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition};`);
      }
    };

    addColumnIfMissing('hosts', 'favorite', 'favorite INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('hosts', 'folder_id', 'folder_id TEXT');
    addColumnIfMissing('hosts', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('hosts', 'host_key_fingerprint', 'host_key_fingerprint TEXT');

    addColumnIfMissing('s3_connections', 'favorite', 'favorite INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('s3_connections', 'folder_id', 'folder_id TEXT');
    addColumnIfMissing('s3_connections', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');

    addColumnIfMissing('db_connections', 'favorite', 'favorite INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('db_connections', 'folder_id', 'folder_id TEXT');
    addColumnIfMissing('db_connections', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('db_connections', 'read_only', 'read_only INTEGER NOT NULL DEFAULT 0');

    if (tableExists('hosts')) {
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_hosts_favorite ON hosts(favorite DESC);
        CREATE INDEX IF NOT EXISTS idx_hosts_folder_id ON hosts(folder_id);
      `);
    }

    if (tableExists('s3_connections')) {
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_s3_connections_favorite ON s3_connections(favorite DESC);
        CREATE INDEX IF NOT EXISTS idx_s3_connections_folder_id ON s3_connections(folder_id);
      `);
    }

    if (tableExists('db_connections')) {
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_db_connections_favorite ON db_connections(favorite DESC);
        CREATE INDEX IF NOT EXISTS idx_db_connections_folder_id ON db_connections(folder_id);
      `);
    }

    logger.info('Migration 013 completed: sidebar folders and metadata ready');
  } catch (error) {
    logger.warn('Migration 013 skipped or failed', error);
  }

  try {
    logger.info('Running migration 014: Local projects');
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        host_id TEXT,
        repository_path TEXT NOT NULL,
        compose_project TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
      CREATE INDEX IF NOT EXISTS idx_projects_host_id ON projects(host_id);
      CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
    `);
    logger.info('Migration 014 completed: Local projects ready');
  } catch (error) {
    logger.warn('Migration 014 skipped or failed', error);
  }

  try {
    const addColumnIfMissing = (tableName: string, columnName: string, definition: string) => {
      const tableInfo = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
        name: string;
      }>;
      if (tableInfo.length > 0 && !tableInfo.some((col) => col.name === columnName)) {
        sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition};`);
      }
    };

    addColumnIfMissing('api_collections', 'auth_type', "auth_type TEXT NOT NULL DEFAULT 'inherit'");
    addColumnIfMissing('api_collections', 'auth_config', "auth_config TEXT NOT NULL DEFAULT '{}'");
    addColumnIfMissing('api_requests', 'raw_content_type', "raw_content_type TEXT NOT NULL DEFAULT 'text'");
    logger.info('Migration 015 completed: API collection auth and raw content type');
  } catch (error) {
    logger.warn('Migration 015 skipped or failed', error);
  }

  try {
    const columns = sqlite.prepare('PRAGMA table_info(api_requests)').all() as Array<{ name: string }>;
    // Nullable on purpose: NULL means the built-in default (30 s, follow redirects, verify TLS).
    for (const column of ['timeout_seconds', 'follow_redirects', 'verify_tls']) {
      if (columns.length > 0 && !columns.some((col) => col.name === column)) {
        sqlite.exec(`ALTER TABLE api_requests ADD COLUMN ${column} INTEGER;`);
      }
    }
    logger.info('Migration 016 completed: API request settings');
  } catch (error) {
    logger.warn('Migration 016 skipped or failed', error);
  }
}
