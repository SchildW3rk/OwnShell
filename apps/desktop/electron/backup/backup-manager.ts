/**
 * Backup Manager
 *
 * Handles encrypted vault export and import operations
 *
 * File Format:
 * [8 bytes]  Magic: "OWNVAULT"
 * [1 byte]   Version
 * [32 bytes] Salt (for scrypt key derivation)
 * [16 bytes] IV (for AES-256-GCM)
 * [16 bytes] Auth Tag (for AES-256-GCM)
 * [rest]     Encrypted gzipped JSON
 *
 * Security:
 * - Secrets are decrypted with master key, then re-encrypted with backup password
 * - Uses scrypt for key derivation (memory-hard, resistant to GPU attacks)
 * - Uses AES-256-GCM for authenticated encryption
 * - Restore runs in atomic transaction with rollback on error
 */

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto';
import { app } from 'electron';
import { gzipSync, gunzipSync } from 'zlib';
import { Kysely, sql } from 'kysely';
import {
  Database,
  HostQueries,
  KeyQueries,
  S3ConnectionQueries,
  NewKey,
  NewHostTunnel,
  NewSnippet,
} from '@ownshell/core';
import { v4 as uuidv4 } from 'uuid';
import {
  decryptVariables,
  encryptVariables,
  GLOBAL_VARIABLES_SETTING,
} from '../http/api-variables';
import { revealAuthSecrets, storedAuthConfig } from '../http/oauth';
import { cryptoManager } from '../security/crypto';
import { caCertificateFingerprint } from '../db-explorer/connection/tls-options';
import { logger } from '../logger';
import {
  VaultData,
  VaultEnvironment,
  VaultHost,
  VaultKey,
  VaultS3Connection,
  VAULT_MAGIC,
  VAULT_VERSION,
  vaultDataSchema,
} from './types';

type SecretCodec = (value: string) => string;

/** Environment variables are stored as JSON with each value encrypted. */
export function decryptEnvironmentVariables(
  variablesJson: string,
  decrypt: SecretCodec
): VaultEnvironment['variables'] {
  const variables = JSON.parse(variablesJson) as Array<Record<string, unknown>>;
  return variables.map(({ value_encrypted, ...rest }) => ({
    ...rest,
    key: String(rest.key ?? ''),
    value: typeof value_encrypted === 'string' ? decrypt(value_encrypted) : '',
  }));
}

export function encryptEnvironmentVariables(
  variables: VaultEnvironment['variables'],
  encrypt: SecretCodec
): string {
  return JSON.stringify(
    variables.map(({ value, ...rest }) => ({ ...rest, value_encrypted: encrypt(value) }))
  );
}

/**
 * Decrypts and validates the vault JSON. Throws on anything that is not a vault payload,
 * so a tampered/foreign file never reaches the restore transaction.
 */
export function parseVaultJson(json: string): VaultData {
  const parsed = vaultDataSchema.safeParse(JSON.parse(json));
  if (!parsed.success) {
    throw new Error('Invalid vault file: unexpected contents');
  }
  return parsed.data;
}

// Crypto constants
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_N = 16384; // CPU/memory cost parameter
const SCRYPT_R = 8; // Block size
const SCRYPT_P = 1; // Parallelization

/**
 * BackupManager class
 * Handles export and import of encrypted vault files
 */

export class BackupManager {
  constructor(private db: Kysely<Database>) {}

  /**
   * Export all user data to an encrypted vault buffer
   *
   * @param password - Backup password (used to encrypt the vault)
   * @returns Encrypted vault buffer
   * @throws Error if app is locked or export fails
   */
  async exportVault(password: string): Promise<Buffer> {
    logger.info('Starting vault export');

    // App must be unlocked to decrypt secrets
    if (!cryptoManager.isUnlocked()) {
      throw new Error('App must be unlocked to export vault');
    }

    // Load all data and validate it with the import schema, so every export is restorable
    const loaded = await this.loadAllData();
    const validated = vaultDataSchema.safeParse(loaded);
    if (!validated.success) {
      logger.error('Vault export failed validation', validated.error.issues.slice(0, 5));
      throw new Error('Vault export failed: stored data does not match the backup format');
    }
    const vaultData = validated.data;

    logger.info('Vault data collected', {
      hosts: vaultData.hosts.length,
      keys: vaultData.keys.length,
      tunnels: vaultData.tunnels.length,
      snippets: vaultData.snippets.length,
      s3Connections: vaultData.s3Connections.length,
      vaultCredentials: vaultData.vaultCredentials?.length,
      vaultEnvironments: vaultData.vaultEnvironments?.length,
      dbConnections: vaultData.dbConnections?.length,
      projects: vaultData.projects?.length,
      apiRequests: vaultData.apiRequests?.length,
    });

    // Serialize and compress
    const json = JSON.stringify(vaultData);
    const compressed = gzipSync(Buffer.from(json, 'utf-8'));

    logger.debug('Data compressed', {
      originalSize: json.length,
      compressedSize: compressed.length,
    });

    // Generate encryption parameters
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);

    // Derive key from password using scrypt
    const key = scryptSync(password, salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });

    // Encrypt with AES-256-GCM
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Assemble final buffer: MAGIC + VERSION + SALT + IV + TAG + ENCRYPTED
    const vaultBuffer = Buffer.concat([
      VAULT_MAGIC,
      Buffer.from([VAULT_VERSION]),
      salt,
      iv,
      authTag,
      encrypted,
    ]);

    logger.info('Vault export complete', { size: vaultBuffer.length });

    return vaultBuffer;
  }

  /**
   * Import and decrypt a vault buffer
   *
   * @param vaultBuffer - Encrypted vault buffer
   * @param password - Backup password
   * @returns Decrypted vault data
   * @throws Error if password is wrong or file is corrupted
   */
  async decryptVault(vaultBuffer: Buffer, password: string): Promise<VaultData> {
    logger.info('Decrypting vault', { size: vaultBuffer.length });

    // Validate minimum size
    const headerSize = VAULT_MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH;
    if (vaultBuffer.length < headerSize) {
      throw new Error('Invalid vault file: too small');
    }

    // Validate magic bytes
    const magic = vaultBuffer.subarray(0, VAULT_MAGIC.length);
    if (!magic.equals(VAULT_MAGIC)) {
      throw new Error('Invalid vault file: not an OwnShell vault');
    }

    // Extract version
    const version = vaultBuffer[VAULT_MAGIC.length];
    if (version > VAULT_VERSION) {
      throw new Error(`Vault version ${version} is newer than supported (${VAULT_VERSION})`);
    }

    // Extract encryption parameters
    let offset = VAULT_MAGIC.length + 1;
    const salt = vaultBuffer.subarray(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;
    const iv = vaultBuffer.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;
    const authTag = vaultBuffer.subarray(offset, offset + TAG_LENGTH);
    offset += TAG_LENGTH;
    const encrypted = vaultBuffer.subarray(offset);

    // Derive key from password
    const key = scryptSync(password, salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });

    // Decrypt with AES-256-GCM
    let json: string;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH });
      decipher.setAuthTag(authTag);
      const compressed = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      // Decompress
      json = gunzipSync(compressed).toString('utf-8');
    } catch (error) {
      // AES-GCM throws on wrong password (auth tag mismatch)
      if (error instanceof Error && error.message.includes('auth')) {
        throw new Error('Wrong password');
      }
      throw new Error('Failed to decrypt vault: file may be corrupted');
    }

    let vaultData: VaultData;
    try {
      vaultData = parseVaultJson(json);
    } catch {
      throw new Error('Invalid vault file: unexpected contents');
    }

    logger.info('Vault decrypted successfully', {
      version: vaultData.version,
      exportedAt: new Date(vaultData.exportedAt).toISOString(),
      hosts: vaultData.hosts.length,
      keys: vaultData.keys.length,
    });

    return vaultData;
  }

  /**
   * Restore vault data to database
   *
   * CRITICAL: Runs in atomic transaction with rollback on error
   * Does NOT touch app_settings table (preserves master password)
   *
   * @param vaultData - Decrypted vault data
   * @throws Error if app is locked or restore fails (with rollback)
   */
  async restoreVault(vaultData: VaultData): Promise<void> {
    logger.info('Starting vault restore');

    // App must be unlocked to encrypt secrets
    if (!cryptoManager.isUnlocked()) {
      throw new Error('App must be unlocked to restore vault');
    }

    // Run entire restore in a transaction
    await this.db.transaction().execute(async (trx) => {
      logger.info('Transaction started');

      // `PRAGMA foreign_keys = OFF` is a no-op inside a transaction. Defer the checks to
      // COMMIT instead, so rows can be inserted in any order (hosts -> keys, jump hosts,
      // nested API collections) and the transaction still fails on dangling references.
      await sql`PRAGMA defer_foreign_keys = ON`.execute(trx);

      // Clear all data tables (NOT app_settings!)
      logger.info('Clearing existing data');
      await trx.deleteFrom('host_tunnels').execute();
      // Hosts are upserted, not deleted and re-inserted: deleting a host fires its ON DELETE
      // actions, which would unlink rows the backup may not contain (db connections,
      // environments, projects) and fails on transfer_history.host_id (NOT NULL + SET NULL).
      const restoredHostIds = vaultData.hosts.map((host) => host.id);
      if (restoredHostIds.length > 0) {
        await trx.deleteFrom('transfer_history').where('host_id', 'not in', restoredHostIds).execute();
        await trx.deleteFrom('hosts').where('id', 'not in', restoredHostIds).execute();
      } else {
        await trx.deleteFrom('transfer_history').execute();
        await trx.deleteFrom('hosts').execute();
      }
      await trx.deleteFrom('keys').execute();
      await trx.deleteFrom('snippets').execute();
      await trx.deleteFrom('s3_connections').execute();
      await trx.deleteFrom('sidebar_folders').execute();

      // Restore sidebar folders first so item folder IDs point to existing folders.
      for (const folder of vaultData.sidebarFolders) {
        await trx.insertInto('sidebar_folders').values(folder).execute();
      }

      // Restore hosts (with re-encrypted passwords)
      logger.info('Restoring hosts', { count: vaultData.hosts.length });
      for (const host of vaultData.hosts) {
        const newHost = {
          id: host.id,
          label: host.label,
          hostname: host.hostname,
          port: host.port,
          username: host.username,
          auth_type: host.auth_type,
          password_encrypted: host.password ? cryptoManager.encryptData(host.password) : null,
          key_id: host.key_id,
          jump_host_id: host.jump_host_id ?? null,
          connection_type: host.connection_type ?? 'ssh', // v1.16.0
          favorite: host.favorite ?? 0,
          folder_id: host.folder_id ?? null,
          sort_order: host.sort_order ?? 0,
          host_key_fingerprint: host.host_key_fingerprint ?? null,
          created_at: host.created_at,
          updated_at: host.updated_at,
        };
        await trx
          .insertInto('hosts')
          .values(newHost)
          .onConflict((oc) => oc.column('id').doUpdateSet(newHost))
          .execute();
      }

      // Restore keys (with re-encrypted private keys and passphrases)
      logger.info('Restoring keys', { count: vaultData.keys.length });
      for (const key of vaultData.keys) {
        const newKey: NewKey = {
          id: key.id,
          label: key.label,
          type: key.type,
          public_key: key.public_key,
          private_key_encrypted: cryptoManager.encryptData(key.private_key),
          passphrase_encrypted: key.passphrase ? cryptoManager.encryptData(key.passphrase) : null,
          created_at: key.created_at,
          updated_at: key.updated_at,
        };
        await trx.insertInto('keys').values(newKey).execute();
      }

      // Restore tunnels
      logger.info('Restoring tunnels', { count: vaultData.tunnels.length });
      for (const tunnel of vaultData.tunnels) {
        const newTunnel: NewHostTunnel = {
          id: tunnel.id,
          host_id: tunnel.host_id,
          local_port: tunnel.local_port,
          remote_host: tunnel.remote_host,
          remote_port: tunnel.remote_port,
          name: tunnel.name,
          auto_start: tunnel.auto_start,
          created_at: tunnel.created_at,
          updated_at: tunnel.updated_at,
        };
        await trx.insertInto('host_tunnels').values(newTunnel).execute();
      }

      // Restore snippets
      logger.info('Restoring snippets', { count: vaultData.snippets.length });
      for (const snippet of vaultData.snippets) {
        const newSnippet: NewSnippet = {
          id: snippet.id,
          label: snippet.label,
          command: snippet.command,
          category: snippet.category,
          created_at: snippet.created_at,
          updated_at: snippet.updated_at,
        };
        await trx.insertInto('snippets').values(newSnippet).execute();
      }

      // Restore S3 connections (with re-encrypted credentials)
      logger.info('Restoring S3 connections', { count: vaultData.s3Connections.length });
      for (const s3 of vaultData.s3Connections) {
        const newS3 = {
          id: s3.id,
          label: s3.label,
          endpoint: s3.endpoint,
          region: s3.region,
          access_key_id_encrypted: cryptoManager.encryptData(s3.access_key_id),
          secret_access_key_encrypted: cryptoManager.encryptData(s3.secret_access_key),
          bucket_name: s3.bucket_name,
          favorite: s3.favorite ?? 0,
          folder_id: s3.folder_id ?? null,
          sort_order: s3.sort_order ?? 0,
          created_at: s3.created_at,
          updated_at: s3.updated_at,
        };
        await trx.insertInto('s3_connections').values(newS3).execute();
      }

      const {
        vaultCredentials,
        vaultEnvironments,
        dbConnections,
        projects,
        apiCollections,
        apiRequests,
        apiGlobalVariables,
      } = vaultData;
      const encrypt = (value: string) => cryptoManager.encryptData(value);

      if (vaultCredentials) {
        logger.info('Restoring vault credentials', { count: vaultCredentials.length });
        await trx.deleteFrom('vault_credentials').execute();
        for (const { password, ...credential } of vaultCredentials) {
          await trx
            .insertInto('vault_credentials')
            .values({ ...credential, password_encrypted: cryptoManager.encryptData(password) })
            .execute();
        }
      }

      if (vaultEnvironments) {
        logger.info('Restoring vault environments', { count: vaultEnvironments.length });
        await trx.deleteFrom('vault_environments').execute();
        for (const { variables, ...environment } of vaultEnvironments) {
          await trx
            .insertInto('vault_environments')
            .values({
              ...environment,
              variables: encryptEnvironmentVariables(variables, (value) =>
                cryptoManager.encryptData(value)
              ),
            })
            .execute();
        }
      }

      if (dbConnections) {
        logger.info('Restoring database connections', { count: dbConnections.length });
        await trx.deleteFrom('db_connections').execute();
        for (const { password, ssl_ca, ...connection } of dbConnections) {
          await trx
            .insertInto('db_connections')
            .values({
              ...connection,
              password_encrypted: password ? cryptoManager.encryptData(password) : null,
              ssl_ca_encrypted: ssl_ca ? cryptoManager.encryptData(ssl_ca) : null,
              ssl_ca_fingerprint: ssl_ca ? caCertificateFingerprint(ssl_ca) : null,
            })
            .execute();
        }
      }

      if (projects) {
        await trx.deleteFrom('projects').execute();
        for (const project of projects) {
          await trx.insertInto('projects').values(project).execute();
        }
      }

      if (apiRequests) await trx.deleteFrom('api_requests').execute();
      if (apiCollections) {
        await trx.deleteFrom('api_collections').execute();
        for (const { variables, ...collection } of apiCollections) {
          await trx
            .insertInto('api_collections')
            .values({
              ...collection,
              auth_config: storedAuthConfig(collection.auth_type, collection.auth_config, undefined, encrypt),
              variables: encryptVariables(variables, encrypt, uuidv4),
            })
            .execute();
        }
      }
      for (const request of apiRequests ?? []) {
        await trx
          .insertInto('api_requests')
          .values({ ...request, auth_config: storedAuthConfig(request.auth_type, request.auth_config, undefined, encrypt) })
          .execute();
      }
      if (apiGlobalVariables) {
        // The one app_settings row a backup carries; master password settings stay untouched.
        const value = encryptVariables(apiGlobalVariables, encrypt, uuidv4);
        await trx
          .insertInto('app_settings')
          .values({ key: GLOBAL_VARIABLES_SETTING, value, updated_at: Date.now() })
          .onConflict((oc) => oc.column('key').doUpdateSet({ value, updated_at: Date.now() }))
          .execute();
      }

      logger.info('Vault restore complete');
    });
  }

  /**
   * Load all user data from database with decrypted secrets
   */
  private async loadAllData(): Promise<VaultData> {
    const hostQueries = new HostQueries(this.db);
    const keyQueries = new KeyQueries(this.db);
    const s3Queries = new S3ConnectionQueries(this.db);

    // Load hosts and decrypt passwords
    const hostsRaw = await hostQueries.getAll();
    const hosts: VaultHost[] = hostsRaw.map((h) => ({
      id: h.id,
      label: h.label,
      hostname: h.hostname,
      port: h.port,
      username: h.username,
      auth_type: h.auth_type,
      key_id: h.key_id,
      jump_host_id: h.jump_host_id,
      connection_type: h.connection_type, // v1.16.0
      favorite: h.favorite ?? 0,
      folder_id: h.folder_id ?? null,
      sort_order: h.sort_order ?? 0,
      host_key_fingerprint: h.host_key_fingerprint ?? null,
      created_at: h.created_at,
      updated_at: h.updated_at,
      password: h.password_encrypted ? cryptoManager.decryptData(h.password_encrypted) : null,
    }));

    // Load keys and decrypt private keys/passphrases
    const keysRaw = await keyQueries.getAll();
    const keys: VaultKey[] = keysRaw.map((k) => ({
      id: k.id,
      label: k.label,
      type: k.type,
      public_key: k.public_key,
      created_at: k.created_at,
      updated_at: k.updated_at,
      private_key: cryptoManager.decryptData(k.private_key_encrypted),
      passphrase: k.passphrase_encrypted ? cryptoManager.decryptData(k.passphrase_encrypted) : null,
    }));

    // Load tunnels (no secrets)
    const tunnels = await this.db.selectFrom('host_tunnels').selectAll().execute();

    // Load snippets (no secrets)
    const snippets = await this.db.selectFrom('snippets').selectAll().execute();

    // Load S3 connections and decrypt credentials
    const s3Raw = await s3Queries.getAll();
    const s3Connections: VaultS3Connection[] = s3Raw.map((s) => ({
      id: s.id,
      label: s.label,
      endpoint: s.endpoint,
      region: s.region,
      bucket_name: s.bucket_name,
      favorite: s.favorite ?? 0,
      folder_id: s.folder_id ?? null,
      sort_order: s.sort_order ?? 0,
      created_at: s.created_at,
      updated_at: s.updated_at,
      access_key_id: cryptoManager.decryptData(s.access_key_id_encrypted),
      secret_access_key: cryptoManager.decryptData(s.secret_access_key_encrypted),
    }));

    const decrypt = (value: string) => cryptoManager.decryptData(value);

    const vaultCredentials = (
      await this.db.selectFrom('vault_credentials').selectAll().execute()
    ).map(({ password_encrypted, ...credential }) => ({
      ...credential,
      password: decrypt(password_encrypted),
    }));

    const vaultEnvironments = (
      await this.db.selectFrom('vault_environments').selectAll().execute()
    ).map((environment) => ({
      ...environment,
      variables: decryptEnvironmentVariables(environment.variables, decrypt),
    }));

    const dbConnections = (await this.db.selectFrom('db_connections').selectAll().execute()).map(
      ({ password_encrypted, ssl_ca_encrypted, ssl_ca_fingerprint: _fingerprint, ...connection }) => ({
        ...connection,
        password: password_encrypted ? decrypt(password_encrypted) : null,
        ssl_ca: ssl_ca_encrypted ? decrypt(ssl_ca_encrypted) : null,
      })
    );

    return {
      version: VAULT_VERSION,
      exportedAt: Date.now(),
      appVersion: app.getVersion(),
      hosts,
      keys,
      tunnels,
      snippets,
      s3Connections,
      sidebarFolders: await this.db.selectFrom('sidebar_folders').selectAll().execute(),
      vaultCredentials,
      vaultEnvironments,
      dbConnections,
      projects: await this.db.selectFrom('projects').selectAll().execute(),
      // Auth secrets are decrypted into the (encrypted) backup; cached OAuth tokens
      // and the cookie jar are deliberately not backed up.
      apiCollections: (await this.db.selectFrom('api_collections').selectAll().execute()).map(
        (collection) => ({
          ...collection,
          auth_config: revealAuthSecrets(collection.auth_config, collection.auth_config, decrypt),
          variables: decryptVariables(collection.variables, decrypt),
        })
      ),
      apiRequests: (await this.db.selectFrom('api_requests').selectAll().execute()).map((request) => ({
        ...request,
        auth_config: revealAuthSecrets(request.auth_config, request.auth_config, decrypt),
      })),
      apiGlobalVariables: decryptVariables(
        (
          await this.db
            .selectFrom('app_settings')
            .select('value')
            .where('key', '=', GLOBAL_VARIABLES_SETTING)
            .executeTakeFirst()
        )?.value,
        decrypt
      ),
    };
  }
}
