/**
 * S3 Mutation Hooks (TanStack Query)
 *
 * Provides React Query mutation hooks for S3 operations:
 * - useCreateS3Connection: Create a new S3 connection
 * - useUpdateS3Connection: Update an existing S3 connection
 * - useDeleteS3Connection: Delete an S3 connection
 * - useDeleteS3Objects: Delete objects from S3
 * - useSaveS3CORS: Save CORS configuration
 * - useDeleteS3CORS: Delete CORS configuration
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import { S3CORSRule } from '@ownshell/core';
import toast from 'react-hot-toast';
import { i18n } from '../../i18n';

const isDev = process.env.NODE_ENV === 'development';

interface CreateConnectionData {
  label: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName?: string;
}

interface UpdateConnectionData {
  label?: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string | null;
}

/**
 * Create a new S3 connection
 */
export function useCreateS3Connection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateConnectionData): Promise<boolean> => {
      if (isDev) console.log('[S3] Creating connection', { label: data.label });

      const result = await window.electronAPI.s3Connections.create(data);
      return !!result;
    },

    onSuccess: () => {
      toast.success(i18n.t('s3.connectionCreated'));
      queryClient.invalidateQueries({ queryKey: queryKeys.s3.connections() });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('s3.createFailed')}: ${error.message}`);
    },
  });
}

/**
 * Update an existing S3 connection
 */
export function useUpdateS3Connection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateConnectionData }): Promise<void> => {
      if (isDev) console.log('[S3] Updating connection', { id });

      await window.electronAPI.s3Connections.update(id, data);
    },

    onSuccess: () => {
      toast.success(i18n.t('s3.connectionUpdated'));
      queryClient.invalidateQueries({ queryKey: queryKeys.s3.connections() });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('s3.updateFailed')}: ${error.message}`);
    },
  });
}

/**
 * Delete an S3 connection
 */
export function useDeleteS3Connection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (isDev) console.log('[S3] Deleting connection', { id });

      await window.electronAPI.s3Connections.delete(id);
    },

    onSuccess: () => {
      toast.success(i18n.t('s3.connectionDeleted'));
      queryClient.invalidateQueries({ queryKey: queryKeys.s3.connections() });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('s3.deleteFailed')}: ${error.message}`);
    },
  });
}

/**
 * Delete S3 objects
 */
export function useDeleteS3Objects(connectionId: string | null, bucket: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (keys: string[]): Promise<{ deleted: number; errors: number }> => {
      if (!connectionId || !bucket || keys.length === 0) {
        throw new Error('Missing connection, bucket, or keys');
      }

      if (isDev) console.log('[S3] Deleting objects', { count: keys.length });

      const result = await window.electronAPI.s3.deleteObjects({
        connectionId,
        bucket,
        keys,
      });

      if (result.success) {
        return {
          deleted: result.deleted?.length || 0,
          errors: result.errors?.length || 0,
        };
      } else {
        throw new Error(result.error || 'Failed to delete objects');
      }
    },

    onSuccess: (data) => {
      if (data.errors > 0) {
        toast.error(i18n.t('s3.objectsDeletedPartial', { deleted: data.deleted, failed: data.errors }));
      } else {
        toast.success(i18n.t('s3.objectsDeleted', { count: data.deleted }));
      }

      // Invalidate all object queries for this connection/bucket
      queryClient.invalidateQueries({
        queryKey: ['s3', 'objects', connectionId, bucket],
      });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('s3.objectDeleteFailed')}: ${error.message}`);
    },
  });
}

/**
 * Get presigned URL for download
 */
export function useGetPresignedUrl(connectionId: string | null, bucket: string | null) {
  return useMutation({
    mutationFn: async (key: string): Promise<string> => {
      if (!connectionId || !bucket) {
        throw new Error('Missing connection or bucket');
      }

      if (isDev) console.log('[S3] Getting presigned URL', { key });

      const result = await window.electronAPI.s3.getPresignedUrl({
        connectionId,
        bucket,
        key,
        expiresIn: 3600,
      });

      if (result.success && result.url) {
        return result.url;
      } else {
        throw new Error(result.error || 'Failed to get download URL');
      }
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('s3.presignFailed')}: ${error.message}`);
    },
  });
}

/**
 * Save CORS configuration
 */
export function useSaveS3CORS(connectionId: string | null, bucket: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rules: S3CORSRule[]): Promise<void> => {
      if (!connectionId || !bucket) {
        throw new Error('Missing connection or bucket');
      }

      if (isDev) console.log('[S3] Saving CORS configuration', { ruleCount: rules.length });

      const result = await window.electronAPI.s3.putCORS({
        connectionId,
        bucket,
        rules,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save CORS');
      }
    },

    onSuccess: () => {
      toast.success(i18n.t('s3.corsSaved'));
      queryClient.invalidateQueries({
        queryKey: queryKeys.s3.cors(connectionId ?? '', bucket ?? ''),
      });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('s3.corsSaveFailed')}: ${error.message}`);
    },
  });
}

/**
 * Delete CORS configuration
 */
export function useDeleteS3CORS(connectionId: string | null, bucket: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (!connectionId || !bucket) {
        throw new Error('Missing connection or bucket');
      }

      if (isDev) console.log('[S3] Deleting CORS configuration');

      const result = await window.electronAPI.s3.deleteCORS({
        connectionId,
        bucket,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete CORS');
      }
    },

    onSuccess: () => {
      toast.success(i18n.t('s3.corsDeleted'));
      queryClient.invalidateQueries({
        queryKey: queryKeys.s3.cors(connectionId ?? '', bucket ?? ''),
      });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('s3.corsDeleteFailed')}: ${error.message}`);
    },
  });
}
