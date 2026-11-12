/**
 * SFTP Standalone Hooks (v1.16.0)
 *
 * Manages standalone SFTP connections independent of SSH terminal sessions.
 * These connections work with SFTP-only hosts or as a dedicated file transfer channel.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SFTPFileEntry } from '@ownshell/core';
import { queryKeys } from '@/lib/queryClient';

/**
 * SFTP Standalone Connection interface
 */
export interface SFTPStandaloneConnection {
  id: string;
  hostId: string;
  hostname: string;
  username: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  createdAt: number;
  lastActivityAt: number;
  error?: string;
}

/**
 * Hook to get all active standalone SFTP connections
 */
export function useSFTPConnections() {
  return useQuery({
    queryKey: queryKeys.sftpStandalone.connections(),
    queryFn: async () => {
      const result = await window.electronAPI.sftpStandalone.getConnections();
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to get SFTP connections');
      }
      return result.connections as SFTPStandaloneConnection[];
    },
    refetchInterval: 15000, // Health check every 15 seconds
  });
}

/**
 * Hook to connect to a standalone SFTP server
 */
export function useSFTPConnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      hostId: string;
      hostname: string;
      port: number;
      username: string;
      authType: 'password' | 'key';
      passwordEncrypted?: string;
      privateKeyEncrypted?: string;
      passphraseEncrypted?: string;
      jumpHostId?: string | null;
      hostLabel?: string;
    }) => {
      const result = await window.electronAPI.sftpStandalone.connect(params);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to connect');
      }
      return result.connectionId as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sftpStandalone.connections() });
    },
  });
}

/**
 * Hook to disconnect from a standalone SFTP server
 */
export function useSFTPDisconnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const result = await window.electronAPI.sftpStandalone.disconnect(connectionId);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to disconnect');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sftpStandalone.connections() });
      queryClient.invalidateQueries({ queryKey: queryKeys.sftpStandalone.files.all() });
    },
  });
}

/**
 * Hook to list files in a standalone SFTP connection
 */
export function useSFTPStandaloneFiles(connectionId: string | null, path: string) {
  return useQuery({
    queryKey: queryKeys.sftpStandalone.files.byPath(connectionId ?? '', path),
    queryFn: async () => {
      if (!connectionId) return [];
      const result = await window.electronAPI.sftpStandalone.list(connectionId, path);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to list files');
      }
      return result.files as SFTPFileEntry[];
    },
    enabled: !!connectionId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook for standalone SFTP file operations
 */
export function useSFTPStandaloneMutations(connectionId: string | null) {
  const queryClient = useQueryClient();

  const invalidateFiles = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sftpStandalone.files.byConnection(connectionId ?? '') });
  };

  const mkdir = useMutation({
    mutationFn: async (path: string) => {
      if (!connectionId) throw new Error('No connection');
      const result = await window.electronAPI.sftpStandalone.mkdir(connectionId, path);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to create directory');
      }
    },
    onSuccess: invalidateFiles,
  });

  const deleteFile = useMutation({
    mutationFn: async (path: string) => {
      if (!connectionId) throw new Error('No connection');
      const result = await window.electronAPI.sftpStandalone.delete(connectionId, path);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to delete');
      }
    },
    onSuccess: invalidateFiles,
  });

  const rename = useMutation({
    mutationFn: async ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      if (!connectionId) throw new Error('No connection');
      const result = await window.electronAPI.sftpStandalone.rename(connectionId, oldPath, newPath);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to rename');
      }
    },
    onSuccess: invalidateFiles,
  });

  const chmod = useMutation({
    mutationFn: async ({ path, mode }: { path: string; mode: number }) => {
      if (!connectionId) throw new Error('No connection');
      const result = await window.electronAPI.sftpStandalone.chmod(connectionId, path, mode);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to change permissions');
      }
    },
    onSuccess: invalidateFiles,
  });

  const readFile = useMutation({
    mutationFn: async ({ path, maxSize }: { path: string; maxSize?: number }) => {
      if (!connectionId) throw new Error('No connection');
      const result = await window.electronAPI.sftpStandalone.readFile(connectionId, path, maxSize);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to read file');
      }
      return { content: result.content || '', encoding: result.encoding! };
    },
  });

  const writeFile = useMutation({
    mutationFn: async ({ path, content, encoding }: { path: string; content: string; encoding: 'utf-8' | 'latin1' }) => {
      if (!connectionId) throw new Error('No connection');
      // Encode once in the main process, preserving the loaded file's byte encoding.
      const result = await window.electronAPI.sftpStandalone.writeFile(
        connectionId,
        path,
        content,
        encoding
      );
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to write file');
      }
    },
    onSuccess: invalidateFiles,
  });

  return {
    mkdir,
    deleteFile,
    rename,
    chmod,
    readFile,
    writeFile,
  };
}

/**
 * Hook to show file dialogs for standalone SFTP
 */
export function useSFTPDialogs() {
  const showSaveDialog = useMutation({
    mutationFn: async (params?: { defaultPath?: string; title?: string }) => {
      const result = await window.electronAPI.sftpStandalone.showSaveDialog(params);
      if (!result.success) {
        throw new Error(result.error?.message || 'Dialog failed');
      }
      return { canceled: result.canceled, filePath: result.filePath };
    },
  });

  const showOpenDialog = useMutation({
    mutationFn: async (params?: { title?: string; multiple?: boolean; directories?: boolean }) => {
      const result = await window.electronAPI.sftpStandalone.showOpenDialog(params);
      if (!result.success) {
        throw new Error(result.error?.message || 'Dialog failed');
      }
      return { canceled: result.canceled, filePaths: result.filePaths };
    },
  });

  return { showSaveDialog, showOpenDialog };
}
