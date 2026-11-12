/**
 * S3 IPC Handlers
 *
 * Handles S3 object storage operations from the renderer process.
 */

import type { Database } from '@ownshell/core';
import { S3ConnectionQueries } from '@ownshell/core';
import type { Kysely } from 'kysely';
import { logger } from '../logger';
import { s3ClientCache } from '../s3/s3-adapter';
import { registerS3ConnectionHandlers } from './s3/connections';
import { registerS3CorsHandlers } from './s3/cors';
import { registerS3ObjectHandlers } from './s3/objects';

export function setupS3Handlers(db: Kysely<Database>): void {
  const s3Queries = new S3ConnectionQueries(db);

  logger.info('Setting up S3 IPC handlers');

  registerS3ConnectionHandlers(s3Queries);
  registerS3ObjectHandlers(s3Queries);
  registerS3CorsHandlers(s3Queries);

  logger.info('S3 IPC handlers setup complete');
}

export function cleanupS3Clients(): void {
  s3ClientCache.clear();
  logger.info('S3 clients cleaned up');
}
