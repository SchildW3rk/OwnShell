/**
 * Docker Mutation Hooks (TanStack Query)
 *
 * Provides React Query mutation hooks for Docker container actions:
 * - useStartContainer: Start a container with optimistic updates
 * - useStopContainer: Stop a container with optimistic updates
 * - useRestartContainer: Restart a container
 * - useRemoveContainer: Remove a container
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import { DockerContainer, DockerActionResult } from '@ownshell/core';
import toast from 'react-hot-toast';
import { i18n } from '../../i18n';

const isDev = process.env.NODE_ENV === 'development';

type DockerAction = 'start' | 'stop' | 'restart' | 'remove';

interface MutationContext {
  previousContainers?: {
    containers: DockerContainer[];
    permissionDenied: boolean;
    error?: string;
  };
}

/**
 * Generic Docker action mutation
 */
function useDockerAction(sessionId: string | null, action: DockerAction) {
  const queryClient = useQueryClient();
  const sid = sessionId ?? '';
  const queryKey = queryKeys.docker.containers(sid);

  return useMutation<boolean, Error, string, MutationContext>({
    mutationFn: async (containerId: string): Promise<boolean> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      if (isDev) console.log(`[Docker] ${action}ing container`, { sessionId, containerId });

      const result: DockerActionResult = await window.electronAPI.docker.action(
        sessionId,
        containerId,
        action
      );

      if (result.success) {
        return true;
      } else {
        throw new Error(result.error || `Failed to ${action} container`);
      }
    },

    // Optimistic update for start/stop
    onMutate: async (containerId: string) => {
      if (action !== 'start' && action !== 'stop') {
        return {};
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous value
      const previousContainers = queryClient.getQueryData<{
        containers: DockerContainer[];
        permissionDenied: boolean;
        error?: string;
      }>(queryKey);

      // Optimistically update state
      if (previousContainers) {
        const newState = action === 'start' ? 'running' : 'exited';
        const updatedContainers = previousContainers.containers.map((container) =>
          container.id === containerId || container.id.startsWith(containerId)
            ? { ...container, state: newState }
            : container
        );

        queryClient.setQueryData(queryKey, {
          ...previousContainers,
          containers: updatedContainers,
        });
      }

      return { previousContainers };
    },

    onSuccess: () => {
      const messageKey =
        action === 'start'
          ? 'docker.containerStarted'
          : action === 'stop'
            ? 'docker.containerStopped'
            : action === 'restart'
              ? 'docker.containerRestarted'
              : 'docker.containerRemoved';

      toast.success(i18n.t(messageKey));

      // Refetch to get accurate state - invalidate all showAll variants
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers', sid] });
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers-extended', sid] });
    },

    onError: (error, _containerId, context) => {
      // Rollback optimistic update
      if (context?.previousContainers) {
        queryClient.setQueryData(queryKey, context.previousContainers);
      }

      toast.error(`${i18n.t('docker.containerActionFailed')}: ${error.message}`);
    },
  });
}

/**
 * Start a Docker container
 */
export function useStartContainer(sessionId: string | null) {
  return useDockerAction(sessionId, 'start');
}

/**
 * Stop a Docker container
 */
export function useStopContainer(sessionId: string | null) {
  return useDockerAction(sessionId, 'stop');
}

/**
 * Restart a Docker container
 */
export function useRestartContainer(sessionId: string | null) {
  return useDockerAction(sessionId, 'restart');
}

/**
 * Remove a Docker container
 */
export function useRemoveContainer(sessionId: string | null) {
  return useDockerAction(sessionId, 'remove');
}

/**
 * Docker Compose bulk action (start/stop/restart all containers in a project)
 */
export function useComposeAction(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, { projectName: string; action: 'start' | 'stop' | 'restart' }>(
    {
      mutationFn: async ({ projectName, action }): Promise<boolean> => {
        if (!sessionId) {
          throw new Error('No session ID provided');
        }

        if (isDev) console.log(`[Docker] ${action}ing compose project`, { sessionId, projectName });

        const result = await window.electronAPI.docker.composeAction(
          sessionId,
          projectName,
          action
        );

        if (result.success) {
          return true;
        } else {
          throw new Error(result.error || `Failed to ${action} project`);
        }
      },

      onSuccess: (_data, { projectName, action }) => {
        const messageKey =
          action === 'start'
            ? 'docker.compose.started'
            : action === 'stop'
              ? 'docker.compose.stopped'
              : 'docker.compose.restarted';

        toast.success(i18n.t(messageKey, { name: projectName }));

        // Invalidate all container query variants
        const sid = sessionId ?? '';
        queryClient.invalidateQueries({ queryKey: ['docker', 'containers', sid] });
        queryClient.invalidateQueries({ queryKey: ['docker', 'containers-extended', sid] });
      },

      onError: (error) => {
        toast.error(`${i18n.t('docker.compose.actionFailed')}: ${error.message}`);
      },
    }
  );
}

/**
 * Remove Docker image
 */
export function useRemoveImage(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, { imageId: string; force?: boolean }>({
    mutationFn: async ({ imageId, force }): Promise<boolean> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      if (isDev) console.log('[Docker] Removing image', { sessionId, imageId, force });

      const result = await window.electronAPI.docker.imageRemove(sessionId, imageId, force);

      if (result.success) {
        return true;
      } else {
        throw new Error(result.error || 'Failed to remove image');
      }
    },

    onSuccess: () => {
      toast.success(i18n.t('docker.imageRemoved'));
      queryClient.invalidateQueries({ queryKey: queryKeys.docker.images(sessionId ?? '') });
    },

    onError: (error) => {
      toast.error(`${i18n.t('docker.imageRemoveFailed')}: ${error.message}`);
    },
  });
}

/**
 * Prune unused Docker images
 */
export function usePruneImages(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<
    { spaceReclaimed: number; spaceReclaimedHuman: string },
    Error,
    { all?: boolean }
  >({
    mutationFn: async ({
      all,
    }): Promise<{ spaceReclaimed: number; spaceReclaimedHuman: string }> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      if (isDev) console.log('[Docker] Pruning images', { sessionId, all });

      const result = await window.electronAPI.docker.pruneImages(sessionId, all);

      if (result.success) {
        return {
          spaceReclaimed: result.spaceReclaimed || 0,
          spaceReclaimedHuman: result.spaceReclaimedHuman || '0B',
        };
      } else {
        throw new Error(result.error || 'Failed to prune images');
      }
    },

    onSuccess: (data) => {
      toast.success(i18n.t('docker.imagesPruned', { size: data.spaceReclaimedHuman }));
      queryClient.invalidateQueries({ queryKey: queryKeys.docker.images(sessionId ?? '') });
    },

    onError: (error) => {
      toast.error(`${i18n.t('docker.pruneFailed')}: ${error.message}`);
    },
  });
}

/**
 * Create Docker network
 */
export function useCreateNetwork(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: {
      name: string;
      driver?: string;
      subnet?: string;
      gateway?: string;
      ipv6?: boolean;
      internal?: boolean;
    }) => {
      if (!sessionId) throw new Error('No session ID');

      if (isDev) console.log('[Docker] Creating network', { sessionId, options });

      const result = await window.electronAPI.docker.networkCreate(sessionId, options);

      if (!result.success) {
        throw new Error(result.error || 'Failed to create network');
      }

      return result;
    },
    onSuccess: () => {
      // Invalidate networks query
      queryClient.invalidateQueries({ queryKey: queryKeys.docker.networks(sessionId ?? '') });
    },
  });
}

/**
 * Remove Docker network
 */
export function useRemoveNetwork(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ networkId }: { networkId: string }) => {
      if (!sessionId) throw new Error('No session ID');

      if (isDev) console.log('[Docker] Removing network', { sessionId, networkId });

      const result = await window.electronAPI.docker.networkRemove(sessionId, networkId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to remove network');
      }

      return result;
    },
    onSuccess: () => {
      // Invalidate networks query
      queryClient.invalidateQueries({ queryKey: queryKeys.docker.networks(sessionId ?? '') });
    },
  });
}

/**
 * Execute Docker Compose command (up, down, restart, etc.)
 */
export function useComposeCommand(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectPath,
      command,
      args,
    }: {
      projectPath: string;
      command: 'up' | 'down' | 'restart' | 'pull' | 'build' | 'logs';
      args?: string[];
    }) => {
      if (!sessionId) throw new Error('No session ID');

      if (isDev)
        console.log('[Docker] Executing compose command', {
          sessionId,
          projectPath,
          command,
          args,
        });

      const result = await window.electronAPI.docker.composeCommand(
        sessionId,
        projectPath,
        command,
        args
      );

      if (!result.success) {
        throw new Error(result.error || `Failed to execute compose ${command}`);
      }

      return result;
    },
    onSuccess: () => {
      // Invalidate compose projects and all container query variants
      const sid = sessionId ?? '';
      queryClient.invalidateQueries({
        queryKey: queryKeys.docker.composeProjects(sid),
      });
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers', sid] });
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers-extended', sid] });
    },
  });
}

/**
 * Remove Docker Compose project
 */
export function useRemoveComposeProject(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectPath,
      removeVolumes,
    }: {
      projectPath: string;
      removeVolumes?: boolean;
    }) => {
      if (!sessionId) throw new Error('No session ID');

      if (isDev)
        console.log('[Docker] Removing compose project', { sessionId, projectPath, removeVolumes });

      const result = await window.electronAPI.docker.composeRemove(
        sessionId,
        projectPath,
        removeVolumes
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to remove compose project');
      }

      return result;
    },
    onSuccess: () => {
      // Invalidate compose projects and all container query variants
      const sid = sessionId ?? '';
      queryClient.invalidateQueries({
        queryKey: queryKeys.docker.composeProjects(sid),
      });
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers', sid] });
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers-extended', sid] });
    },
  });
}
