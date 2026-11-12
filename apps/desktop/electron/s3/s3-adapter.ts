/**
 * S3 Adapter
 *
 * Handles S3-compatible object storage operations
 * - Supports AWS S3, Hetzner Object Storage, MinIO, DigitalOcean Spaces
 * - Auto-detects forcePathStyle for non-AWS endpoints
 * - Includes presigned URL generation for browser downloads
 */

import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  DeleteBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
  S3Bucket,
  S3Object,
  S3ListObjectsResult,
  S3CORSRule,
  S3ConnectionConfig,
} from '@ownshell/core';
import { logger } from '../logger';

/**
 * Check if endpoint is AWS S3
 */
function isAWSEndpoint(endpoint: string): boolean {
  return endpoint.includes('amazonaws.com');
}

/**
 * S3 Adapter for object storage operations
 */
export class S3Adapter {
  private client: S3Client;

  constructor(config: S3ConnectionConfig) {
    // Auto-detect forcePathStyle for non-AWS endpoints (Hetzner, MinIO, etc.)
    const forcePathStyle = !isAWSEndpoint(config.endpoint);

    if (forcePathStyle) {
      logger.debug('S3 Adapter: Using path-style URLs (non-AWS endpoint)', {
        endpoint: config.endpoint,
      });
    }

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle,
    });

    logger.info('S3 Adapter created', {
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle,
    });
  }

  /**
   * Test the connection by listing buckets
   */
  async testConnection(): Promise<{ success: boolean; bucketCount?: number; error?: string }> {
    try {
      logger.debug('S3: Testing connection');
      const response = await this.client.send(new ListBucketsCommand({}));
      const bucketCount = response.Buckets?.length || 0;

      logger.info('S3: Connection test successful', { bucketCount });
      return { success: true, bucketCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('S3: Connection test failed', { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * List all buckets
   */
  async listBuckets(): Promise<S3Bucket[]> {
    logger.debug('S3: Listing buckets');

    const response = await this.client.send(new ListBucketsCommand({}));

    const buckets: S3Bucket[] = (response.Buckets || []).map((bucket) => ({
      name: bucket.Name || '',
      creationDate: bucket.CreationDate,
    }));

    logger.info('S3: Listed buckets', { count: buckets.length });
    return buckets;
  }

  /**
   * List objects in a bucket with optional prefix (for folder navigation)
   */
  async listObjects(
    bucket: string,
    prefix?: string,
    continuationToken?: string
  ): Promise<S3ListObjectsResult> {
    logger.debug('S3: Listing objects', { bucket, prefix });

    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || '',
        Delimiter: '/', // Use delimiter for folder-like navigation
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      })
    );

    // Parse objects (files)
    const objects: S3Object[] = (response.Contents || [])
      .filter((obj) => obj.Key && obj.Key !== prefix) // Exclude the prefix itself
      .map((obj) => {
        const key = obj.Key || '';
        const name = key.split('/').filter(Boolean).pop() || key;

        return {
          key,
          name,
          size: obj.Size || 0,
          lastModified: obj.LastModified || new Date(),
          isFolder: false,
          storageClass: obj.StorageClass,
          etag: obj.ETag,
        };
      });

    // Parse common prefixes (folders)
    const prefixes = (response.CommonPrefixes || []).map((p) => p.Prefix || '').filter(Boolean);

    // Add folder entries for common prefixes
    const folderObjects: S3Object[] = prefixes.map((p) => {
      const name = p.split('/').filter(Boolean).pop() || p;
      return {
        key: p,
        name,
        size: 0,
        lastModified: new Date(),
        isFolder: true,
      };
    });

    logger.info('S3: Listed objects', {
      bucket,
      prefix,
      fileCount: objects.length,
      folderCount: folderObjects.length,
    });

    return {
      objects: [...folderObjects, ...objects], // Folders first
      prefixes,
      isTruncated: response.IsTruncated || false,
      nextContinuationToken: response.NextContinuationToken,
    };
  }

  /**
   * Delete multiple objects (bulk delete)
   */
  async deleteObjects(
    bucket: string,
    keys: string[]
  ): Promise<{ deleted: string[]; errors: Array<{ key: string; code: string; message: string }> }> {
    if (keys.length === 0) {
      return { deleted: [], errors: [] };
    }

    logger.info('S3: Deleting objects', { bucket, count: keys.length });

    const response = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.map((key) => ({ Key: key })),
          Quiet: false,
        },
      })
    );

    const deleted = (response.Deleted || []).map((d) => d.Key || '').filter(Boolean);
    const errors = (response.Errors || []).map((e) => ({
      key: e.Key || '',
      code: e.Code || 'Unknown',
      message: e.Message || 'Unknown error',
    }));

    logger.info('S3: Delete completed', {
      bucket,
      deletedCount: deleted.length,
      errorCount: errors.length,
    });

    return { deleted, errors };
  }

  /**
   * Get presigned URL for downloading/viewing a file
   */
  async getPresignedUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600 // 1 hour default
  ): Promise<{ url: string; expiresAt: Date }> {
    logger.debug('S3: Generating presigned URL', { bucket, key, expiresIn });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    logger.info('S3: Presigned URL generated', { bucket, key, expiresAt });

    return { url, expiresAt };
  }

  /**
   * Get CORS configuration for a bucket
   */
  async getCORS(bucket: string): Promise<S3CORSRule[]> {
    logger.debug('S3: Getting CORS configuration', { bucket });

    try {
      const response = await this.client.send(
        new GetBucketCorsCommand({
          Bucket: bucket,
        })
      );

      const rules: S3CORSRule[] = (response.CORSRules || []).map((rule) => ({
        id: rule.ID,
        allowedOrigins: rule.AllowedOrigins || [],
        allowedMethods: (rule.AllowedMethods || []) as S3CORSRule['allowedMethods'],
        allowedHeaders: rule.AllowedHeaders,
        exposeHeaders: rule.ExposeHeaders,
        maxAgeSeconds: rule.MaxAgeSeconds,
      }));

      logger.info('S3: CORS configuration retrieved', { bucket, ruleCount: rules.length });
      return rules;
    } catch (error: any) {
      // NoSuchCORSConfiguration is not an error - just means no CORS is set
      if (error.name === 'NoSuchCORSConfiguration') {
        logger.debug('S3: No CORS configuration found', { bucket });
        return [];
      }
      throw error;
    }
  }

  /**
   * Set CORS configuration for a bucket
   */
  async putCORS(bucket: string, rules: S3CORSRule[]): Promise<void> {
    logger.info('S3: Setting CORS configuration', { bucket, ruleCount: rules.length });

    await this.client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: rules.map((rule) => ({
            ID: rule.id,
            AllowedOrigins: rule.allowedOrigins,
            AllowedMethods: rule.allowedMethods,
            AllowedHeaders: rule.allowedHeaders,
            ExposeHeaders: rule.exposeHeaders,
            MaxAgeSeconds: rule.maxAgeSeconds,
          })),
        },
      })
    );

    logger.info('S3: CORS configuration updated', { bucket });
  }

  /**
   * Delete CORS configuration for a bucket
   */
  async deleteCORS(bucket: string): Promise<void> {
    logger.info('S3: Deleting CORS configuration', { bucket });

    await this.client.send(
      new DeleteBucketCorsCommand({
        Bucket: bucket,
      })
    );

    logger.info('S3: CORS configuration deleted', { bucket });
  }

  /**
   * Get the underlying S3 client (for advanced operations)
   */
  getClient(): S3Client {
    return this.client;
  }

  /**
   * Destroy the client
   */
  destroy(): void {
    this.client.destroy();
    logger.debug('S3 Adapter destroyed');
  }
}

// ============================================
// S3 CLIENT CACHE
// ============================================

/**
 * In-memory cache for S3Client instances
 * Avoids decrypting credentials for every request
 */
class S3ClientCache {
  private cache: Map<string, { adapter: S3Adapter; lastUsed: number }> = new Map();
  private maxAge: number = 30 * 60 * 1000; // 30 minutes

  /**
   * Get or create an S3 adapter for a connection
   */
  getOrCreate(connectionId: string, config: S3ConnectionConfig): S3Adapter {
    const existing = this.cache.get(connectionId);

    if (existing) {
      existing.lastUsed = Date.now();
      logger.debug('S3 Cache: Using cached client', { connectionId });
      return existing.adapter;
    }

    logger.debug('S3 Cache: Creating new client', { connectionId });
    const adapter = new S3Adapter(config);
    this.cache.set(connectionId, { adapter, lastUsed: Date.now() });

    // Cleanup old entries
    this.cleanup();

    return adapter;
  }

  /**
   * Remove a specific connection from cache
   */
  remove(connectionId: string): void {
    const entry = this.cache.get(connectionId);
    if (entry) {
      entry.adapter.destroy();
      this.cache.delete(connectionId);
      logger.debug('S3 Cache: Removed client', { connectionId });
    }
  }

  /**
   * Clear all cached clients
   */
  clear(): void {
    for (const [, entry] of this.cache) {
      entry.adapter.destroy();
    }
    this.cache.clear();
    logger.info('S3 Cache: Cleared all clients');
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, entry] of this.cache) {
      if (now - entry.lastUsed > this.maxAge) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      this.remove(id);
    }

    if (expired.length > 0) {
      logger.debug('S3 Cache: Cleaned up expired entries', { count: expired.length });
    }
  }
}

// Export singleton instance
export const s3ClientCache = new S3ClientCache();
