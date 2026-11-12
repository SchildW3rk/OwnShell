import { IpcMainInvokeEvent, shell } from 'electron';
import { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { Database, NewVaultCredential, VaultCredentialUpdate } from '@ownshell/core';
import { cryptoManager } from '../../security/crypto';
import { logger } from '../../logger';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import {
  createCredentialSchema,
  credentialUpdateArgsSchema,
  favoriteArgsSchema,
  idSchema,
  noPayloadSchema,
  vaultUrlSchema,
} from '../schemas/vault';

let db: Kysely<Database>;

export function setupVaultCredentialHandlers(_db: Kysely<Database>) {
  db = _db;

  // ==================== CREDENTIALS ====================
  safeHandle('vault:credentials:get-all', noPayloadSchema, handleGetAllCredentials);
  safeHandle('vault:credentials:get-by-id', idSchema, handleGetCredentialById);
  safeHandle('vault:credentials:create', createCredentialSchema, handleCreateCredential);
  safeHandleArgs('vault:credentials:update', credentialUpdateArgsSchema, (_event, [id, data]) =>
    handleUpdateCredential(_event, id, data)
  );
  safeHandle('vault:credentials:delete', idSchema, handleDeleteCredential);
  safeHandle('vault:credentials:decrypt-password', idSchema, handleDecryptPassword);
  safeHandle('vault:credentials:open-url', vaultUrlSchema, handleOpenURL);
  safeHandleArgs('vault:credentials:toggle-favorite', favoriteArgsSchema, (_event, [id, favorite]) =>
    handleToggleFavorite(_event, id, favorite)
  );
}

// ==================== CREDENTIALS HANDLERS ====================

async function handleGetAllCredentials() {
  try {
    return await db
      .selectFrom('vault_credentials')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  } catch (error) {
    logger.error('Failed to get vault credentials', error);
    throw error;
  }
}

async function handleGetCredentialById(_event: IpcMainInvokeEvent, id: string) {
  try {
    return await db
      .selectFrom('vault_credentials')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  } catch (error) {
    logger.error('Failed to get vault credential', { id, error });
    throw error;
  }
}

async function handleCreateCredential(
  _event: IpcMainInvokeEvent,
  data: {
    title: string;
    username: string | null;
    password: string;
    url: string | null;
    notes: string | null;
    tags: string[] | null;
  }
) {
  try {
    if (!cryptoManager.isUnlocked()) {
      throw new Error('App is locked - cannot encrypt password');
    }

    const now = Date.now();
    const credential: NewVaultCredential = {
      id: uuidv4(),
      title: data.title,
      username: data.username,
      password_encrypted: cryptoManager.encryptData(data.password),
      url: data.url,
      notes: data.notes,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      favorite: 0,
      created_at: now,
      updated_at: now,
      last_used_at: null,
    };

    await db.insertInto('vault_credentials').values(credential).execute();

    logger.info('Vault credential created', { id: credential.id, title: credential.title });
    return credential;
  } catch (error) {
    logger.error('Failed to create vault credential', error);
    throw error;
  }
}

async function handleUpdateCredential(
  _event: IpcMainInvokeEvent,
  id: string,
  data: {
    title?: string;
    username?: string | null;
    password?: string;
    url?: string | null;
    notes?: string | null;
    tags?: string[] | null;
    favorite?: number;
  }
) {
  try {
    // Extract tags and password for separate handling
    const { tags, password, ...restData } = data;

    const update: VaultCredentialUpdate = {
      ...restData,
      updated_at: Date.now(),
    };

    // Encrypt password if provided
    if (password !== undefined) {
      if (!cryptoManager.isUnlocked()) {
        throw new Error('App is locked - cannot encrypt password');
      }
      update.password_encrypted = cryptoManager.encryptData(password);
    }

    // Serialize tags if provided
    if (tags !== undefined) {
      update.tags = tags ? JSON.stringify(tags) : null;
    }

    await db.updateTable('vault_credentials').set(update).where('id', '=', id).execute();

    const updated = await db
      .selectFrom('vault_credentials')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    logger.info('Vault credential updated', { id, title: data.title });
    return updated;
  } catch (error) {
    logger.error('Failed to update vault credential', { id, error });
    throw error;
  }
}

async function handleDeleteCredential(_event: IpcMainInvokeEvent, id: string) {
  try {
    await db.deleteFrom('vault_credentials').where('id', '=', id).execute();
    logger.info('Vault credential deleted', { id });
  } catch (error) {
    logger.error('Failed to delete vault credential', { id, error });
    throw error;
  }
}

async function handleDecryptPassword(_event: IpcMainInvokeEvent, id: string) {
  try {
    if (!cryptoManager.isUnlocked()) {
      throw new Error('App is locked - cannot decrypt password');
    }

    const credential = await db
      .selectFrom('vault_credentials')
      .select('password_encrypted')
      .where('id', '=', id)
      .executeTakeFirst();

    if (!credential) {
      throw new Error('Credential not found');
    }

    // Update last_used_at timestamp
    await db
      .updateTable('vault_credentials')
      .set({ last_used_at: Date.now() })
      .where('id', '=', id)
      .execute();

    const decrypted = cryptoManager.decryptData(credential.password_encrypted);
    logger.info('Password decrypted', { id });
    return decrypted;
  } catch (error) {
    logger.error('Failed to decrypt password', { id, error });
    throw error;
  }
}

async function handleOpenURL(_event: IpcMainInvokeEvent, url: string) {
  try {
    // Validate URL format
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Only HTTP(S) URLs are allowed');
    }

    await shell.openExternal(url);
    logger.info('URL opened in browser', { url });
  } catch (error) {
    logger.error('Failed to open URL', { url, error });
    throw error;
  }
}

async function handleToggleFavorite(_event: IpcMainInvokeEvent, id: string, favorite: number) {
  try {
    await db
      .updateTable('vault_credentials')
      .set({ favorite, updated_at: Date.now() })
      .where('id', '=', id)
      .execute();

    logger.info('Credential favorite toggled', { id, favorite });
  } catch (error) {
    logger.error('Failed to toggle favorite', { id, error });
    throw error;
  }
}
