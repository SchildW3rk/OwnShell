import { logger } from '../../../logger';
import { shellQuote } from '../../../utils/shell-quote';
import { safeHandle } from '../../safe-ipc';
import { sshSessionSchema } from '../../schemas/ssh';
import { dockerActionSchema, dockerLogsSchema } from '../../schemas/docker';
import { SSHDockerContext } from './context';

export function setupDockerContainerHandlers(ctx: SSHDockerContext) {
  const { activeSessions, execCommand } = ctx;
  // ============================================
  // DOCKER HANDLERS
  // ============================================
  
  /**
   * Check if Docker is installed and accessible
   */
  safeHandle(
    'ssh:docker:check',
    sshSessionSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        logger.info('Checking Docker installation', { sessionId: params.sessionId });
  
        const result = await execCommand(session, 'docker --version');
  
        // Check for permission denied
        if (
          result.stderr.includes('permission denied') ||
          result.stderr.includes('Permission denied')
        ) {
          return {
            success: true,
            installed: true,
            permissionDenied: true,
            error: "Permission denied. Try adding user to 'docker' group or use root.",
          };
        }
  
        // Check if command not found
        if (result.exitCode !== 0 || result.stderr.includes('not found')) {
          return {
            success: true,
            installed: false,
          };
        }
  
        // Parse version from stdout
        const versionMatch = result.stdout.match(/Docker version ([^,]+)/);
        const version = versionMatch ? versionMatch[1] : undefined;
  
        return {
          success: true,
          installed: true,
          version,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to check Docker', {
          sessionId: params.sessionId,
          errorMessage,
        });
  
        return {
          success: false,
          installed: false,
          error: errorMessage,
        };
      }
    }
  );
  
  /**
   * Perform Docker container action (start/stop/restart/remove)
   */
  safeHandle(
    'ssh:docker:action',
    dockerActionSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        // For remove, only allow removing stopped containers (no --force)
        const dockerCmd = params.action === 'remove' ? 'rm' : params.action;
        const command = `docker ${dockerCmd} ${shellQuote(params.containerId)}`;
  
        logger.info('Executing Docker action', {
          sessionId: params.sessionId,
          action: params.action,
          containerId: params.containerId,
          command,
        });
  
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          // Check for specific errors
          if (result.stderr.includes('is running')) {
            return {
              success: false,
              error: 'Cannot remove a running container. Stop it first.',
            };
          }
          return {
            success: false,
            error: result.stderr || `Failed to ${params.action} container`,
          };
        }
  
        logger.info('Docker action completed', {
          sessionId: params.sessionId,
          action: params.action,
          containerId: params.containerId,
        });
  
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to execute Docker action', {
          sessionId: params.sessionId,
          action: params.action,
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
   * Get Docker container logs
   */
  safeHandle(
    'ssh:docker:logs',
    dockerLogsSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const tailLines = params.tail || 100;
        const command = `docker logs --tail ${shellQuote(tailLines)} ${shellQuote(params.containerId)} 2>&1`;
  
        logger.info('Getting Docker container logs', {
          sessionId: params.sessionId,
          containerId: params.containerId,
          tail: tailLines,
        });
  
        const result = await execCommand(session, command);
  
        // Docker logs outputs to stderr for some containers, so we combine stdout and stderr
        const logs = result.stdout || result.stderr || '';
  
        return {
          success: true,
          logs,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get Docker logs', {
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
  
  // ============================================
  // DOCKER PRO HANDLERS (v1.11.0)
  // ============================================
  
  
}
