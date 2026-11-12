import type { S3ConnectionConfig, S3ConnectionQueries } from '@ownshell/core';
import { S3Adapter, s3ClientCache } from '../../s3/s3-adapter';
import { cryptoManager } from '../../security/crypto';
import { logger } from '../../logger';

export async function getDecryptedConfig(
  s3Queries: S3ConnectionQueries,
  connectionId: string
): Promise<S3ConnectionConfig | null> {
  const connection = await s3Queries.getById(connectionId);

  if (!connection) {
    logger.warn('S3 connection not found', { connectionId });
    return null;
  }

  if (!cryptoManager.isUnlocked()) {
    throw new Error('App is locked - cannot access S3 credentials');
  }

  const accessKeyId = cryptoManager.decryptData(connection.access_key_id_encrypted);
  const secretAccessKey = cryptoManager.decryptData(connection.secret_access_key_encrypted);

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Failed to decrypt S3 credentials');
  }

  return {
    endpoint: connection.endpoint,
    region: connection.region,
    accessKeyId,
    secretAccessKey,
    bucketName: connection.bucket_name || undefined,
  };
}

export async function getS3Adapter(
  s3Queries: S3ConnectionQueries,
  connectionId: string
): Promise<S3Adapter> {
  const config = await getDecryptedConfig(s3Queries, connectionId);

  if (!config) {
    throw new Error('S3 connection not found');
  }

  return s3ClientCache.getOrCreate(connectionId, config);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
