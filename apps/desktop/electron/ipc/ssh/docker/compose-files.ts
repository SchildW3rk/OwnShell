import { logger } from '../../../logger';
import { shellQuote } from '../../../utils/shell-quote';
import { safeHandle } from '../../safe-ipc';
import { dockerComposeDownSchema, dockerComposeFileWriteSchema, dockerComposePathSchema, dockerComposeProjectSchema, dockerComposeUpSchema } from '../../schemas/docker';
import { SSHDockerContext } from './context';

export function setupDockerComposeFileHandlers(ctx: SSHDockerContext) {
  const { activeSessions, execCommand, ensureSftpClient } = ctx;
  // ============================================
  // DOCKER COMPOSE HANDLERS
  // ============================================
  
  /**
   * Get Compose file path from container labels
   */
  safeHandle(
    'ssh:docker:compose-file-path',
    dockerComposeProjectSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        // Get the config file path from any container in the project
        const command = `docker ps -a --filter ${shellQuote(`label=com.docker.compose.project=${params.projectName}`)} --format '{{.Label "com.docker.compose.project.config_files"}}' | head -1`;
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0 || !result.stdout.trim()) {
          return {
            success: false,
            error: 'Could not find compose file path',
          };
        }
  
        // The label may contain multiple paths separated by comma, take the first
        const configPath = result.stdout.trim().split(',')[0];
  
        return {
          success: true,
          path: configPath,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  /**
   * Read Compose file content
   */
  safeHandle(
    'ssh:docker:compose-file-read',
    dockerComposePathSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const result = await execCommand(session, `cat ${shellQuote(params.path)}`);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to read file',
          };
        }
  
        return {
          success: true,
          content: result.stdout,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  /**
   * Write Compose file content
   */
  safeHandle(
    'ssh:docker:compose-file-write',
    dockerComposeFileWriteSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        // Use SFTP to write the file
        // Ensure SFTP client (routes through background connection for worker sessions)
        await ensureSftpClient(session);
  
        await session.sftpClient!.writeFile(params.path, params.content);
  
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  /**
   * Run docker-compose up
   */
  safeHandle(
    'ssh:docker:compose-up',
    dockerComposeUpSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const flags = [];
        if (params.detached !== false) flags.push('-d');
        if (params.build) flags.push('--build');
  
        // Try docker compose (v2) first, fallback to docker-compose (v1)
        const command = `compose_file=${shellQuote(params.path)}; compose_dir=$(dirname "$compose_file"); compose_name=$(basename "$compose_file"); cd "$compose_dir" && (docker compose -f "$compose_name" up ${flags.join(' ')} 2>/dev/null || docker-compose -f "$compose_name" up ${flags.join(' ')})`;
  
        logger.info('Running docker compose up', { path: params.path, flags });
  
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to start compose stack',
            output: result.stdout,
          };
        }
  
        return {
          success: true,
          output: result.stdout,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  /**
   * Run docker-compose down
   */
  safeHandle(
    'ssh:docker:compose-down',
    dockerComposeDownSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const flags = [];
        if (params.removeVolumes) flags.push('-v');
        if (params.removeOrphans) flags.push('--remove-orphans');
  
        const command = `compose_file=${shellQuote(params.path)}; compose_dir=$(dirname "$compose_file"); compose_name=$(basename "$compose_file"); cd "$compose_dir" && (docker compose -f "$compose_name" down ${flags.join(' ')} 2>/dev/null || docker-compose -f "$compose_name" down ${flags.join(' ')})`;
  
        logger.info('Running docker compose down', { path: params.path, flags });
  
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to stop compose stack',
            output: result.stdout,
          };
        }
  
        return {
          success: true,
          output: result.stdout,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  
}
