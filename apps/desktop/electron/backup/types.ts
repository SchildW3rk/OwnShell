/**
 * Backup/Restore Types
 *
 * Types for the encrypted vault backup system
 */

import { z } from 'zod';

/**
 * Vault file format version
 * Increment when making breaking changes to the format
 */
export const VAULT_VERSION = 1;

/**
 * Magic bytes to identify vault files
 * "OWNVAULT" in ASCII
 */
export const VAULT_MAGIC = Buffer.from('OWNVAULT', 'ascii');

/**
 * File extension for vault files
 */
export const VAULT_EXTENSION = '.ownshell-vault';

// Row schemas mirror the SQLite tables (packages/core/src/db/schema) with secrets in
// PLAINTEXT. Unknown keys are stripped; fields added after the first vault version are
// optional so older backups stay restorable.
const id = z.string();
const nullableId = id.nullable();
const optionalNullableId = nullableId.optional();
const nullableString = z.string().nullable();
const optionalNullableString = nullableString.optional();
const timestamp = z.number();
const flag = z.number();

const vaultHostSchema = z.object({
  id,
  label: z.string(),
  hostname: z.string(),
  port: z.number(),
  username: z.string(),
  auth_type: z.enum(['password', 'key']),
  password: nullableString,
  key_id: nullableId,
  jump_host_id: optionalNullableId,
  connection_type: z.enum(['ssh', 'sftp_only']).optional(),
  favorite: flag.optional(),
  folder_id: optionalNullableId,
  sort_order: z.number().optional(),
  host_key_fingerprint: optionalNullableString,
  created_at: timestamp,
  updated_at: timestamp,
});

const vaultKeySchema = z.object({
  id,
  label: z.string(),
  type: z.enum(['rsa', 'ed25519']),
  public_key: z.string(),
  private_key: z.string(),
  passphrase: nullableString,
  created_at: timestamp,
  updated_at: timestamp,
});

const vaultTunnelSchema = z.object({
  id,
  host_id: id,
  local_port: z.number(),
  remote_host: z.string(),
  remote_port: z.number(),
  name: z.string(),
  auto_start: flag,
  created_at: timestamp,
  updated_at: timestamp,
});

const vaultSnippetSchema = z.object({
  id,
  label: z.string(),
  command: z.string(),
  category: nullableString,
  created_at: timestamp,
  updated_at: timestamp,
});

const vaultS3ConnectionSchema = z.object({
  id,
  label: z.string(),
  endpoint: z.string(),
  region: z.string(),
  access_key_id: z.string(),
  secret_access_key: z.string(),
  bucket_name: nullableString,
  favorite: flag.optional(),
  folder_id: optionalNullableId,
  sort_order: z.number().optional(),
  created_at: timestamp,
  updated_at: timestamp,
});

const vaultSidebarFolderSchema = z.object({
  id,
  resource_type: z.enum(['hosts', 's3', 'databases']),
  name: z.string(),
  sort_order: z.number(),
  created_at: timestamp,
  updated_at: timestamp,
});

const vaultCredentialSchema = z.object({
  id,
  title: z.string(),
  username: nullableString,
  password: z.string(),
  url: nullableString,
  notes: nullableString,
  tags: nullableString,
  favorite: flag,
  created_at: timestamp,
  updated_at: timestamp,
  last_used_at: z.number().nullable(),
});

const vaultEnvironmentSchema = z.object({
  id,
  name: z.string(),
  project: z.string(),
  description: nullableString,
  /** Decrypted variables; other per-variable fields are kept as-is */
  variables: z.array(z.object({ key: z.string(), value: z.string() }).passthrough()),
  host_id: nullableId,
  default_remote_path: nullableString,
  favorite: flag,
  created_at: timestamp,
  updated_at: timestamp,
  last_deployed_at: z.number().nullable(),
});

const vaultDBConnectionSchema = z.object({
  id,
  name: z.string(),
  type: z.enum(['postgres', 'mysql', 'redis', 'sqlite', 'mongodb']),
  host: nullableString,
  port: z.number().nullable(),
  database: nullableString,
  username: nullableString,
  password: nullableString,
  connection_mode: z.enum(['local', 'ssh']),
  ssh_host_id: nullableId,
  ssh_tunnel_enabled: flag,
  ssl_enabled: flag,
  read_only: flag.default(0),
  color: nullableString,
  file_path: nullableString.default(null),
  is_remote: z.number().nullable().default(null),
  remote_path: nullableString.default(null),
  remote_host_id: nullableId.default(null),
  local_cache_path: nullableString.default(null),
  last_sync_at: z.number().nullable().default(null),
  auth_database: nullableString.default(null),
  replica_set: nullableString.default(null),
  connection_uri: nullableString.default(null),
  direct_connection: z.number().nullable().default(null),
  read_preference: nullableString.default(null),
  execution_mode: z.enum(['direct', 'docker']).nullable().default(null),
  docker_container: nullableString.default(null),
  favorite: flag.default(0),
  folder_id: nullableId.default(null),
  sort_order: z.number().default(0),
  created_at: timestamp,
  updated_at: timestamp,
});

const vaultProjectSchema = z.object({
  id,
  name: z.string(),
  host_id: nullableId,
  repository_path: z.string(),
  compose_project: nullableString,
  created_at: timestamp,
  updated_at: timestamp,
});

const vaultApiCollectionSchema = z.object({
  id,
  parent_id: nullableId,
  name: z.string(),
  description: nullableString,
  sort_order: z.number(),
  created_at: timestamp,
  updated_at: timestamp,
});

const vaultApiRequestSchema = z.object({
  id,
  collection_id: nullableId,
  name: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string(),
  params: z.string(),
  headers: z.string(),
  body: z.string(),
  body_type: z.enum(['none', 'json', 'form-data', 'form-urlencoded', 'raw', 'binary']),
  auth_type: z.enum(['none', 'bearer', 'basic', 'api-key', 'inherit']),
  auth_config: z.string(),
  network_host_id: nullableId,
  environment_id: nullableId,
  sort_order: z.number(),
  created_at: timestamp,
  updated_at: timestamp,
  last_executed_at: z.number().nullable(),
});

/**
 * Decrypted vault data structure
 * Contains all user data with secrets in PLAINTEXT
 * (secrets are re-encrypted with backup password in the file)
 */
export const vaultDataSchema = z.object({
  /** Vault format version */
  version: z.number(),
  /** Export timestamp (Unix ms) */
  exportedAt: z.number(),
  /** App version that created this backup */
  appVersion: z.string(),
  hosts: z.array(vaultHostSchema),
  keys: z.array(vaultKeySchema),
  tunnels: z.array(vaultTunnelSchema),
  snippets: z.array(vaultSnippetSchema),
  s3Connections: z.array(vaultS3ConnectionSchema),
  sidebarFolders: z.array(vaultSidebarFolderSchema).default([]),
  // Added after the first vault version. Missing in older backups: restore then leaves
  // the matching tables untouched instead of wiping them.
  vaultCredentials: z.array(vaultCredentialSchema).optional(),
  vaultEnvironments: z.array(vaultEnvironmentSchema).optional(),
  dbConnections: z.array(vaultDBConnectionSchema).optional(),
  projects: z.array(vaultProjectSchema).optional(),
  apiCollections: z.array(vaultApiCollectionSchema).optional(),
  apiRequests: z.array(vaultApiRequestSchema).optional(),
});

export type VaultData = z.infer<typeof vaultDataSchema>;
export type VaultHost = VaultData['hosts'][number];
export type VaultKey = VaultData['keys'][number];
export type VaultS3Connection = VaultData['s3Connections'][number];
export type VaultEnvironment = NonNullable<VaultData['vaultEnvironments']>[number];

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  counts?: VaultCounts;
  error?: string;
}

/**
 * Item counts per backup section (sections missing from older backups count as 0)
 */
export interface VaultCounts {
  hosts: number;
  keys: number;
  tunnels: number;
  snippets: number;
  s3Connections: number;
  vaultCredentials: number;
  vaultEnvironments: number;
  dbConnections: number;
  projects: number;
  apiCollections: number;
  apiRequests: number;
}

export function countVaultItems(data: VaultData): VaultCounts {
  return {
    hosts: data.hosts.length,
    keys: data.keys.length,
    tunnels: data.tunnels.length,
    snippets: data.snippets.length,
    s3Connections: data.s3Connections.length,
    vaultCredentials: data.vaultCredentials?.length ?? 0,
    vaultEnvironments: data.vaultEnvironments?.length ?? 0,
    dbConnections: data.dbConnections?.length ?? 0,
    projects: data.projects?.length ?? 0,
    apiCollections: data.apiCollections?.length ?? 0,
    apiRequests: data.apiRequests?.length ?? 0,
  };
}
