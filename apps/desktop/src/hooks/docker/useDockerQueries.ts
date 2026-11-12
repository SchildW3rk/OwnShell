/**
 * Docker Query Hooks (TanStack Query)
 *
 * Provides React Query hooks for Docker container data:
 * - useDockerCheck: Check if Docker is installed and accessible
 * - useDockerContainersExtended: Fetch containers with Compose info
 * - useDockerLogs: Fetch container logs
 * - useDockerStats: Fetch container stats (CPU, Memory, Network)
 * - useDockerImages: Fetch Docker images
 * - useDockerNetworks: Fetch Docker networks
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  DockerCheckResult,
  DockerLogsResult,
  DockerContainerExtended,
  DockerComposeProject,
  DockerListExtendedResult,
  DockerStatsResult,
  DockerContainerStats,
  DockerImagesResult,
  DockerImage,
  DockerNetworksResult,
  DockerNetwork,
  DockerContainerPortsResult,
  DockerContainerPortTarget,
  DockerContainerNetwork,
} from '@ownshell/core';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Check if Docker is installed and accessible on the remote host
 */
export function useDockerCheck(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.docker.check(sessionId ?? ''),
    queryFn: async (): Promise<DockerCheckResult> => {
      if (!sessionId) {
        return { success: false, installed: false, permissionDenied: false };
      }

      if (isDev) console.log('[Docker] Checking Docker installation', { sessionId });

      const result = await window.electronAPI.docker.check(sessionId);

      if (isDev) {
        if (result.permissionDenied) {
          console.log('[Docker] Permission denied', { sessionId });
        } else if (result.installed) {
          console.log('[Docker] Docker is installed', { sessionId, version: result.version });
        } else {
          console.log('[Docker] Docker not installed', { sessionId });
        }
      }

      return result;
    },
    enabled: !!sessionId,
    staleTime: 60 * 1000, // Docker installation status rarely changes
  });
}

/**
 * Fetch Docker container logs
 */
export function useDockerLogs(
  sessionId: string | null,
  containerId: string | null,
  options?: { tail?: number; enabled?: boolean }
) {
  const { tail = 100, enabled = true } = options ?? {};

  return useQuery({
    queryKey: queryKeys.docker.logs(sessionId ?? '', containerId ?? '', tail),
    queryFn: async (): Promise<string> => {
      if (!sessionId || !containerId) {
        return '';
      }

      if (isDev) console.log('[Docker] Getting container logs', { sessionId, containerId, tail });

      const result: DockerLogsResult = await window.electronAPI.docker.logs(
        sessionId,
        containerId,
        tail
      );

      if (result.success) {
        return result.logs || '';
      } else {
        throw new Error(result.error || 'Failed to fetch logs');
      }
    },
    enabled: !!sessionId && !!containerId && enabled,
    staleTime: 5 * 1000, // Logs change very frequently
  });
}

/**
 * Fetch Docker containers with Compose project info
 */
export function useDockerContainersExtended(
  sessionId: string | null,
  options?: { showAll?: boolean; enabled?: boolean }
) {
  const { showAll = true, enabled = true } = options ?? {};

  return useQuery({
    queryKey: queryKeys.docker.containersExtended(sessionId ?? '', showAll),
    queryFn: async (): Promise<{
      containers: DockerContainerExtended[];
      projects: DockerComposeProject[];
      permissionDenied: boolean;
      error?: string;
    }> => {
      if (!sessionId) {
        return { containers: [], projects: [], permissionDenied: false };
      }

      if (isDev) console.log('[Docker] Loading containers (extended)', { sessionId, showAll });

      const result: DockerListExtendedResult = await window.electronAPI.docker.listExtended(
        sessionId,
        showAll
      );

      if (result.success && result.containers) {
        if (isDev) {
          console.log('[Docker] Containers loaded (extended)', {
            sessionId,
            count: result.containers.length,
            projects: result.projects?.length || 0,
          });
        }
        return {
          containers: result.containers,
          projects: result.projects || [],
          permissionDenied: false,
        };
      } else {
        if (isDev) {
          console.error('[Docker] Failed to load containers (extended)', {
            sessionId,
            error: result.error,
          });
        }
        return {
          containers: [],
          projects: [],
          permissionDenied: result.permissionDenied || false,
          error: result.error,
        };
      }
    },
    enabled: !!sessionId && enabled,
    staleTime: 10 * 1000,
    refetchInterval: false,
  });
}

/**
 * Fetch Docker container stats (CPU, Memory, Network I/O)
 * Uses refetchInterval for real-time updates
 */
export function useDockerStats(
  sessionId: string | null,
  containerId: string | null,
  options?: { enabled?: boolean; refetchInterval?: number }
) {
  const { enabled = true, refetchInterval = 2000 } = options ?? {};

  return useQuery({
    queryKey: queryKeys.docker.stats(sessionId ?? '', containerId ?? ''),
    queryFn: async (): Promise<DockerContainerStats | null> => {
      if (!sessionId || !containerId) {
        return null;
      }

      if (isDev) console.log('[Docker] Getting container stats', { sessionId, containerId });

      const result: DockerStatsResult = await window.electronAPI.docker.stats(
        sessionId,
        containerId
      );

      if (result.success && result.stats) {
        return result.stats;
      } else {
        if (isDev) console.warn('[Docker] Failed to get stats', result.error);
        return null;
      }
    },
    enabled: !!sessionId && !!containerId && enabled,
    staleTime: 1000, // Stats change frequently
    refetchInterval: enabled ? refetchInterval : false, // Auto-refresh for real-time graphs
  });
}

/**
 * Fetch Docker images
 */
export function useDockerImages(sessionId: string | null, options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  return useQuery({
    queryKey: queryKeys.docker.images(sessionId ?? ''),
    queryFn: async (): Promise<{ images: DockerImage[]; error?: string }> => {
      if (!sessionId) {
        return { images: [] };
      }

      if (isDev) console.log('[Docker] Loading images', { sessionId });

      const result: DockerImagesResult = await window.electronAPI.docker.images(sessionId);

      if (result.success && result.images) {
        if (isDev) {
          console.log('[Docker] Images loaded', {
            sessionId,
            count: result.images.length,
          });
        }
        return { images: result.images };
      } else {
        console.error('[Docker] Failed to load images', { sessionId, error: result.error });
        return { images: [], error: result.error };
      }
    },
    enabled: !!sessionId && enabled,
    staleTime: 30 * 1000, // Images don't change as frequently
  });
}

/**
 * Fetch Docker networks
 */
export function useDockerNetworks(sessionId: string | null, options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  return useQuery({
    queryKey: queryKeys.docker.networks(sessionId ?? ''),
    queryFn: async (): Promise<{ networks: DockerNetwork[]; error?: string }> => {
      if (!sessionId) {
        return { networks: [] };
      }

      if (isDev) console.log('[Docker] Loading networks', { sessionId });

      const result: DockerNetworksResult = await window.electronAPI.docker.networks(sessionId);

      if (result.success && result.networks) {
        if (isDev) {
          console.log('[Docker] Networks loaded', {
            sessionId,
            count: result.networks.length,
          });
        }
        return { networks: result.networks };
      } else {
        console.error('[Docker] Failed to load networks', { sessionId, error: result.error });
        return { networks: [], error: result.error };
      }
    },
    enabled: !!sessionId && enabled,
    staleTime: 60 * 1000, // Networks change rarely
  });
}

/**
 * Fetch container port targets for local SSH forwarding.
 */
export function useDockerContainerPorts(
  sessionId: string | null,
  containerId: string | null,
  options?: { enabled?: boolean }
) {
  const { enabled = true } = options ?? {};

  return useQuery({
    queryKey: queryKeys.docker.containerPorts(sessionId ?? '', containerId ?? ''),
    queryFn: async (): Promise<{
      ports: DockerContainerPortTarget[];
      networks: DockerContainerNetwork[];
      error?: string;
    }> => {
      if (!sessionId || !containerId) {
        return { ports: [], networks: [] };
      }

      if (isDev) console.log('[Docker] Loading container ports', { sessionId, containerId });

      const result: DockerContainerPortsResult = await window.electronAPI.docker.containerPorts(
        sessionId,
        containerId
      );

      if (result.success) {
        return {
          ports: result.ports || [],
          networks: result.networks || [],
        };
      }

      if (isDev) {
        console.warn('[Docker] Failed to load container ports', {
          sessionId,
          containerId,
          error: result.error,
        });
      }

      return {
        ports: [],
        networks: [],
        error: result.error,
      };
    },
    enabled: !!sessionId && !!containerId && enabled,
    staleTime: 10 * 1000,
  });
}

/**
 * Get Docker Compose projects
 */
export function useComposeProjects(sessionId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.docker.composeProjects(sessionId ?? ''),
    queryFn: async (): Promise<{ projects: any[]; error?: string }> => {
      if (!sessionId) {
        return { projects: [] };
      }

      if (isDev) console.log('[Docker] Discovering compose projects', { sessionId });

      const result = await window.electronAPI.docker.composeDiscover(sessionId);

      if (result.success && result.data) {
        if (isDev) {
          console.log('[Docker] Compose projects discovered', {
            sessionId,
            count: result.data.length,
          });
        }
        return { projects: result.data };
      } else {
        console.error('[Docker] Failed to discover compose projects', {
          sessionId,
          error: result.error,
        });
        return { projects: [], error: result.error };
      }
    },
    enabled: !!sessionId && enabled,
    staleTime: 30 * 1000, // Compose projects can change frequently
  });
}
