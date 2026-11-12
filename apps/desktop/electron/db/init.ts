/**
 * Database Initialization (Native SQLite with better-sqlite3)
 *
 * This module initializes the SQLite database with native performance.
 * Data is persisted to: app.getPath('userData')/ownshell.db
 *
 * Features:
 * - Native SQLite performance via better-sqlite3
 * - WAL mode for better concurrency
 * - Automatic file persistence
 * - Foreign key enforcement
 */

import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database as DatabaseSchema } from '@ownshell/core';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from '../logger';
import { runIncrementalMigrations } from './incremental-migrations';

// Store sqlite instance for migrations
let sqliteInstance: Database.Database | null = null;

/**
 * Creates and initializes the SQLite database
 *
 * @returns Kysely database instance
 */
export async function initDatabase(): Promise<Kysely<DatabaseSchema>> {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'ownshell.db');

  logger.info('Initializing database', { path: dbPath });

  // Ensure userData directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
    logger.info('Created userData directory', { path: userDataPath });
  }

  // Create native SQLite database
  const sqlite = new Database(dbPath, {
    // verbose: console.log, // Uncomment for SQL debugging
  });

  // Store instance for migrations
  sqliteInstance = sqlite;

  // Enable WAL mode for better concurrency
  sqlite.pragma('journal_mode = WAL');

  // Foreign keys enforcement
  sqlite.pragma('foreign_keys = ON');

  // Create Kysely instance with SqliteDialect
  const db = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database: sqlite,
    }),
  });

  logger.info('Database initialized successfully (native better-sqlite3)');

  return db;
}

/**
 * Runs database migrations
 *
 * @param db - Kysely database instance
 */
export async function runMigrations(_db: Kysely<DatabaseSchema>): Promise<void> {
  logger.info('Running database migrations...');

  try {
    // Execute migration using stored sqlite instance
    if (!sqliteInstance) {
      throw new Error('Database not initialized. Call initDatabase() first.');
    }

    // Run incremental migrations FIRST to add new columns before index creation
    // This handles existing databases that need schema updates
    runIncrementalMigrations(sqliteInstance);

    // The inline schema is the single source of truth for fresh installs.
    sqliteInstance.exec(getInlineMigration());
    // A fresh profile has no tables during the preflight above. Apply the same
    // idempotent upgrades after creating the initial schema as well.
    runIncrementalMigrations(sqliteInstance);

    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Failed to run database migrations', error);
    throw error;
  }
}

/**
 * Initial schema (idempotent)
 */
function getInlineMigration(): string {
  return `
    -- Migration 001: Initial Schema
    CREATE TABLE IF NOT EXISTS hosts (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      hostname TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL,
      auth_type TEXT NOT NULL CHECK (auth_type IN ('password', 'key')),
      password_encrypted TEXT,
      key_id TEXT,
      jump_host_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      folder_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (key_id) REFERENCES keys(id) ON DELETE SET NULL,
      FOREIGN KEY (jump_host_id) REFERENCES hosts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_hosts_label ON hosts(label);
    CREATE INDEX IF NOT EXISTS idx_hosts_hostname ON hosts(hostname);
    CREATE INDEX IF NOT EXISTS idx_hosts_created_at ON hosts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hosts_jump_host_id ON hosts(jump_host_id);
    CREATE INDEX IF NOT EXISTS idx_hosts_favorite ON hosts(favorite DESC);
    CREATE INDEX IF NOT EXISTS idx_hosts_folder_id ON hosts(folder_id);

    -- Migration 014: Local Projects
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

    CREATE TABLE IF NOT EXISTS keys (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('rsa', 'ed25519')),
      public_key TEXT NOT NULL,
      private_key_encrypted TEXT NOT NULL,
      passphrase_encrypted TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_keys_label ON keys(label);
    CREATE INDEX IF NOT EXISTS idx_keys_type ON keys(type);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Migration 002: Host Tunnels (Port Forwarding)
    CREATE TABLE IF NOT EXISTS host_tunnels (
      id TEXT PRIMARY KEY NOT NULL,
      host_id TEXT NOT NULL,
      local_port INTEGER NOT NULL,
      remote_host TEXT NOT NULL,
      remote_port INTEGER NOT NULL,
      name TEXT NOT NULL,
      auto_start INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_host_tunnels_host_id ON host_tunnels(host_id);
    CREATE INDEX IF NOT EXISTS idx_host_tunnels_auto_start ON host_tunnels(auto_start);

    -- Migration 003: Snippets (Quick Commands)
    CREATE TABLE IF NOT EXISTS snippets (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      command TEXT NOT NULL,
      category TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snippets_category ON snippets(category);
    CREATE INDEX IF NOT EXISTS idx_snippets_created_at ON snippets(created_at DESC);

    -- Migration 004: S3 Connections (Object Storage)
    CREATE TABLE IF NOT EXISTS s3_connections (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      region TEXT NOT NULL,
      access_key_id_encrypted TEXT NOT NULL,
      secret_access_key_encrypted TEXT NOT NULL,
      bucket_name TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      folder_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_s3_connections_label ON s3_connections(label);
    CREATE INDEX IF NOT EXISTS idx_s3_connections_created_at ON s3_connections(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_s3_connections_favorite ON s3_connections(favorite DESC);
    CREATE INDEX IF NOT EXISTS idx_s3_connections_folder_id ON s3_connections(folder_id);

    -- Migration 005: Database Connections (DB Explorer v1.15.0 Multi-DB Suite)
    CREATE TABLE IF NOT EXISTS db_connections (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('postgres', 'mysql', 'redis', 'sqlite', 'mongodb')),
      host TEXT,
      port INTEGER,
      database TEXT,
      username TEXT,
      password_encrypted TEXT,
      connection_mode TEXT NOT NULL DEFAULT 'ssh' CHECK (connection_mode IN ('local', 'ssh')),
      ssh_host_id TEXT,
      ssh_tunnel_enabled INTEGER NOT NULL DEFAULT 0,
      ssl_enabled INTEGER NOT NULL DEFAULT 0,
      read_only INTEGER NOT NULL DEFAULT 0,
      color TEXT,
      -- SQLite-specific fields (v1.15.0)
      file_path TEXT,
      is_remote INTEGER DEFAULT 0,
      remote_path TEXT,
      remote_host_id TEXT,
      local_cache_path TEXT,
      last_sync_at INTEGER,
      -- MongoDB-specific fields (v1.15.0)
      auth_database TEXT,
      replica_set TEXT,
      connection_uri TEXT,
      direct_connection INTEGER DEFAULT 0,
      read_preference TEXT,
      -- Export/Import execution mode (v1.21.0)
      execution_mode TEXT DEFAULT 'direct' CHECK (execution_mode IN ('direct', 'docker')),
      docker_container TEXT,
      -- Sidebar organization
      favorite INTEGER NOT NULL DEFAULT 0,
      folder_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      -- Timestamps
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (ssh_host_id) REFERENCES hosts(id) ON DELETE SET NULL,
      FOREIGN KEY (remote_host_id) REFERENCES hosts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_db_connections_name ON db_connections(name);
    CREATE INDEX IF NOT EXISTS idx_db_connections_type ON db_connections(type);
    CREATE INDEX IF NOT EXISTS idx_db_connections_connection_mode ON db_connections(connection_mode);
    CREATE INDEX IF NOT EXISTS idx_db_connections_ssh_host_id ON db_connections(ssh_host_id);
    CREATE INDEX IF NOT EXISTS idx_db_connections_created_at ON db_connections(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_db_connections_favorite ON db_connections(favorite DESC);
    CREATE INDEX IF NOT EXISTS idx_db_connections_folder_id ON db_connections(folder_id);

    -- Migration 013: Shared sidebar folders
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

    -- Migration 006: Database Query History
    CREATE TABLE IF NOT EXISTS db_query_history (
      id TEXT PRIMARY KEY NOT NULL,
      connection_id TEXT NOT NULL,
      query TEXT NOT NULL,
      execution_time INTEGER NOT NULL,
      row_count INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      error TEXT,
      executed_at INTEGER NOT NULL,
      FOREIGN KEY (connection_id) REFERENCES db_connections(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_db_query_history_connection_id ON db_query_history(connection_id);
    CREATE INDEX IF NOT EXISTS idx_db_query_history_executed_at ON db_query_history(executed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_db_query_history_success ON db_query_history(success);

    -- Migration 009: SFTP Standalone & Bulk Transfer Engine (v1.16.0)
    -- Note: hosts.connection_type is added via incremental migration above

    CREATE TABLE IF NOT EXISTS transfer_queue (
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

    CREATE INDEX IF NOT EXISTS idx_transfer_queue_host_id ON transfer_queue(host_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_queue_status ON transfer_queue(status);
    CREATE INDEX IF NOT EXISTS idx_transfer_queue_created_at ON transfer_queue(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transfer_queue_priority ON transfer_queue(priority DESC);

    CREATE TABLE IF NOT EXISTS transfer_history (
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

    CREATE INDEX IF NOT EXISTS idx_transfer_history_host_id ON transfer_history(host_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_history_completed_at ON transfer_history(completed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transfer_history_type ON transfer_history(type);
    CREATE INDEX IF NOT EXISTS idx_transfer_history_status ON transfer_history(status);

    -- Vault Credentials (v1.17.0)
    CREATE TABLE IF NOT EXISTS vault_credentials (
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

    CREATE INDEX IF NOT EXISTS idx_vault_credentials_title ON vault_credentials(title);
    CREATE INDEX IF NOT EXISTS idx_vault_credentials_favorite ON vault_credentials(favorite DESC);
    CREATE INDEX IF NOT EXISTS idx_vault_credentials_created_at ON vault_credentials(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_vault_credentials_last_used_at ON vault_credentials(last_used_at DESC);

    -- Vault Environments (v1.17.0)
    CREATE TABLE IF NOT EXISTS vault_environments (
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

    CREATE INDEX IF NOT EXISTS idx_vault_environments_name ON vault_environments(name);
    CREATE INDEX IF NOT EXISTS idx_vault_environments_project ON vault_environments(project);
    CREATE INDEX IF NOT EXISTS idx_vault_environments_favorite ON vault_environments(favorite DESC);
    CREATE INDEX IF NOT EXISTS idx_vault_environments_created_at ON vault_environments(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_vault_environments_host_id ON vault_environments(host_id);

    INSERT OR IGNORE INTO app_settings (key, value, updated_at)
    VALUES
      ('auto_lock_enabled', 'true', ${Date.now()}),
      ('auto_lock_timeout', '5', ${Date.now()});
  `;
}

/**
 * Closes the database connection
 *
 * @param db - Kysely database instance
 */
export function closeDatabase(_db: Kysely<DatabaseSchema>): void {
  try {
    if (sqliteInstance) {
      sqliteInstance.close();
      sqliteInstance = null;
    }
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Failed to close database connection', error);
  }
}
