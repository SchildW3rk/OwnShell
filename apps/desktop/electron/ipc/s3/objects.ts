import type { S3ConnectionQueries } from '@ownshell/core';
import { S3Adapter } from '../../s3/s3-adapter';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { getErrorMessage, getS3Adapter } from './helpers';
import {
  idSchema,
  s3DeleteObjectsSchema,
  s3ListObjectsSchema,
  s3PresignedUrlSchema,
  s3TestConnectionSchema,
} from './schemas';

export function registerS3ObjectHandlers(s3Queries: S3ConnectionQueries): void {
  safeHandle('s3:test-connection', s3TestConnectionSchema, async (_event, config) => {
    try {
      logger.info('IPC: s3:test-connection', { endpoint: config.endpoint });

      const adapter = new S3Adapter(config);
      try {
        return await adapter.testConnection();
      } finally {
        adapter.destroy();
      }
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      logger.error('S3 test connection failed', { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  });

  safeHandle('s3:list-buckets', idSchema, async (_event, connectionId) => {
    try {
      logger.debug('IPC: s3:list-buckets', { connectionId });

      const adapter = await getS3Adapter(s3Queries, connectionId);
      const buckets = await adapter.listBuckets();

      return { success: true, buckets };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      logger.error('S3 list buckets failed', { connectionId, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  });

  safeHandle('s3:list-objects', s3ListObjectsSchema, async (_event, params) => {
    try {
      logger.debug('IPC: s3:list-objects', {
        connectionId: params.connectionId,
        bucket: params.bucket,
        prefix: params.prefix,
      });

      const adapter = await getS3Adapter(s3Queries, params.connectionId);
      const result = await adapter.listObjects(
        params.bucket,
        params.prefix,
        params.continuationToken
      );

      return { success: true, ...result };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      logger.error('S3 list objects failed', {
        connectionId: params.connectionId,
        bucket: params.bucket,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  });

  safeHandle('s3:delete-objects', s3DeleteObjectsSchema, async (_event, params) => {
    try {
      logger.info('IPC: s3:delete-objects', {
        connectionId: params.connectionId,
        bucket: params.bucket,
        count: params.keys.length,
      });

      const adapter = await getS3Adapter(s3Queries, params.connectionId);
      const result = await adapter.deleteObjects(params.bucket, params.keys);

      return { success: true, ...result };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      logger.error('S3 delete objects failed', {
        connectionId: params.connectionId,
        bucket: params.bucket,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  });

  safeHandle('s3:get-presigned-url', s3PresignedUrlSchema, async (_event, params) => {
    try {
      logger.debug('IPC: s3:get-presigned-url', {
        connectionId: params.connectionId,
        bucket: params.bucket,
        key: params.key,
      });

      const adapter = await getS3Adapter(s3Queries, params.connectionId);
      const result = await adapter.getPresignedUrl(
        params.bucket,
        params.key,
        params.expiresIn || 3600
      );

      return { success: true, ...result };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      logger.error('S3 get presigned URL failed', {
        connectionId: params.connectionId,
        bucket: params.bucket,
        key: params.key,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  });
}
