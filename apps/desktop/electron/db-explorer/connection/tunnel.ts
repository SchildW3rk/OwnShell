import { DBConnectionConfig, DBConnectionError } from '@ownshell/core';
import { tunnelManager } from '../../ssh/tunnel-manager';
import {
  createBackgroundSSHSession,
  findSessionByHostId,
  getSSHAdapter,
  getSSHClient,
  isSessionConnected,
} from '../../ipc/ssh';
import { sshSessionManager } from '../../ssh/session-manager';
import { logger } from '../../logger';
import { shellQuote } from '../../utils/shell-quote';
import type { ActiveConnection } from './types';

export interface DatabaseTunnelResult {
  tunnelId: string;
  localPort: number;
  sshSessionId: string;
  autoCreatedSshSession: boolean;
}

export async function setupDatabaseTunnel(
  config: DBConnectionConfig,
  requestedSshSessionId: string | undefined,
  connectionId: string
): Promise<DatabaseTunnelResult> {
  const resolvedSession = await resolveSshSession(config, requestedSshSessionId, connectionId);
  const { sshSessionId, autoCreatedSshSession } = resolvedSession;

  if (!isSessionConnected(sshSessionId)) {
    throw new DBConnectionError(
      'SSH session not connected. Please connect to the SSH host first.',
      'SSH_SESSION_NOT_CONNECTED'
    );
  }

  const sshClient = getSSHClient(sshSessionId);
  if (!sshClient) {
    throw new DBConnectionError(
      'SSH session not found. Please connect to the SSH host first.',
      'SSH_SESSION_NOT_FOUND'
    );
  }

  if (!config.host || !config.port) {
    throw new DBConnectionError(
      'Host and port are required for SSH tunnel connections',
      'INVALID_CONFIG'
    );
  }

  try {
    const remoteHost = await resolveTunnelRemoteHost(config, sshSessionId, connectionId);
    const localPort = await findAvailablePort(config.port);

    logger.info('Creating SSH tunnel for database', {
      connectionId,
      sshSessionId,
      localPort,
      remoteHost,
      remotePort: config.port,
      dockerTarget: isDockerTunnelTarget(config),
    });

    const tunnelId = await tunnelManager.startTunnel(sshClient, sshSessionId, {
      localPort,
      remoteHost,
      remotePort: config.port,
      description: `DB: ${config.name} (${config.type})`,
    });

    return {
      tunnelId,
      localPort,
      sshSessionId,
      autoCreatedSshSession,
    };
  } catch (error) {
    if (autoCreatedSshSession) {
      sshSessionManager.disconnect(sshSessionId, 'db-tunnel-failed');
    }

    if (error instanceof DBConnectionError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown tunnel error';
    throw new DBConnectionError(
      `Failed to create SSH tunnel: ${errorMessage}`,
      'TUNNEL_CREATION_FAILED',
      error instanceof Error ? error : undefined
    );
  }
}

async function resolveTunnelRemoteHost(
  config: DBConnectionConfig,
  sshSessionId: string,
  connectionId: string
): Promise<string> {
  if (!isDockerTunnelTarget(config)) {
    return config.host as string;
  }

  const dockerContainer = config.dockerContainer?.trim();
  if (!dockerContainer) {
    throw new DBConnectionError(
      'Docker container name is required for SSH Docker database connections',
      'INVALID_CONFIG'
    );
  }

  const containerIp = await resolveDockerContainerIp(sshSessionId, dockerContainer, connectionId);
  logger.info('Resolved Docker database target', {
    connectionId,
    sshSessionId,
    dockerContainer,
    remoteHost: containerIp,
  });

  return containerIp;
}

function isDockerTunnelTarget(config: DBConnectionConfig): boolean {
  return config.executionMode === 'docker';
}

async function resolveDockerContainerIp(
  sshSessionId: string,
  dockerContainer: string,
  connectionId: string
): Promise<string> {
  const sshAdapter = getSSHAdapter(sshSessionId);
  if (!sshAdapter) {
    throw new DBConnectionError(
      'Docker database targets require a main-process SSH session. Please reconnect the SSH host and try again.',
      'SSH_SESSION_NOT_FOUND'
    );
  }

  const command = `docker inspect --format='{{json .NetworkSettings.Networks}}' ${shellQuote(
    dockerContainer
  )}`;
  const result = await sshAdapter.exec(command);

  if (result.exitCode !== 0) {
    const details = result.stderr.trim() || 'Docker inspect failed';
    throw new DBConnectionError(
      `Failed to inspect Docker container "${dockerContainer}": ${details}`,
      'DOCKER_CONTAINER_INSPECT_FAILED'
    );
  }

  const networks = parseDockerNetworkInspect(result.stdout, dockerContainer);
  const network = networks.find((candidate) => candidate.ipAddress);

  if (!network) {
    throw new DBConnectionError(
      `Docker container "${dockerContainer}" has no reachable IPv4 address`,
      'DOCKER_CONTAINER_IP_NOT_FOUND'
    );
  }

  logger.debug('Docker database target network selected', {
    connectionId,
    sshSessionId,
    dockerContainer,
    network: network.name,
    ipAddress: network.ipAddress,
  });

  return network.ipAddress;
}

function parseDockerNetworkInspect(
  stdout: string,
  dockerContainer: string
): Array<{ name: string; ipAddress: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch (error) {
    throw new DBConnectionError(
      `Failed to parse Docker network data for "${dockerContainer}"`,
      'DOCKER_CONTAINER_INSPECT_PARSE_FAILED',
      error instanceof Error ? error : undefined
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  return Object.entries(parsed as Record<string, unknown>).map(([name, value]) => {
    const network = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const ipAddress = typeof network.IPAddress === 'string' ? network.IPAddress : '';
    return { name, ipAddress };
  });
}

export async function stopDatabaseTunnel(tunnelId: string): Promise<void> {
  await tunnelManager.stopTunnel(tunnelId);
}

export function disconnectAutoCreatedSshSessionIfUnused(
  connectionId: string,
  connection: ActiveConnection,
  connections: Map<string, ActiveConnection>
): void {
  if (!connection.autoCreatedSshSession || !connection.sshSessionId) {
    return;
  }

  const otherConnectionsUsingSameSession = Array.from(connections.values()).some(
    (conn) => conn.id !== connectionId && conn.sshSessionId === connection.sshSessionId
  );

  if (otherConnectionsUsingSameSession) {
    logger.info('SSH session still in use by other connections, keeping alive', {
      connectionId,
      sshSessionId: connection.sshSessionId,
    });
    return;
  }

  logger.info('Disconnecting auto-created SSH session', {
    connectionId,
    sshSessionId: connection.sshSessionId,
  });
  sshSessionManager.disconnect(connection.sshSessionId, 'db-disconnect');
}

async function resolveSshSession(
  config: DBConnectionConfig,
  requestedSshSessionId: string | undefined,
  connectionId: string
): Promise<{ sshSessionId: string; autoCreatedSshSession: boolean }> {
  let sshSessionId = requestedSshSessionId;

  if (sshSessionId) {
    const requestedSession = sshSessionManager.getSession(sshSessionId);
    if (
      requestedSession &&
      !requestedSession.isWorkerSession &&
      isSessionConnected(sshSessionId)
    ) {
      return { sshSessionId, autoCreatedSshSession: false };
    }

    logger.info('Ignoring unsuitable SSH session for database tunnel', {
      connectionId,
      sshSessionId,
      sshHostId: config.sshHostId,
      reason: requestedSession?.isWorkerSession ? 'worker-session' : 'not-connected',
    });
    sshSessionId = undefined;
  }

  if (!sshSessionId && config.sshHostId) {
    const candidateSessionId = findSessionByHostId(config.sshHostId);
    if (candidateSessionId) {
      const candidateSession = sshSessionManager.getSession(candidateSessionId);
      if (candidateSession && !candidateSession.isWorkerSession) {
        sshSessionId = candidateSessionId;
        logger.info('Found existing SSH session for database connection', {
          connectionId,
          sshSessionId,
          sshHostId: config.sshHostId,
        });
      }
    }
  }

  if (!config.sshHostId) {
    throw new DBConnectionError('SSH host is required for SSH tunnel connections', 'INVALID_CONFIG');
  }

  logger.info('Creating background SSH session for database connection', {
    connectionId,
    sshHostId: config.sshHostId,
  });

  try {
    return {
      sshSessionId: await createBackgroundSSHSession(config.sshHostId),
      autoCreatedSshSession: true,
    };
  } catch (sshError) {
    const sshMessage = sshError instanceof Error ? sshError.message : 'Unknown SSH error';
    throw new DBConnectionError(
      `Failed to establish SSH connection: ${sshMessage}`,
      'SSH_CONNECTION_FAILED'
    );
  }
}

async function findAvailablePort(preferredPort: number): Promise<number> {
  const net = await import('net');

  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on('error', () => {
      server.listen(0, '127.0.0.1');
    });

    server.on('listening', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : preferredPort;
      server.close(() => resolve(port));
    });

    server.listen(preferredPort, '127.0.0.1');

    setTimeout(() => {
      server.close();
      reject(new Error('Timeout finding available port'));
    }, 5000);
  });
}
