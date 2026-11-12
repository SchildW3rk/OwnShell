import { DockerImage } from '@ownshell/core';
import { logger } from '../../../logger';
import { shellQuote } from '../../../utils/shell-quote';
import { safeHandle } from '../../safe-ipc';
import { sshSessionSchema } from '../../schemas/ssh';
import { dockerImageRemoveSchema, dockerPruneImagesSchema } from '../../schemas/docker';
import { parseMemoryValue, SSHDockerContext } from './context';

export function setupDockerImageHandlers(ctx: SSHDockerContext) {
  const { activeSessions, execCommand } = ctx;
  /**
   * List Docker images
   */
  safeHandle(
    'ssh:docker:images',
    sshSessionSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const command = `docker images --format '{{json .}}'`;
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to list images',
          };
        }
  
        const images: DockerImage[] = [];
        const lines = result.stdout.trim().split('\n').filter(Boolean);
  
        for (const line of lines) {
          try {
            const raw = JSON.parse(line);
            images.push({
              id: raw.ID || '',
              repository: raw.Repository || '',
              tag: raw.Tag || '',
              size: parseMemoryValue(raw.Size || '0B'),
              sizeHuman: raw.Size || '0B',
              created: raw.CreatedAt || raw.CreatedSince || '',
              containers: 0, // Would need additional query to get usage
            });
          } catch (parseErr) {
            logger.warn('Failed to parse Docker image JSON', { line });
          }
        }
  
        return { success: true, images };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to list Docker images', {
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
   * Remove Docker image
   */
  safeHandle(
    'ssh:docker:image-remove',
    dockerImageRemoveSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const forceFlag = params.force ? '-f' : '';
        const command = `docker rmi ${forceFlag} ${shellQuote(params.imageId)}`;
  
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to remove image',
          };
        }
  
        logger.info('Docker image removed', {
          sessionId: params.sessionId,
          imageId: params.imageId,
        });
  
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to remove Docker image', {
          sessionId: params.sessionId,
          imageId: params.imageId,
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
   * Prune unused Docker images
   */
  safeHandle(
    'ssh:docker:prune-images',
    dockerPruneImagesSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const allFlag = params.all ? '-a' : '';
        const command = `docker image prune ${allFlag} -f`;
  
        const result = await execCommand(session, command);
  
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: result.stderr || 'Failed to prune images',
          };
        }
  
        // Parse reclaimed space from output
        const spaceMatch = result.stdout.match(/reclaimed\s+(.+)/i);
        const spaceReclaimedHuman = spaceMatch ? spaceMatch[1].trim() : '0B';
        const spaceReclaimed = parseMemoryValue(spaceReclaimedHuman);
  
        logger.info('Docker images pruned', {
          sessionId: params.sessionId,
          spaceReclaimed: spaceReclaimedHuman,
        });
  
        return {
          success: true,
          spaceReclaimed,
          spaceReclaimedHuman,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to prune Docker images', {
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
