/**
 * S3 Query Hooks (TanStack Query)
 *
 * Provides React Query hooks for S3 data:
 * - useS3Connections: Fetch all S3 connections
 * - useS3Buckets: Fetch buckets for a connection
 * - useS3Objects: Fetch objects in a bucket/prefix
 * - useS3CORS: Fetch CORS configuration
 */

import { useQuery, useInfiniteQuery, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import { S3ConnectionsTable, S3Bucket, S3Object, S3CORSRule } from '@ownshell/core';

const isDev = process.env.NODE_ENV === 'development';

function normalizeS3ConnectionsResult(result: unknown): S3ConnectionsTable[] {
  if (Array.isArray(result)) {
    return result as S3ConnectionsTable[];
  }

  const error =
    result && typeof result === 'object' && 'error' in result
      ? String((result as { error?: unknown }).error)
      : 'Failed to load S3 connections';

  throw new Error(error);
}

/**
 * Fetch all S3 connections
 */
export function useS3Connections() {
  return useQuery({
    queryKey: queryKeys.s3.connections(),
    queryFn: async (): Promise<S3ConnectionsTable[]> => {
      if (isDev) console.log('[S3] Loading connections');

      const connections = normalizeS3ConnectionsResult(
        await window.electronAPI.s3Connections.getAll()
      );

      if (isDev) console.log('[S3] Connections loaded', { count: connections.length });

      return connections;
    },
    staleTime: 60 * 1000, // Connections rarely change
  });
}

/**
 * Fetch buckets for an S3 connection
 */
export function useS3Buckets(connectionId: string | null) {
  return useQuery({
    queryKey: queryKeys.s3.buckets(connectionId ?? ''),
    queryFn: async (): Promise<S3Bucket[]> => {
      if (!connectionId) {
        return [];
      }

      if (isDev) console.log('[S3] Loading buckets', { connectionId });

      const result = await window.electronAPI.s3.listBuckets(connectionId);

      if (result.success && result.buckets) {
        if (isDev) console.log('[S3] Buckets loaded', { count: result.buckets.length });
        return result.buckets;
      } else {
        throw new Error(result.error || 'Failed to list buckets');
      }
    },
    enabled: !!connectionId,
    staleTime: 30 * 1000,
  });
}

interface S3ObjectPage {
  objects: S3Object[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export type S3ObjectsQuery = UseInfiniteQueryResult<S3ObjectPage, Error>;

function flattenObjectPages(data: InfiniteData<S3ObjectPage>) {
  const lastPage = data.pages[data.pages.length - 1];
  return {
    objects: data.pages.flatMap((page) => page.objects),
    isTruncated: lastPage?.isTruncated ?? false,
    nextContinuationToken: lastPage?.nextContinuationToken,
  };
}

/**
 * Fetch objects in a bucket/prefix
 */
export function useS3Objects(
  connectionId: string | null,
  bucket: string | null,
  prefix: string = ''
): S3ObjectsQuery {
  return useInfiniteQuery({
    queryKey: queryKeys.s3.objects(connectionId ?? '', bucket ?? '', prefix),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<S3ObjectPage> => {
      if (!connectionId || !bucket) {
        return { objects: [], isTruncated: false };
      }

      if (isDev) console.log('[S3] Loading objects', { connectionId, bucket, prefix });

      const result = await window.electronAPI.s3.listObjects({
        connectionId,
        bucket,
        prefix,
        continuationToken: pageParam,
      });

      if (result.success) {
        if (isDev) console.log('[S3] Objects loaded', { count: result.objects?.length || 0 });
        return {
          objects: result.objects || [],
          isTruncated: result.isTruncated || false,
          nextContinuationToken: result.nextContinuationToken,
        };
      } else {
        throw new Error(result.error || 'Failed to list objects');
      }
    },
    enabled: !!connectionId && !!bucket,
    getNextPageParam: (lastPage) =>
      lastPage.isTruncated ? lastPage.nextContinuationToken : undefined,
    select: flattenObjectPages,
    staleTime: 15 * 1000, // Objects can change frequently
  });
}

/**
 * Fetch CORS configuration for a bucket
 */
export function useS3CORS(connectionId: string | null, bucket: string | null) {
  return useQuery({
    queryKey: queryKeys.s3.cors(connectionId ?? '', bucket ?? ''),
    queryFn: async (): Promise<S3CORSRule[]> => {
      if (!connectionId || !bucket) {
        return [];
      }

      if (isDev) console.log('[S3] Loading CORS configuration', { connectionId, bucket });

      const result = await window.electronAPI.s3.getCORS({
        connectionId,
        bucket,
      });

      if (result.success) {
        if (isDev) console.log('[S3] CORS loaded', { ruleCount: result.rules?.length || 0 });
        return result.rules || [];
      } else {
        // Don't throw for "no CORS configured" - return empty array
        if (result.error?.includes('NoSuchCORSConfiguration')) {
          return [];
        }
        throw new Error(result.error || 'Failed to load CORS');
      }
    },
    enabled: !!connectionId && !!bucket,
    staleTime: 60 * 1000, // CORS rarely changes
  });
}
