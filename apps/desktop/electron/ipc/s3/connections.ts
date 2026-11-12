import type { NewS3Connection, S3ConnectionQueries, S3ConnectionUpdate } from '@ownshell/core';
import { v4 as uuidv4 } from 'uuid';
import { s3ClientCache } from '../../s3/s3-adapter';
import { cryptoManager } from '../../security/crypto';
import { logger } from '../../logger';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import {
  idSchema,
  noPayloadSchema,
  s3ConnectionInputSchema,
  s3ConnectionUpdateArgsSchema,
} from './schemas';

export function registerS3ConnectionHandlers(s3Queries: S3ConnectionQueries): void {
  safeHandle('db:s3:get-all', noPayloadSchema, async () => {
    try {
      logger.debug('IPC: db:s3:get-all');
      return await s3Queries.getAll();
    } catch (error) {
      logger.error('Failed to get all S3 connections', error);
      throw error;
    }
  });

  safeHandle('db:s3:get-by-id', idSchema, async (_event, id) => {
    try {
      logger.debug('IPC: db:s3:get-by-id', { id });
      const connection = await s3Queries.getById(id);
      return connection || null;
    } catch (error) {
      logger.error('Failed to get S3 connection', error, { id });
      throw error;
    }
  });

  safeHandle('db:s3:create', s3ConnectionInputSchema, async (_event, data) => {
    try {
      logger.info('IPC: db:s3:create', { label: data.label, endpoint: data.endpoint });

      if (!cryptoManager.isUnlocked()) {
        throw new Error('App is locked - cannot create S3 connection');
      }

      const newConnection: NewS3Connection = {
        id: uuidv4(),
        label: data.label,
        endpoint: data.endpoint,
        region: data.region,
        access_key_id_encrypted: cryptoManager.encryptData(data.accessKeyId),
        secret_access_key_encrypted: cryptoManager.encryptData(data.secretAccessKey),
        bucket_name: data.bucketName || null,
        favorite: data.favorite ?? 0,
        folder_id: data.folder_id ?? null,
        sort_order: data.sort_order ?? 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      await s3Queries.create(newConnection);

      logger.info('S3 connection created', { id: newConnection.id, label: newConnection.label });

      return newConnection;
    } catch (error) {
      logger.error('Failed to create S3 connection', error);
      throw error;
    }
  });

  safeHandleArgs('db:s3:update', s3ConnectionUpdateArgsSchema, async (_event, [id, updateData]) => {
    try {
      logger.info('IPC: db:s3:update', { id });

      if (!cryptoManager.isUnlocked()) {
        throw new Error('App is locked - cannot update S3 connection');
      }

      const update: S3ConnectionUpdate = {
        updated_at: Date.now(),
      };

      if (updateData.label !== undefined) update.label = updateData.label;
      if (updateData.endpoint !== undefined) update.endpoint = updateData.endpoint;
      if (updateData.region !== undefined) update.region = updateData.region;
      if (updateData.bucketName !== undefined) update.bucket_name = updateData.bucketName;
      if (updateData.favorite !== undefined) update.favorite = updateData.favorite;
      if (updateData.folder_id !== undefined) update.folder_id = updateData.folder_id;
      if (updateData.sort_order !== undefined) update.sort_order = updateData.sort_order;
      if (updateData.accessKeyId) {
        update.access_key_id_encrypted = cryptoManager.encryptData(updateData.accessKeyId);
      }
      if (updateData.secretAccessKey) {
        update.secret_access_key_encrypted = cryptoManager.encryptData(
          updateData.secretAccessKey
        );
      }

      await s3Queries.update(id, update);
      s3ClientCache.remove(id);

      logger.info('S3 connection updated', { id });

      return { success: true };
    } catch (error) {
      logger.error('Failed to update S3 connection', error, { id });
      throw error;
    }
  });

  safeHandle('db:s3:delete', idSchema, async (_event, id) => {
    try {
      logger.info('IPC: db:s3:delete', { id });

      await s3Queries.delete(id);
      s3ClientCache.remove(id);

      logger.info('S3 connection deleted', { id });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete S3 connection', error, { id });
      throw error;
    }
  });
}
