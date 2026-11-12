import { DockerNetwork } from '@ownshell/core';
import { logger } from '../../../logger';
import { shellQuote } from '../../../utils/shell-quote';
import { safeHandle } from '../../safe-ipc';
import { sshSessionSchema } from '../../schemas/ssh';
import { dockerContainerSchema, dockerNetworkCreateSchema, dockerNetworkMemberSchema, dockerNetworkRemoveSchema } from '../../schemas/docker';
import { SSHDockerContext } from './context';

export function setupDockerNetworkHandlers(ctx: SSHDockerContext) {
  const { activeSessions, execCommand } = ctx;
  /**
   * List Docker networks
   */
  safeHandle(
    'ssh:docker:networks',
    sshSessionSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const command = `docker network ls --format '{{json .}}'`;
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to list networks',
          };
        }
  
        const networks: DockerNetwork[] = [];
        const lines = result.stdout.trim().split('\n').filter(Boolean);
  
        for (const line of lines) {
          try {
            const raw = JSON.parse(line);
  
            // Get additional network info via inspect
            const inspectResult = await execCommand(
              session,
              `docker network inspect ${shellQuote(raw.ID)} --format '{{json .}}'`
            );
            let subnet: string | undefined;
            let gateway: string | undefined;
            let internal = false;
            let ipv6 = false;
            let containers = 0;
  
            if (inspectResult.exitCode === 0) {
              try {
                const inspect = JSON.parse(inspectResult.stdout.trim());
                internal = inspect.Internal || false;
                ipv6 = inspect.EnableIPv6 || false;
                containers = Object.keys(inspect.Containers || {}).length;
                if (inspect.IPAM?.Config?.[0]) {
                  subnet = inspect.IPAM.Config[0].Subnet;
                  gateway = inspect.IPAM.Config[0].Gateway;
                }
              } catch {
                // Ignore parse errors for inspect
              }
            }
  
            networks.push({
              id: raw.ID || '',
              name: raw.Name || '',
              driver: raw.Driver || '',
              scope: raw.Scope || '',
              internal,
              ipv6,
              subnet,
              gateway,
              created: raw.CreatedAt || '',
              containers,
            });
          } catch (parseErr) {
            logger.warn('Failed to parse Docker network JSON', { line });
          }
        }
  
        return { success: true, networks };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to list Docker networks', {
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
   * Create Docker network
   */
  safeHandle(
    'ssh:docker:network-create',
    dockerNetworkCreateSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const flags = [];
        if (params.driver) flags.push(`--driver=${shellQuote(params.driver)}`);
        if (params.subnet) flags.push(`--subnet=${shellQuote(params.subnet)}`);
        if (params.gateway) flags.push(`--gateway=${shellQuote(params.gateway)}`);
        if (params.ipv6) flags.push('--ipv6');
        if (params.internal) flags.push('--internal');
  
        const command = `docker network create ${flags.join(' ')} ${shellQuote(params.name)}`;
  
        logger.info('Creating Docker network', { name: params.name, flags });
  
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to create network',
          };
        }
  
        return {
          success: true,
          networkId: result.stdout.trim(),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to create Docker network', {
          sessionId: params.sessionId,
          name: params.name,
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
   * Remove Docker network
   */
  safeHandle(
    'ssh:docker:network-remove',
    dockerNetworkRemoveSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const command = `docker network rm ${shellQuote(params.networkId)}`;
  
        logger.info('Removing Docker network', { networkId: params.networkId });
  
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to remove network',
          };
        }
  
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to remove Docker network', {
          sessionId: params.sessionId,
          networkId: params.networkId,
          errorMessage,
        });
  
        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  );
  
  
  // ============================================
  // DOCKER NETWORK HANDLERS
  // ============================================
  
  /**
   * Get networks a container is connected to
   */
  safeHandle(
    'ssh:docker:container-networks',
    dockerContainerSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const command = `docker inspect --format='{{json .NetworkSettings.Networks}}' ${shellQuote(params.containerId)}`;
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to get container networks',
          };
        }
  
        try {
          const networks = JSON.parse(result.stdout.trim());
          const networkList = Object.entries(networks).map(([name, config]: [string, any]) => ({
            name,
            ipAddress: config.IPAddress || '',
            gateway: config.Gateway || '',
            macAddress: config.MacAddress || '',
          }));
  
          return {
            success: true,
            networks: networkList,
          };
        } catch {
          return {
            success: true,
            networks: [],
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  /**
   * Connect container to network
   */
  safeHandle(
    'ssh:docker:network-connect',
    dockerNetworkMemberSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const command = `docker network connect ${shellQuote(params.networkName)} ${shellQuote(params.containerId)}`;
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to connect to network',
          };
        }
  
        logger.info('Container connected to network', {
          containerId: params.containerId,
          network: params.networkName,
        });
  
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  /**
   * Disconnect container from network
   */
  safeHandle(
    'ssh:docker:network-disconnect',
    dockerNetworkMemberSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const command = `docker network disconnect ${shellQuote(params.networkName)} ${shellQuote(params.containerId)}`;
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to disconnect from network',
          };
        }
  
        logger.info('Container disconnected from network', {
          containerId: params.containerId,
          network: params.networkName,
        });
  
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  
}
