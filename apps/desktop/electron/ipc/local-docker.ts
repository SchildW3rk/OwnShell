import { logger } from '../logger';
import { runLocalDocker, type LocalDockerCommandResult } from '../docker/local-command';
import {
  mergeLocalDockerNetworks,
  parseDockerMemoryValue,
  parseLocalDockerContainerNetworks,
  parseLocalDockerContainers,
  parseLocalDockerImages,
  parseLocalDockerNetworkList,
  parseLocalDockerStats,
} from '../docker/local-parsers';
import { safeHandle } from './safe-ipc';
import { noPayloadSchema } from './schemas/common';
import {
  localDockerActionSchema,
  localDockerComposeActionSchema,
  localDockerContainerSchema,
  localDockerImageRemoveSchema,
  localDockerLogsSchema,
  localDockerNetworkCreateSchema,
  localDockerNetworkMemberSchema,
  localDockerNetworkRemoveSchema,
  localDockerPruneImagesSchema,
  localDockerPsSchema,
} from './schemas/docker';

function readableDockerError(result: LocalDockerCommandResult, fallback: string): string {
  const output = `${result.stderr}\n${result.stdout}`.trim();
  const normalized = output.toLowerCase();

  if (
    normalized.includes('cannot connect to the docker daemon') ||
    normalized.includes('is the docker daemon running') ||
    normalized.includes('docker desktop is not running')
  ) {
    return 'Docker daemon is not running';
  }
  if (normalized.includes('permission denied')) {
    return 'Permission denied while accessing the local Docker daemon';
  }

  return output.slice(0, 1000) || fallback;
}

function isPermissionDenied(result: LocalDockerCommandResult): boolean {
  return `${result.stderr}\n${result.stdout}`.toLowerCase().includes('permission denied');
}

function logLocalDockerFailure(operation: string, result: LocalDockerCommandResult): void {
  logger.warn('Local Docker command failed', {
    operation,
    exitCode: result.exitCode,
    executableFound: result.executableFound,
  });
}

export function setupLocalDockerHandlers(): void {
  safeHandle('local:docker:check', noPayloadSchema, async () => {
    const result = await runLocalDocker(['--version'], 8_000);
    if (!result.executableFound) {
      return { success: true, installed: false };
    }
    if (result.exitCode !== 0) {
      logLocalDockerFailure('check', result);
      return {
        success: false,
        installed: false,
        error: readableDockerError(result, 'Failed to check Docker'),
      };
    }

    return {
      success: true,
      installed: true,
      version: result.stdout.match(/Docker version ([^,]+)/)?.[1],
    };
  });

  safeHandle('local:docker:ps-extended', localDockerPsSchema, async (_event, params) => {
    const result = await runLocalDocker([
      'ps',
      ...(params.all !== false ? ['-a'] : []),
      '--format',
      '{{json .}}',
    ]);
    if (result.exitCode !== 0) {
      logLocalDockerFailure('list-containers-extended', result);
      return {
        success: false,
        permissionDenied: isPermissionDenied(result),
        error: readableDockerError(result, 'Failed to list containers'),
      };
    }

    return { success: true, ...parseLocalDockerContainers(result.stdout) };
  });

  safeHandle('local:docker:action', localDockerActionSchema, async (_event, params) => {
    const command = params.action === 'remove' ? 'rm' : params.action;
    const result = await runLocalDocker([command, params.containerId]);
    if (result.exitCode !== 0) {
      logLocalDockerFailure(`container-${params.action}`, result);
      return {
        success: false,
        error: readableDockerError(result, `Failed to ${params.action} container`),
      };
    }
    return { success: true };
  });

  safeHandle(
    'local:docker:compose-action',
    localDockerComposeActionSchema,
    async (_event, params) => {
      const listResult = await runLocalDocker([
        'ps',
        '-a',
        '--filter',
        `label=com.docker.compose.project=${params.projectName}`,
        '--format',
        '{{.ID}}',
      ]);
      if (listResult.exitCode !== 0) {
        logLocalDockerFailure('list-compose-containers', listResult);
        return {
          success: false,
          error: readableDockerError(listResult, 'Failed to list project containers'),
        };
      }

      const containerIds = listResult.stdout
        .split('\n')
        .map((value) => value.trim())
        .filter((value) => /^[a-f0-9]{12,64}$/i.test(value));
      if (containerIds.length === 0) {
        return { success: false, error: 'No containers found for this project' };
      }

      const actionResult = await runLocalDocker([params.action, ...containerIds]);
      if (actionResult.exitCode !== 0) {
        logLocalDockerFailure(`compose-${params.action}`, actionResult);
        return {
          success: false,
          error: readableDockerError(actionResult, `Failed to ${params.action} project`),
        };
      }
      return { success: true };
    }
  );

  safeHandle('local:docker:logs', localDockerLogsSchema, async (_event, params) => {
    const result = await runLocalDocker([
      'logs',
      '--tail',
      String(params.tail || 100),
      params.containerId,
    ]);
    if (result.exitCode !== 0) {
      logLocalDockerFailure('container-logs', result);
      return { success: false, error: readableDockerError(result, 'Failed to get container logs') };
    }
    return { success: true, logs: [result.stdout, result.stderr].filter(Boolean).join('\n') };
  });

  safeHandle('local:docker:stats', localDockerContainerSchema, async (_event, params) => {
    const result = await runLocalDocker([
      'stats',
      params.containerId,
      '--no-stream',
      '--format',
      '{{json .}}',
    ]);
    if (result.exitCode !== 0) {
      logLocalDockerFailure('container-stats', result);
      return { success: false, error: readableDockerError(result, 'Failed to get container stats') };
    }

    const stats = parseLocalDockerStats(result.stdout, params.containerId);
    return stats
      ? { success: true, stats }
      : { success: false, error: 'Failed to parse container stats' };
  });

  safeHandle('local:docker:images', noPayloadSchema, async () => {
    const result = await runLocalDocker(['images', '--format', '{{json .}}']);
    if (result.exitCode !== 0) {
      logLocalDockerFailure('list-images', result);
      return { success: false, error: readableDockerError(result, 'Failed to list images') };
    }
    return { success: true, images: parseLocalDockerImages(result.stdout) };
  });

  safeHandle('local:docker:image-remove', localDockerImageRemoveSchema, async (_event, params) => {
    const result = await runLocalDocker([
      'rmi',
      ...(params.force ? ['--force'] : []),
      '--',
      params.imageId,
    ]);
    if (result.exitCode !== 0) {
      logLocalDockerFailure('remove-image', result);
      return { success: false, error: readableDockerError(result, 'Failed to remove image') };
    }
    return { success: true };
  });

  safeHandle('local:docker:prune-images', localDockerPruneImagesSchema, async (_event, params) => {
    const result = await runLocalDocker(['image', 'prune', ...(params.all ? ['-a'] : []), '-f']);
    if (result.exitCode !== 0) {
      logLocalDockerFailure('prune-images', result);
      return { success: false, error: readableDockerError(result, 'Failed to prune images') };
    }

    const reclaimed = result.stdout.match(/reclaimed\s+(.+)/i)?.[1]?.trim() || '0B';
    return {
      success: true,
      spaceReclaimed: parseDockerMemoryValue(reclaimed),
      spaceReclaimedHuman: reclaimed,
      prunedCount: (result.stdout.match(/^Deleted:/gm) || []).length,
    };
  });

  safeHandle('local:docker:networks', noPayloadSchema, async () => {
    const listResult = await runLocalDocker(['network', 'ls', '--format', '{{json .}}']);
    if (listResult.exitCode !== 0) {
      logLocalDockerFailure('list-networks', listResult);
      return { success: false, error: readableDockerError(listResult, 'Failed to list networks') };
    }

    const listed = parseLocalDockerNetworkList(listResult.stdout);
    const ids = listed.map((network) => network.ID).filter((id): id is string => Boolean(id)).slice(0, 250);
    if (ids.length === 0) return { success: true, networks: [] };

    const inspectResult = await runLocalDocker(['network', 'inspect', ...ids]);
    if (inspectResult.exitCode !== 0) {
      logLocalDockerFailure('inspect-networks', inspectResult);
    }
    return {
      success: true,
      networks: mergeLocalDockerNetworks(
        listed,
        inspectResult.exitCode === 0 ? inspectResult.stdout : '[]'
      ),
    };
  });

  safeHandle(
    'local:docker:network-create',
    localDockerNetworkCreateSchema,
    async (_event, params) => {
      const args = ['network', 'create'];
      if (params.driver) args.push('--driver', params.driver);
      if (params.subnet) args.push('--subnet', params.subnet);
      if (params.gateway) args.push('--gateway', params.gateway);
      if (params.ipv6) args.push('--ipv6');
      if (params.internal) args.push('--internal');
      args.push(params.name);

      const result = await runLocalDocker(args);
      if (result.exitCode !== 0) {
        logLocalDockerFailure('create-network', result);
        return { success: false, error: readableDockerError(result, 'Failed to create network') };
      }
      return { success: true, networkId: result.stdout.trim() };
    }
  );

  safeHandle('local:docker:network-remove', localDockerNetworkRemoveSchema, async (_event, params) => {
    const result = await runLocalDocker(['network', 'rm', params.networkId]);
    if (result.exitCode !== 0) {
      logLocalDockerFailure('remove-network', result);
      return { success: false, error: readableDockerError(result, 'Failed to remove network') };
    }
    return { success: true };
  });

  safeHandle('local:docker:container-networks', localDockerContainerSchema, async (_event, params) => {
    const result = await runLocalDocker([
      'inspect',
      '--format',
      '{{json .NetworkSettings.Networks}}',
      params.containerId,
    ]);
    if (result.exitCode !== 0) {
      logLocalDockerFailure('container-networks', result);
      return {
        success: false,
        error: readableDockerError(result, 'Failed to get container networks'),
      };
    }
    return { success: true, networks: parseLocalDockerContainerNetworks(result.stdout) };
  });

  safeHandle(
    'local:docker:network-connect',
    localDockerNetworkMemberSchema,
    async (_event, params) => {
      const result = await runLocalDocker([
        'network',
        'connect',
        params.networkName,
        params.containerId,
      ]);
      if (result.exitCode !== 0) {
        logLocalDockerFailure('connect-network', result);
        return {
          success: false,
          error: readableDockerError(result, 'Failed to connect to network'),
        };
      }
      return { success: true };
    }
  );

  safeHandle(
    'local:docker:network-disconnect',
    localDockerNetworkMemberSchema,
    async (_event, params) => {
      const result = await runLocalDocker([
        'network',
        'disconnect',
        params.networkName,
        params.containerId,
      ]);
      if (result.exitCode !== 0) {
        logLocalDockerFailure('disconnect-network', result);
        return {
          success: false,
          error: readableDockerError(result, 'Failed to disconnect from network'),
        };
      }
      return { success: true };
    }
  );
}
