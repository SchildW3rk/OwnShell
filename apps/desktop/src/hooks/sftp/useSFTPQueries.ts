/**
 * SFTP Query Hooks (TanStack Query)
 *
 * Provides React Query hooks for SFTP file browser:
 * - useSFTPFiles: Fetch files in a directory
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import { SFTPFileEntry } from '@ownshell/core';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Sort files: directories first, then alphabetically
 */
function sortFiles(files: SFTPFileEntry[]): SFTPFileEntry[] {
  const startedAt = performance.now();
  const sorted = [...files].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });
  performance.clearMeasures('sftp:list:sort');
  performance.measure('sftp:list:sort', { start: startedAt, detail: { entries: files.length } });
  return sorted;
}

/**
 * Fetch files in a directory
 */
export function useSFTPFiles(sessionId: string | null, path: string = '.') {
  return useQuery({
    queryKey: queryKeys.sftp.files(sessionId ?? '', path),
    queryFn: async (): Promise<SFTPFileEntry[]> => {
      if (!sessionId) {
        return [];
      }

      if (isDev) console.log('[SFTP] Loading files', { sessionId, path });

      const result = await window.electronAPI.sftp.list(sessionId, path);

      if (result.success && result.files) {
        const sortedFiles = sortFiles(result.files);
        if (isDev) console.log('[SFTP] Files loaded', { count: sortedFiles.length });
        return sortedFiles;
      } else {
        throw new Error(result.error?.message || 'Failed to list directory');
      }
    },
    enabled: !!sessionId,
    staleTime: 10 * 1000, // Files can change frequently
  });
}
