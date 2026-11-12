import { KeyQueries, KeyUpdate, NewKey } from '@ownshell/core';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';
import { cryptoManager } from '../../security/crypto';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import {
  idSchema,
  keyCreateSchema,
  keyTypeSchema,
  keyUpdateArgsSchema,
  noPayloadSchema,
} from './schemas';

export function registerKeyHandlers(keyQueries: KeyQueries): void {
  safeHandle('db:keys:get-all', noPayloadSchema, async () => {
    try {
      logger.debug('IPC: db:keys:get-all');
      return await keyQueries.getAll();
    } catch (error) {
      logger.error('Failed to get all keys', error);
      throw error;
    }
  });

  safeHandle('db:keys:get-by-id', idSchema, async (_event, id) => {
    try {
      logger.debug('IPC: db:keys:get-by-id', { id });
      return await keyQueries.getById(id);
    } catch (error) {
      logger.error('Failed to get key by id', error, { id });
      throw error;
    }
  });

  safeHandle('db:keys:create', keyCreateSchema, async (_event, keyData) => {
    try {
      logger.info('IPC: db:keys:create', { label: keyData.label, type: keyData.type });

      if (!cryptoManager.isUnlocked()) {
        throw new Error('App is locked - cannot create key');
      }

      const privateKeyEncrypted = cryptoManager.encryptData(keyData.private_key);
      const passphraseEncrypted = keyData.passphrase
        ? cryptoManager.encryptData(keyData.passphrase)
        : null;

      const newKey: NewKey = {
        id: uuidv4(),
        label: keyData.label,
        type: keyData.type,
        public_key: keyData.public_key || '',
        private_key_encrypted: privateKeyEncrypted,
        passphrase_encrypted: passphraseEncrypted,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      await keyQueries.create(newKey);

      logger.info('Key created successfully', { id: newKey.id, label: newKey.label });
      return newKey;
    } catch (error) {
      logger.error('Failed to create key', error);
      throw error;
    }
  });

  safeHandleArgs('db:keys:update', keyUpdateArgsSchema, async (_event, [id, updateData]) => {
    try {
      logger.info('IPC: db:keys:update', { id });

      const update: KeyUpdate = {
        ...updateData,
        updated_at: Date.now(),
      };

      await keyQueries.update(id, update);

      logger.info('Key updated successfully', { id });
      return { success: true };
    } catch (error) {
      logger.error('Failed to update key', error, { id });
      throw error;
    }
  });

  safeHandle('db:keys:delete', idSchema, async (_event, id) => {
    try {
      logger.info('IPC: db:keys:delete', { id });
      await keyQueries.delete(id);
      logger.info('Key deleted successfully', { id });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete key', error, { id });
      throw error;
    }
  });

  safeHandle('db:keys:get-by-type', keyTypeSchema, async (_event, type) => {
    try {
      logger.debug('IPC: db:keys:get-by-type', { type });
      return await keyQueries.getByType(type);
    } catch (error) {
      logger.error('Failed to get keys by type', error, { type });
      throw error;
    }
  });
}
