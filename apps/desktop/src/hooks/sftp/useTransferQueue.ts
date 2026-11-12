/**
 * Transfer Queue Hook (v1.16.0)
 *
 * Manages the SFTP bulk transfer queue state and events.
 * Provides real-time updates for transfer progress and queue changes.
 */

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

/**
 * Transfer item interface (from backend)
 */
export interface TransferItem {
  id: string;
  host_id: string;
  type: 'upload' | 'download';
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  local_path: string;
  remote_path: string;
  file_name: string;
  file_size: number | null;
  transferred: number;
  error: string | null;
  priority: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  hostLabel?: string;
}

/**
 * Transfer history item
 */
export interface TransferHistoryItem {
  id: string;
  host_id: string;
  host_label: string;
  type: 'upload' | 'download';
  status: 'completed' | 'failed' | 'cancelled';
  local_path: string;
  remote_path: string;
  file_name: string;
  file_size: number | null;
  transferred: number;
  error: string | null;
  started_at: number | null;
  completed_at: number;
}

/**
 * Transfer progress event
 */
export interface TransferProgressEvent {
  transferId: string;
  hostId: string;
  type: 'upload' | 'download';
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  localPath: string;
  remotePath: string;
  fileName: string;
  fileSize: number | null;
  transferred: number;
  percentage: number;
  error?: string;
}

/**
 * Queue stats
 */
export interface TransferQueueStats {
  queueSize: number;
  activeCount: number;
  pendingCount: number;
  totalTransferred: number;
  totalSize: number;
}

/**
 * Hook to fetch the transfer queue
 */
export function useTransferQueue() {
  return useQuery({
    queryKey: queryKeys.transferQueue.queue(),
    queryFn: async () => {
      const result = await window.electronAPI.sftpTransfer.getQueue();
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch transfer queue');
      }
      return result.queue as TransferItem[];
    },
    refetchInterval: (query) => {
      const data = query.state.data as TransferItem[] | undefined;
      const hasActive = data?.some(
        (item) => item.status === 'active' || item.status === 'pending'
      );
      return hasActive ? 2000 : false;
    },
  });
}

/**
 * Hook to fetch transfer history
 */
export function useTransferHistory(limit = 100) {
  return useQuery({
    queryKey: queryKeys.transferQueue.history.byLimit(limit),
    queryFn: async () => {
      const result = await window.electronAPI.sftpTransfer.getHistory(limit);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch transfer history');
      }
      return result.history as TransferHistoryItem[];
    },
  });
}

/**
 * Hook to get transfer stats
 */
export function useTransferStats() {
  return useQuery({
    queryKey: queryKeys.transferQueue.stats(),
    queryFn: async () => {
      const result = await window.electronAPI.sftpTransfer.getStats();
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch transfer stats');
      }
      return result.stats as TransferQueueStats;
    },
    refetchInterval: (query) => {
      const data = query.state.data as TransferQueueStats | undefined;
      const hasActive = data && (data.activeCount > 0 || data.pendingCount > 0);
      return hasActive ? 1000 : false;
    },
  });
}

/**
 * Hook for transfer queue mutations
 */
export function useTransferMutations() {
  const queryClient = useQueryClient();

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.queue() });
    queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.stats() });
    queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.history.all() });
  };

  const pauseTransfer = useMutation({
    mutationFn: async (transferId: string) => {
      const result = await window.electronAPI.sftpTransfer.pause(transferId);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to pause transfer');
      }
    },
    onSuccess: invalidateQueries,
  });

  const resumeTransfer = useMutation({
    mutationFn: async (transferId: string) => {
      const result = await window.electronAPI.sftpTransfer.resume(transferId);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to resume transfer');
      }
    },
    onSuccess: invalidateQueries,
  });

  const cancelTransfer = useMutation({
    mutationFn: async (transferId: string) => {
      const result = await window.electronAPI.sftpTransfer.cancel(transferId);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to cancel transfer');
      }
    },
    onSuccess: invalidateQueries,
  });

  const cancelAllTransfers = useMutation({
    mutationFn: async (hostId: string) => {
      const result = await window.electronAPI.sftpTransfer.cancelAll(hostId);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to cancel all transfers');
      }
    },
    onSuccess: invalidateQueries,
  });

  const clearHistory = useMutation({
    mutationFn: async (before?: number) => {
      const result = await window.electronAPI.sftpTransfer.clearHistory(before);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to clear history');
      }
    },
    onSuccess: invalidateQueries,
  });

  const setParallelTransfers = useMutation({
    mutationFn: async (max: number) => {
      const result = await window.electronAPI.sftpTransfer.setParallel(max);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to set parallel transfers');
      }
    },
  });

  return {
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    cancelAllTransfers,
    clearHistory,
    setParallelTransfers,
  };
}

/**
 * Hook to subscribe to real-time transfer events
 */
export function useTransferEvents(
  onProgress?: (event: TransferProgressEvent) => void,
  onQueueChanged?: (event: {
    totalCount: number;
    pendingCount: number;
    activeCount: number;
    completedCount: number;
    failedCount: number;
  }) => void
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to progress events
    const unsubProgress = window.electronAPI.sftpTransfer.onProgress((event) => {
      onProgress?.(event);

      // If transfer completed or failed, invalidate queries
      if (event.status === 'completed' || event.status === 'failed') {
        queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.queue() });
        queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.history.all() });
      }
    });

    // Subscribe to queue changed events
    const unsubQueue = window.electronAPI.sftpTransfer.onQueueChanged((event) => {
      onQueueChanged?.(event);
      queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.stats() });
    });

    return () => {
      unsubProgress();
      unsubQueue();
    };
  }, [onProgress, onQueueChanged, queryClient]);
}

/**
 * Hook to add transfers to the queue
 */
export function useAddTransfer() {
  const queryClient = useQueryClient();

  const addSingle = useMutation({
    mutationFn: async (params: {
      hostId: string;
      type: 'upload' | 'download';
      localPath: string;
      remotePath: string;
      fileSize?: number;
      priority?: number;
    }) => {
      const result = await window.electronAPI.sftpTransfer.add(params);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to add transfer');
      }
      return result.transferId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.queue() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.stats() });
    },
  });

  const addBulk = useMutation({
    mutationFn: async (
      items: Array<{
        hostId: string;
        type: 'upload' | 'download';
        localPath: string;
        remotePath: string;
        fileSize?: number;
      }>
    ) => {
      const result = await window.electronAPI.sftpTransfer.addBulk(items);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to add transfers');
      }
      return result.transferIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.queue() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.stats() });
    },
  });

  const addDirectory = useMutation({
    mutationFn: async (params: {
      hostId: string;
      type: 'upload' | 'download';
      localPath: string;
      remotePath: string;
      connectionId: string;
    }) => {
      const result = await window.electronAPI.sftpTransfer.addDirectory(params);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to add directory transfer');
      }
      return result.transferIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.queue() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transferQueue.stats() });
    },
  });

  return { addSingle, addBulk, addDirectory };
}
