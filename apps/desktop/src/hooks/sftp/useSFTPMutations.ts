/**
 * SFTP Mutation Hooks (TanStack Query)
 *
 * Provides React Query mutation hooks for SFTP operations:
 * - useDownloadFile: Download a file
 * - useUploadFile: Upload a file
 * - useDeleteFile: Delete a file with optimistic update
 * - useCreateDirectory: Create a new directory
 * - useRenameFile: Rename a file
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import { SFTPFileEntry } from '@ownshell/core';
import toast from 'react-hot-toast';
import { i18n } from '../../i18n';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Download a file
 */
export function useDownloadFile(sessionId: string | null) {
  return useMutation({
    mutationFn: async (file: SFTPFileEntry): Promise<{ success: boolean; canceled: boolean }> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      const result = await window.electronAPI.sftp.download(sessionId, file.path);

      if (!result.success && !result.canceled) {
        throw new Error(result.error?.message || 'Download failed');
      }

      // Return whether download was successful or canceled
      return {
        success: result.success ?? false,
        canceled: result.canceled ?? false,
      };
    },

    onSuccess: (result, file) => {
      // Only show success toast if file was actually downloaded (not canceled)
      if (result.success && !result.canceled) {
        toast.success(i18n.t('transfers.downloaded', { name: file.name }));
      }
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('transfers.downloadFailed')}: ${error.message}`);
    },
  });
}

/**
 * Upload a file
 */
export function useUploadFile(sessionId: string | null, currentPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      if (isDev) console.log('[SFTP] uploadFile: starting', { sessionId, currentPath });

      const result = await window.electronAPI.sftp.upload(sessionId, currentPath);

      if (isDev) console.log('[SFTP] uploadFile: result', { result });

      if (result.success) {
        return true;
      } else if (result.canceled) {
        return false;
      } else {
        throw new Error(result.error?.message || 'Upload failed');
      }
    },

    onSuccess: (wasUploaded) => {
      if (wasUploaded) {
        toast.success(i18n.t('transfers.uploaded'));
        queryClient.invalidateQueries({
          queryKey: queryKeys.sftp.files(sessionId ?? '', currentPath),
        });
      }
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('transfers.uploadFailed')}: ${error.message}`);
    },
  });
}

/**
 * Delete a file with optimistic update
 */
export function useDeleteFile(sessionId: string | null, currentPath: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.sftp.files(sessionId ?? '', currentPath);

  return useMutation<void, Error, SFTPFileEntry, { previousFiles?: SFTPFileEntry[] }>({
    mutationFn: async (file: SFTPFileEntry): Promise<void> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      const result = await window.electronAPI.sftp.delete(sessionId, file.path);

      if (!result.success) {
        throw new Error(result.error?.message || 'Delete failed');
      }
    },

    // Optimistic update
    onMutate: async (file: SFTPFileEntry) => {
      await queryClient.cancelQueries({ queryKey });

      const previousFiles = queryClient.getQueryData<SFTPFileEntry[]>(queryKey);

      if (previousFiles) {
        queryClient.setQueryData(
          queryKey,
          previousFiles.filter((f) => f.path !== file.path)
        );
      }

      return { previousFiles };
    },

    onSuccess: (_data, file) => {
      toast.success(i18n.t('transfers.deleted', { name: file.name }));
    },

    onError: (error: Error, _file, context) => {
      // Rollback optimistic update
      if (context?.previousFiles) {
        queryClient.setQueryData(queryKey, context.previousFiles);
      }
      toast.error(`${i18n.t('transfers.deleteFailed')}: ${error.message}`);
    },
  });
}

/**
 * Create a new directory
 */
export function useCreateDirectory(sessionId: string | null, currentPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dirName: string): Promise<void> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      const newDirPath = currentPath.endsWith('/')
        ? `${currentPath}${dirName}`
        : `${currentPath}/${dirName}`;

      const result = await window.electronAPI.sftp.mkdir(sessionId, newDirPath);

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to create directory');
      }
    },

    onSuccess: (_data, dirName) => {
      toast.success(i18n.t('transfers.created', { name: dirName }));
      queryClient.invalidateQueries({
        queryKey: queryKeys.sftp.files(sessionId ?? '', currentPath),
      });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('transfers.createDirectoryFailed')}: ${error.message}`);
    },
  });
}

/**
 * Rename a file
 */
export function useRenameFile(sessionId: string | null, currentPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      newName,
    }: {
      file: SFTPFileEntry;
      newName: string;
    }): Promise<void> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      // Calculate new path (same directory, new name)
      const dirPath = file.path.substring(0, file.path.lastIndexOf('/'));
      const newPath = `${dirPath}/${newName}`;

      const result = await window.electronAPI.sftp.rename(sessionId, file.path, newPath);

      if (!result.success) {
        throw new Error(result.error?.message || 'Rename failed');
      }
    },

    onSuccess: (_data, { file, newName }) => {
      toast.success(i18n.t('transfers.renamed', { oldName: file.name, newName }));
      queryClient.invalidateQueries({
        queryKey: queryKeys.sftp.files(sessionId ?? '', currentPath),
      });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('transfers.renameFailed')}: ${error.message}`);
    },
  });
}

/**
 * Change file permissions (chmod)
 */
export function useChmod(sessionId: string | null, currentPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, mode }: { file: SFTPFileEntry; mode: number }): Promise<void> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      if (isDev) console.log('[SFTP] chmod:', { path: file.path, mode: mode.toString(8) });

      const result = await window.electronAPI.sftp.chmod(sessionId, file.path, mode);

      if (!result.success) {
        throw new Error(result.error?.message || 'chmod failed');
      }
    },

    onSuccess: (_data, { file, mode }) => {
      const octalMode = mode.toString(8).padStart(3, '0');
      toast.success(i18n.t('transfers.permissionsChanged', { name: file.name, mode: octalMode }));
      queryClient.invalidateQueries({
        queryKey: queryKeys.sftp.files(sessionId ?? '', currentPath),
      });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('transfers.chmodFailed')}: ${error.message}`);
    },
  });
}

/**
 * Read file content
 */
export function useReadFile(sessionId: string | null) {
  return useMutation({
    mutationFn: async ({ path, maxSize }: { path: string; maxSize?: number }) => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      if (isDev) console.log('[SFTP] readFile:', { path, maxSize });

      const result = await window.electronAPI.sftp.readFile(sessionId, path, maxSize);

      if (!result.success) {
        throw new Error(result.error?.message || 'Read file failed');
      }

      return { content: result.content!, encoding: result.encoding! };
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('transfers.readFailed')}: ${error.message}`);
    },
  });
}

/**
 * Write file content
 */
export function useWriteFile(sessionId: string | null, currentPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ path, content, encoding }: { path: string; content: string; encoding: 'utf-8' | 'latin1' }): Promise<void> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      if (isDev) console.log('[SFTP] writeFile:', { path, contentLength: content.length });

      // Encode once in the main process, preserving the loaded file's byte encoding.
      const result = await window.electronAPI.sftp.writeFile(
        sessionId,
        path,
        content,
        encoding
      );

      if (!result.success) {
        throw new Error(result.error?.message || 'Write file failed');
      }
    },

    onSuccess: (_data, { path }) => {
      const fileName = path.split('/').pop() || path;
      toast.success(i18n.t('transfers.saved', { name: fileName }));
      queryClient.invalidateQueries({
        queryKey: queryKeys.sftp.files(sessionId ?? '', currentPath),
      });
    },

    onError: (error: Error) => {
      toast.error(`${i18n.t('transfers.saveFailed')}: ${error.message}`);
    },
  });
}
