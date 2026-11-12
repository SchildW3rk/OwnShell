import { logger } from '../../../logger';
import { shellJoin, shellQuotePath } from '../../../utils/shell-quote';
import { safeHandle } from '../../safe-ipc';
import { dockerComposeCommandSchema, dockerComposeCreateSchema, dockerComposeDiscoverSchema, dockerComposeReadSchema, dockerComposeRemoveSchema, dockerComposeUpdateSchema } from '../../schemas/docker';
import { SSHDockerContext } from './context';

export function setupDockerComposeProjectHandlers(ctx: SSHDockerContext) {
  const { activeSessions, execCommand, ensureSftpClient } = ctx;
  /**
   * Discover Docker Compose projects in the configured base path
   */
  safeHandle(
    'ssh:docker:compose-discover',
    dockerComposeDiscoverSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const basePath = params.basePath || '~/docker-compose';
  
        logger.info('Discovering Docker Compose projects', { basePath });
  
        // Find all docker-compose.yml files in subdirectories
        const findCommand = `find ${shellQuotePath(basePath)} -maxdepth 2 \\( -name "docker-compose.yml" -o -name "docker-compose.yaml" \\) 2>/dev/null || true`;
        const result = await execCommand(session, findCommand);
  
        if (result.exitCode !== 0 && result.exitCode !== 1) {
          return {
            success: false,
            error: result.stderr || 'Failed to discover compose projects',
          };
        }
  
        const files = result.stdout
          .trim()
          .split('\n')
          .filter((f) => f);
        const projects = [];
  
        // For each compose file, get project info
        for (const file of files) {
          const projectDir = file.substring(0, file.lastIndexOf('/'));
          const projectName = projectDir.substring(projectDir.lastIndexOf('/') + 1);
  
          // Get project status using docker compose ls
          const statusCommand = `cd ${shellQuotePath(projectDir)} && docker compose ls --format json 2>/dev/null || echo '[]'`;
          const statusResult = await execCommand(session, statusCommand);
  
          let status = 'unknown';
          let containerCount = 0;
  
          try {
            const composeProjects = JSON.parse(statusResult.stdout.trim() || '[]');
            if (composeProjects.length > 0) {
              const project = composeProjects[0];
              status = project.Status || 'unknown';
              // Count running containers
              const psCommand = `cd ${shellQuotePath(projectDir)} && docker compose ps --format json 2>/dev/null || echo '[]'`;
              const psResult = await execCommand(session, psCommand);
              const containers = JSON.parse(psResult.stdout.trim() || '[]');
              containerCount = containers.length;
            }
          } catch (parseError) {
            logger.warn('Failed to parse compose project status', {
              projectName,
              error: parseError,
            });
          }
  
          projects.push({
            name: projectName,
            path: projectDir,
            composePath: file,
            status,
            containerCount,
          });
        }
  
        return { success: true, data: projects };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to discover Docker Compose projects', {
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
   * Create new Docker Compose project
   */
  safeHandle(
    'ssh:docker:compose-create',
    dockerComposeCreateSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const basePath = params.basePath || '~/docker-compose';
        const projectPath = `${basePath}/${params.projectName}`;
  
        logger.info('Creating Docker Compose project', {
          projectName: params.projectName,
          projectPath,
        });
  
        // Create project directory
        const mkdirCommand = `mkdir -p ${shellQuotePath(projectPath)}`;
        const mkdirResult = await execCommand(session, mkdirCommand);
  
        if (mkdirResult.exitCode !== 0) {
          return {
            success: false,
            error: mkdirResult.stderr || 'Failed to create project directory',
          };
        }
  
        // Write docker-compose.yml file using SFTP
        await ensureSftpClient(session);
  
        const composePath = `${projectPath}/docker-compose.yml`;
        await session.sftpClient!.writeFile(composePath, Buffer.from(params.composeContent, 'utf-8'));
  
        logger.info('Docker Compose project created', {
          projectName: params.projectName,
          composePath,
        });
  
        return {
          success: true,
          data: {
            name: params.projectName,
            path: projectPath,
            composePath,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to create Docker Compose project', {
          sessionId: params.sessionId,
          projectName: params.projectName,
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
   * Update existing Docker Compose project
   */
  safeHandle(
    'ssh:docker:compose-update',
    dockerComposeUpdateSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        logger.info('Updating Docker Compose project', {
          composePath: params.composePath,
        });
  
        // Write updated docker-compose.yml file using SFTP
        await ensureSftpClient(session);
  
        await session.sftpClient!.writeFile(
          params.composePath,
          Buffer.from(params.composeContent, 'utf-8')
        );
  
        logger.info('Docker Compose project updated', {
          composePath: params.composePath,
        });
  
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to update Docker Compose project', {
          sessionId: params.sessionId,
          composePath: params.composePath,
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
   * Execute Docker Compose command (up, down, restart, etc.)
   */
  safeHandle(
    'ssh:docker:compose-command',
    dockerComposeCommandSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const args = params.args || [];
        const command = `cd ${shellQuotePath(params.projectPath)} && docker compose ${params.command} ${shellJoin(args)}`;
  
        logger.info('Executing Docker Compose command', {
          projectPath: params.projectPath,
          command: params.command,
          args,
        });
  
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || `Failed to execute compose ${params.command}`,
          };
        }
  
        return {
          success: true,
          data: {
            stdout: result.stdout,
            stderr: result.stderr,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to execute Docker Compose command', {
          sessionId: params.sessionId,
          projectPath: params.projectPath,
          command: params.command,
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
   * Remove Docker Compose project
   */
  safeHandle(
    'ssh:docker:compose-remove',
    dockerComposeRemoveSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        logger.info('Removing Docker Compose project', {
          projectPath: params.projectPath,
          removeVolumes: params.removeVolumes,
        });
  
        // First, bring down the project
        const downArgs = params.removeVolumes ? ['-v'] : [];
        const downCommand = `cd ${shellQuotePath(params.projectPath)} && docker compose down ${downArgs.join(' ')}`;
        const downResult = await execCommand(session, downCommand);
  
        if (downResult.exitCode !== 0) {
          logger.warn('Failed to bring down compose project', {
            stderr: downResult.stderr,
          });
        }
  
        // Remove the project directory
        const rmCommand = `rm -rf ${shellQuotePath(params.projectPath)}`;
        const rmResult = await execCommand(session, rmCommand);
  
        if (rmResult.exitCode !== 0) {
          return {
            success: false,
            error: rmResult.stderr || 'Failed to remove project directory',
          };
        }
  
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to remove Docker Compose project', {
          sessionId: params.sessionId,
          projectPath: params.projectPath,
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
   * Read Docker Compose file content
   */
  safeHandle(
    'ssh:docker:compose-read',
    dockerComposeReadSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        logger.info('Reading Docker Compose file', {
          composePath: params.composePath,
        });
  
        await ensureSftpClient(session);
  
        const content = await session.sftpClient!.readFile(params.composePath);
  
        return {
          success: true,
          data: content.toString('utf-8'),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to read Docker Compose file', {
          sessionId: params.sessionId,
          composePath: params.composePath,
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
