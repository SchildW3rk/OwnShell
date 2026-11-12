import { SSH2Adapter } from '../../ssh/ssh2-adapter';
import { tunnelManager } from '../../ssh/tunnel-manager';
import { sshSessionManager } from '../../ssh/session-manager';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { sshSessionSchema, sshTunnelIdSchema, sshTunnelStartSchema } from '../schemas/ssh';
import type { SSHIPCContext } from './context';
import type { DiscoveredTunnelService } from '@ownshell/core';

const DISCOVER_SERVICES_COMMAND = `
if command -v ss >/dev/null 2>&1; then
  ss -H -ltnp 2>/dev/null || ss -H -ltn 2>/dev/null
elif command -v netstat >/dev/null 2>&1; then
  netstat -ltnp 2>/dev/null || netstat -ltn 2>/dev/null || netstat -an -p tcp 2>/dev/null | grep LISTEN
else
  true
fi
`;

const IGNORED_LISTEN_PORTS = new Set([22, 53, 111, 123, 323, 631, 953]);
const MAX_DISCOVERED_SERVICES = 32;

const COMMON_SERVICE_NAMES = new Map<number, string>([
  [80, 'Webserver'],
  [443, 'HTTPS'],
  [3000, 'Node/Web App'],
  [3001, 'Node/Web App'],
  [4173, 'Vite Preview'],
  [5173, 'Vite Dev Server'],
  [5432, 'PostgreSQL'],
  [3306, 'MySQL'],
  [6379, 'Redis'],
  [27017, 'MongoDB'],
  [9200, 'Elasticsearch'],
  [5601, 'Kibana'],
  [8080, 'HTTP Service'],
  [8443, 'HTTPS Service'],
]);

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

function extractPort(address: string): number | null {
  const match = address.match(/(?:[:.])(\d+)$/);
  if (!match) return null;

  const port = Number(match[1]);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function normalizeTunnelHost(address: string): string {
  const withoutPort = address.replace(/(?:[:.])\d+$/, '');
  const host = withoutPort
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/%[^:]+$/, '')
    .trim();

  if (!host || host === '*' || host === '::' || host === '0.0.0.0' || host === ':::') {
    return '127.0.0.1';
  }

  if (host === '::1' || host === 'localhost') {
    return '127.0.0.1';
  }

  return host;
}

function getLocalAddressFromLine(line: string): string | null {
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

function parseDiscoveredServices(stdout: string): DiscoveredTunnelService[] {
  const seen = new Set<string>();
  const services: DiscoveredTunnelService[] = [];

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !/\bLISTEN\b/.test(trimmed)) continue;

    const listenAddress = getLocalAddressFromLine(trimmed);
    if (!listenAddress) continue;

    const port = extractPort(listenAddress);
    if (!port || IGNORED_LISTEN_PORTS.has(port)) continue;

    const host = normalizeTunnelHost(listenAddress);
    const key = `${host}:${port}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { processName, pid } = parseProcessInfo(trimmed);
    const fallbackName = COMMON_SERVICE_NAMES.get(port) ?? `Port ${port}`;
    const name = processName ? `${processName} :${port}` : fallbackName;

    services.push({
      id: `host:${key}`,
      source: 'host',
      name,
      host,
      port,
      protocol: 'tcp',
      processName,
      pid,
      listenAddress,
    });

    if (services.length >= MAX_DISCOVERED_SERVICES) {
      break;
    }
  }

  return services;
}

export function setupSSHTunnelHandlers(ctx: SSHIPCContext) {
  const { mainWindow, activeSessions, getOrCreateBackgroundSession, requireClient, execCommand } = ctx;
  // ============================================
  // TUNNEL (PORT FORWARDING) HANDLERS
  // ============================================

  // Set main window for tunnel status events
  tunnelManager.setMainWindow(mainWindow);

  /**
   * Start a new port forwarding tunnel
   */
  safeHandle(
    'ssh:tunnel:start',
    sshTunnelStartSchema,
    async (_event, params) => {
      try {
        logger.info('Starting tunnel', {
          sessionId: params.sessionId,
          config: params.config,
        });

        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        // Get the underlying ssh2 Client (use background connection for worker sessions)
        let sshClient: ReturnType<SSH2Adapter['getClient']>;
        if (session.isWorkerSession) {
          const bgSessionId = await getOrCreateBackgroundSession(session.hostId);
          const bgSession = sshSessionManager.getSession(bgSessionId);
          if (!bgSession || !bgSession.client) {
            throw new Error('Failed to get background SSH session for tunnel');
          }
          sshClient = bgSession.client.getClient();
        } else {
          sshClient = requireClient(session).getClient();
        }

        const tunnelId = await tunnelManager.startTunnel(
          sshClient,
          params.sessionId,
          params.config
        );

        return { success: true, tunnelId };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = (error as any).code || 'UNKNOWN';

        logger.error('Failed to start tunnel', {
          sessionId: params.sessionId,
          config: params.config,
          errorMessage,
          errorCode,
        });

        return {
          success: false,
          error: {
            message: errorMessage,
            code: errorCode,
          },
        };
      }
    }
  );

  /**
   * Stop a tunnel
   */
  safeHandle(
    'ssh:tunnel:stop',
    sshTunnelIdSchema,
    async (_event, params) => {
      try {
        logger.info('Stopping tunnel', { tunnelId: params.tunnelId });

        await tunnelManager.stopTunnel(params.tunnelId);

        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('Failed to stop tunnel', {
          tunnelId: params.tunnelId,
          errorMessage,
        });

        return {
          success: false,
          error: {
            message: errorMessage,
          },
        };
      }
    }
  );

  /**
   * List all tunnels for a session
   */
  safeHandle(
    'ssh:tunnel:list',
    sshSessionSchema,
    async (_event, params) => {
      try {
        const tunnels = tunnelManager.getTunnelsBySession(params.sessionId);
        return { success: true, tunnels };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('Failed to list tunnels', {
          sessionId: params.sessionId,
          errorMessage,
        });

        return {
          success: false,
          error: {
            message: errorMessage,
          },
        };
      }
    }
  );

  /**
   * Discover common listening TCP services on the remote SSH host.
   */
  safeHandle(
    'ssh:tunnel:discover-services',
    sshSessionSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        const result = await execCommand(session, DISCOVER_SERVICES_COMMAND, 8000);
        if (result.exitCode !== 0 && !result.stdout.trim()) {
          return {
            success: false,
            error: result.stderr || 'Could not discover listening services',
          };
        }

        return {
          success: true,
          services: parseDiscoveredServices(result.stdout),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('Failed to discover tunnel services', {
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

}
