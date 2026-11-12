import type { S3ConnectionQueries } from '@ownshell/core';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { getErrorMessage, getS3Adapter } from './helpers';
import { s3BucketSchema, s3PutCorsSchema } from './schemas';

export function registerS3CorsHandlers(s3Queries: S3ConnectionQueries): void {
  safeHandle('s3:get-cors', s3BucketSchema, async (_event, params) => {
    try {
      logger.debug('IPC: s3:get-cors', {
        connectionId: params.connectionId,
        bucket: params.bucket,
      });

      const adapter = await getS3Adapter(s3Queries, params.connectionId);
      const rules = await adapter.getCORS(params.bucket);

      return { success: true, rules };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      logger.error('S3 get CORS failed', {
        connectionId: params.connectionId,
        bucket: params.bucket,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  });

  safeHandle('s3:put-cors', s3PutCorsSchema, async (_event, params) => {
    try {
      logger.info('IPC: s3:put-cors', {
        connectionId: params.connectionId,
        bucket: params.bucket,
        ruleCount: params.rules.length,
      });

      const adapter = await getS3Adapter(s3Queries, params.connectionId);
      await adapter.putCORS(params.bucket, params.rules);

      return { success: true };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      logger.error('S3 put CORS failed', {
        connectionId: params.connectionId,
        bucket: params.bucket,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  });

  safeHandle('s3:delete-cors', s3BucketSchema, async (_event, params) => {
    try {
      logger.info('IPC: s3:delete-cors', {
        connectionId: params.connectionId,
        bucket: params.bucket,
      });

      const adapter = await getS3Adapter(s3Queries, params.connectionId);
      await adapter.deleteCORS(params.bucket);

      return { success: true };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      logger.error('S3 delete CORS failed', {
        connectionId: params.connectionId,
        bucket: params.bucket,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  });
}
