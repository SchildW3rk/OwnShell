import type {
  DockerComposeProject,
  DockerContainerExtended,
  DockerContainerNetwork,
  DockerContainerPortBinding,
  DockerContainerPortTarget,
  DockerContainerState,
  DockerContainerStats,
} from '@ownshell/core';
import { logger } from '../../../logger';
import { shellJoin, shellQuote } from '../../../utils/shell-quote';
import { safeHandle } from '../../safe-ipc';
import { dockerComposeActionSchema, dockerContainerSchema, dockerPsSchema } from '../../schemas/docker';
import { parseMemoryValue, SSHDockerContext } from './context';

function parsePortSpec(portSpec: string): { port: number; protocol: string } | null {
  const [portValue, protocol = 'tcp'] = portSpec.split('/');
  const port = Number.parseInt(portValue, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return { port, protocol };
}

interface ContainerListeningPort {
  portSpec: string;
  port: number;
  protocol: string;
  processName?: string;
  pid?: string;
  listenAddress?: string;
}

const DISCOVER_CONTAINER_PORTS_COMMAND = `
if command -v ss >/dev/null 2>&1; then
  ss -H -ltnp 2>/dev/null || ss -H -ltn 2>/dev/null
elif command -v netstat >/dev/null 2>&1; then
  netstat -ltnp 2>/dev/null || netstat -ltn 2>/dev/null
else
  true
fi
`;

function extractListenAddress(line: string): string | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length === 0) return null;

  if (parts[0] === 'LISTEN') {
    return parts[3] ?? null;
  }

  if (parts[0].startsWith('tcp')) {
    return parts[3] ?? null;
  }

  return null;
}

function extractPort(address: string): number | null {
  const match = address.match(/(?:[:.])(\d+)$/);
  if (!match) return null;

  const port = Number.parseInt(match[1], 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function normalizeProcessName(name: string | undefined): string | undefined {
  const cleaned = name?.trim().replace(/^"|"$/g, '');
  return cleaned || undefined;
}

function parseProcessInfo(line: string): { processName?: string; pid?: string } {
  const userMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
  if (userMatch) {
    return {
      processName: normalizeProcessName(userMatch[1]),
      pid: userMatch[2],
    };
  }

  const netstatMatch = line.match(/\b(\d+)\/([^\s]+)\s*$/);
  if (netstatMatch) {
    return {
      pid: netstatMatch[1],
      processName: normalizeProcessName(netstatMatch[2]),
    };
  }

  return {};
}

function parseContainerListeningPorts(stdout: string): ContainerListeningPort[] {
  const seen = new Set<string>();
  const ports: ContainerListeningPort[] = [];

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !/\bLISTEN\b/.test(trimmed)) continue;

    const listenAddress = extractListenAddress(trimmed);
    if (!listenAddress) continue;

    const port = extractPort(listenAddress);
    if (!port) continue;

    const protocol = 'tcp';
    const portSpec = `${port}/${protocol}`;
    if (seen.has(portSpec)) continue;
    seen.add(portSpec);

    const { processName, pid } = parseProcessInfo(trimmed);
    ports.push({
      portSpec,
      port,
      protocol,
      processName,
      pid,
      listenAddress,
    });
  }

  return ports;
}

function readContainerNetworks(inspect: any): DockerContainerNetwork[] {
  const rawNetworks = inspect?.NetworkSettings?.Networks;

  if (rawNetworks && typeof rawNetworks === 'object') {
    const networks = Object.entries(rawNetworks)
      .map(([name, config]: [string, any]) => ({
        name,
        ipAddress: config?.IPAddress || '',
        gateway: config?.Gateway || '',
        macAddress: config?.MacAddress || '',
      }))
      .filter((network) => Boolean(network.ipAddress));

    if (networks.length > 0) {
      return networks;
    }
  }

  if (inspect?.HostConfig?.NetworkMode === 'host') {
    return [{ name: 'host', ipAddress: '127.0.0.1', gateway: '', macAddress: '' }];
  }

  return [];
}

function readContainerPortTargets(inspect: any): {
  networks: DockerContainerNetwork[];
  ports: DockerContainerPortTarget[];
} {
  const networks = readContainerNetworks(inspect);
  const exposedPorts = inspect?.Config?.ExposedPorts || {};
  const networkPorts = inspect?.NetworkSettings?.Ports || {};
  const portSpecs = Array.from(
    new Set([...Object.keys(exposedPorts), ...Object.keys(networkPorts)])
  ).sort((a, b) => {
    const left = parsePortSpec(a);
    const right = parsePortSpec(b);
    return (left?.port || 0) - (right?.port || 0) || a.localeCompare(b);
  });

  const ports: DockerContainerPortTarget[] = [];

  for (const portSpec of portSpecs) {
    const parsed = parsePortSpec(portSpec);
    if (!parsed) continue;

    const published: DockerContainerPortBinding[] = Array.isArray(networkPorts[portSpec])
      ? networkPorts[portSpec]
          .filter(Boolean)
          .map((binding: any) => ({
            hostIp: binding.HostIp || '',
            hostPort: binding.HostPort || '',
          }))
          .filter((binding: DockerContainerPortBinding) => Boolean(binding.hostPort))
      : [];

    for (const network of networks) {
      ports.push({
        portSpec,
        port: parsed.port,
        protocol: parsed.protocol,
        networkName: network.name,
        ipAddress: network.ipAddress,
        published,
        discoveredFrom: 'docker-inspect',
      });
    }
  }

  return { networks, ports };
}

function mergeListeningPortsIntoTargets(
  networks: DockerContainerNetwork[],
  ports: DockerContainerPortTarget[],
  listeningPorts: ContainerListeningPort[]
): DockerContainerPortTarget[] {
  if (networks.length === 0) {
    return dedupeContainerPortTargets(ports);
  }

  if (listeningPorts.length === 0) {
    return dedupeContainerPortTargets(ports);
  }

  const portsByTarget = new Map(
    ports.map((port) => [`${port.portSpec}:${port.networkName}:${port.ipAddress}`, port])
  );

  for (const listeningPort of listeningPorts) {
    for (const network of networks) {
      const key = `${listeningPort.portSpec}:${network.name}:${network.ipAddress}`;
      const existing = portsByTarget.get(key);

      if (existing) {
        existing.isListening = true;
        existing.processName = listeningPort.processName;
        existing.pid = listeningPort.pid;
        existing.listenAddress = listeningPort.listenAddress;
        continue;
      }

      const discoveredTarget: DockerContainerPortTarget = {
        portSpec: listeningPort.portSpec,
        port: listeningPort.port,
        protocol: listeningPort.protocol,
        networkName: network.name,
        ipAddress: network.ipAddress,
        published: [],
        discoveredFrom: 'container-listener',
        isListening: true,
        processName: listeningPort.processName,
        pid: listeningPort.pid,
        listenAddress: listeningPort.listenAddress,
      };

      ports.push(discoveredTarget);
      portsByTarget.set(key, discoveredTarget);
    }
  }

  return dedupeContainerPortTargets(ports).sort(
    (left, right) => left.port - right.port || left.networkName.localeCompare(right.networkName)
  );
}

function dedupeContainerPortTargets(
  ports: DockerContainerPortTarget[]
): DockerContainerPortTarget[] {
  const targetsByReachableEndpoint = new Map<string, DockerContainerPortTarget>();

  for (const port of ports) {
    const key = `${port.protocol}:${port.networkName}:${port.ipAddress}:${port.port}`;
    const existing = targetsByReachableEndpoint.get(key);

    if (!existing) {
      targetsByReachableEndpoint.set(key, { ...port, published: [...port.published] });
      continue;
    }

    existing.published = dedupePublishedBindings([...existing.published, ...port.published]);
    existing.isListening = existing.isListening || port.isListening;
    existing.processName = existing.processName || port.processName;
    existing.pid = existing.pid || port.pid;
    existing.listenAddress = existing.listenAddress || port.listenAddress;
    existing.discoveredFrom = existing.isListening ? 'container-listener' : existing.discoveredFrom;
  }

  return Array.from(targetsByReachableEndpoint.values());
}

function dedupePublishedBindings(
  bindings: DockerContainerPortBinding[]
): DockerContainerPortBinding[] {
  const seen = new Set<string>();
  return bindings.filter((binding) => {
    const key = `${binding.hostIp}:${binding.hostPort}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function setupDockerContainerDetailHandlers(ctx: SSHDockerContext) {
  const { activeSessions, execCommand } = ctx;
  /**
   * Get Docker container stats (CPU, Memory, Network I/O)
   */
  safeHandle(
    'ssh:docker:stats',
    dockerContainerSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        // Use docker stats with --no-stream for single snapshot
        const command = `docker stats ${shellQuote(params.containerId)} --no-stream --format '{{json .}}'`;
  
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to get container stats',
          };
        }
  
        try {
          const raw = JSON.parse(result.stdout.trim());
  
          // Parse CPU percentage (remove % sign)
          const cpuPercent = parseFloat(raw.CPUPerc?.replace('%', '') || '0');
  
          // Parse memory usage and limit
          const memParts = (raw.MemUsage || '0B / 0B').split(' / ');
          const memoryUsage = parseMemoryValue(memParts[0] || '0B');
          const memoryLimit = parseMemoryValue(memParts[1] || '0B');
          const memoryPercent = parseFloat(raw.MemPerc?.replace('%', '') || '0');
  
          // Parse network I/O
          const netParts = (raw.NetIO || '0B / 0B').split(' / ');
          const networkRx = parseMemoryValue(netParts[0] || '0B');
          const networkTx = parseMemoryValue(netParts[1] || '0B');
  
          // Parse block I/O
          const blockParts = (raw.BlockIO || '0B / 0B').split(' / ');
          const blockRead = parseMemoryValue(blockParts[0] || '0B');
          const blockWrite = parseMemoryValue(blockParts[1] || '0B');
  
          // Parse PIDs
          const pids = parseInt(raw.PIDs || '0', 10);
  
          const stats: DockerContainerStats = {
            containerId: params.containerId,
            cpuPercent,
            memoryUsage,
            memoryLimit,
            memoryPercent,
            networkRx,
            networkTx,
            blockRead,
            blockWrite,
            pids,
            timestamp: Date.now(),
          };
  
          return { success: true, stats };
        } catch (parseErr) {
          logger.warn('Failed to parse Docker stats', { output: result.stdout });
          return {
            success: false,
            error: 'Failed to parse container stats',
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get Docker stats', {
          sessionId: params.sessionId,
          containerId: params.containerId,
          errorMessage,
        });
  
        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  );

  /**
   * Inspect container ports and networks for one-click local SSH tunnels.
   */
  safeHandle(
    'ssh:docker:container-ports',
    dockerContainerSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        const command = `docker inspect --format '{{json .}}' ${shellQuote(params.containerId)}`;
        const result = await execCommand(session, command);

        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to inspect container ports',
          };
        }

        try {
          const inspect = JSON.parse(result.stdout.trim());
          const { networks, ports } = readContainerPortTargets(inspect);

          let listeningPorts: ContainerListeningPort[] = [];
          const listenCommand = shellJoin([
            'docker',
            'exec',
            params.containerId,
            'sh',
            '-lc',
            DISCOVER_CONTAINER_PORTS_COMMAND,
          ]);
          const listenResult = await execCommand(session, listenCommand, 8000);

          if (listenResult.exitCode === 0 && listenResult.stdout.trim()) {
            listeningPorts = parseContainerListeningPorts(listenResult.stdout);
          } else if (listenResult.stderr.trim()) {
            logger.debug('Docker container listener discovery skipped', {
              containerId: params.containerId,
              stderr: listenResult.stderr.substring(0, 300),
            });
          }

          return {
            success: true,
            networks,
            ports: mergeListeningPortsIntoTargets(networks, ports, listeningPorts),
          };
        } catch (parseErr) {
          logger.warn('Failed to parse Docker inspect for ports', {
            output: result.stdout?.substring(0, 500),
            error: parseErr instanceof Error ? parseErr.message : String(parseErr),
          });

          return {
            success: false,
            error: 'Failed to parse container port information',
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to inspect Docker container ports', {
          sessionId: params.sessionId,
          containerId: params.containerId,
          errorMessage,
        });

        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  );
  
  /**
   * List Docker containers with extended info (Compose labels)
   */
  safeHandle(
    'ssh:docker:ps-extended',
    dockerPsSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          logger.error('SSH session not found for Docker ps extended', {
            sessionId: params.sessionId,
            availableSessions: Array.from(activeSessions.keys()),
          });
          throw new Error('SSH session not found');
        }
  
        const allFlag = params.all !== false ? '-a' : '';
        // Use native JSON format - properly escapes all fields
        const command = `docker ps ${allFlag} --format '{{json .}}'`;
  
        const result = await execCommand(session, command);
  
        if (
          result.stderr.includes('permission denied') ||
          result.stderr.includes('Permission denied')
        ) {
          return {
            success: false,
            permissionDenied: true,
            error: "Permission denied. Try adding user to 'docker' group.",
          };
        }

        if (result.stderr.includes('Cannot connect to the Docker daemon')) {
          return {
            success: false,
            error: 'Docker daemon is not running',
          };
        }
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to list containers',
          };
        }
  
        const containers: DockerContainerExtended[] = [];
        const projectsMap = new Map<string, DockerContainerExtended[]>();
        const lines = result.stdout.trim().split('\n').filter(Boolean);
  
        for (const line of lines) {
          try {
            const raw = JSON.parse(line);
  
            // Parse labels string into object (Labels is a comma-separated key=value string)
            const labels: Record<string, string> = {};
            if (raw.Labels) {
              // Labels format: "key1=value1,key2=value2"
              const labelPairs = raw.Labels.split(',');
              for (const pair of labelPairs) {
                const eqIndex = pair.indexOf('=');
                if (eqIndex > 0) {
                  const key = pair.substring(0, eqIndex).trim();
                  const value = pair.substring(eqIndex + 1).trim();
                  labels[key] = value;
                }
              }
            }
  
            const container: DockerContainerExtended = {
              id: raw.ID || '',
              names: raw.Names || '',
              image: raw.Image || '',
              status: raw.Status || '',
              state: (raw.State || 'unknown').toLowerCase() as DockerContainerState,
              ports: raw.Ports || '',
              created: raw.CreatedAt || raw.RunningFor || '',
              command: raw.Command || '',
              composeProject: labels['com.docker.compose.project'],
              composeService: labels['com.docker.compose.service'],
              labels,
            };
  
            containers.push(container);
  
            // Group by compose project
            if (container.composeProject) {
              const existing = projectsMap.get(container.composeProject) || [];
              existing.push(container);
              projectsMap.set(container.composeProject, existing);
            }
          } catch (parseErr) {
            logger.warn('Failed to parse Docker container JSON', {
              line,
              error: parseErr instanceof Error ? parseErr.message : String(parseErr),
            });
          }
        }
  
        logger.info('Docker ps extended parsed', {
          sessionId: params.sessionId,
          containerCount: containers.length,
          projectCount: projectsMap.size,
        });
  
        // Build projects array
        const projects: DockerComposeProject[] = [];
        for (const [name, projectContainers] of projectsMap.entries()) {
          projects.push({
            name,
            containers: projectContainers,
            runningCount: projectContainers.filter((c) => c.state === 'running').length,
            totalCount: projectContainers.length,
          });
        }
  
        return {
          success: true,
          containers,
          projects,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to list Docker containers (extended)', {
          sessionId: params.sessionId,
          errorMessage,
        });
  
        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  );
  
  /**
   * Bulk action for Docker Compose projects (start/stop all containers)
   */
  safeHandle(
    'ssh:docker:compose-action',
    dockerComposeActionSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        // Filter containers by project label and apply action
        const listCommand = `docker ps -a --filter ${shellQuote(`label=com.docker.compose.project=${params.projectName}`)} --format '{{.ID}}'`;
        const listResult = await execCommand(session, listCommand);
  
        if (listResult.exitCode !== 0) {
          return {
            success: false,
            error: listResult.stderr || 'Failed to list project containers',
          };
        }
  
        const containerIds = listResult.stdout.trim().split('\n').filter(Boolean);
        if (containerIds.length === 0) {
          return {
            success: false,
            error: 'No containers found for this project',
          };
        }
  
        // Execute action on all containers
        const actionCommand = `docker ${params.action} ${shellJoin(containerIds)}`;
        const actionResult = await execCommand(session, actionCommand);
  
        if (actionResult.exitCode !== 0) {
          return {
            success: false,
            error: actionResult.stderr || `Failed to ${params.action} project`,
          };
        }
  
        logger.info('Docker Compose action completed', {
          sessionId: params.sessionId,
          projectName: params.projectName,
          action: params.action,
          containerCount: containerIds.length,
        });
  
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to execute Docker Compose action', {
          sessionId: params.sessionId,
          projectName: params.projectName,
          action: params.action,
          errorMessage,
        });
  
        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  );
  
  
}
