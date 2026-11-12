import type { GitCodeDirectoryResult, GitCodeFileResult, ProjectQueries } from '@ownshell/core';
import { logger } from '../../logger';
import {
  MAX_GIT_CODE_FILE_BYTES,
  MAX_GIT_TREE_BYTES,
  buildGitFileContentCommand,
  buildGitFileMetadataCommand,
  buildGitTreeCommand,
  parseGitTreeEntries,
} from '../../projects/git-code';
import { safeHandle } from '../safe-ipc';
import { sshGitCodeDirectorySchema, sshGitCodeFileSchema } from '../schemas/ssh';
import type { SSHIPCContext } from './context';

async function projectSession(
  ctx: SSHIPCContext,
  projectQueries: ProjectQueries,
  projectId: string
) {
  const project = await projectQueries.getById(projectId);
  if (!project) throw new Error('Project not found');
  if (!project.host_id) throw new Error('Project has no SSH host');
  const sessionId = await ctx.getOrCreateBackgroundSession(project.host_id);
  const session = ctx.activeSessions.get(sessionId);
  if (!session) throw new Error('SSH session is not available');
  return { project, session };
}

export function setupSSHProjectCodeHandlers(
  ctx: SSHIPCContext,
  projectQueries: ProjectQueries
): void {
  safeHandle(
    'ssh:git:code-directory',
    sshGitCodeDirectorySchema,
    async (_event, request): Promise<GitCodeDirectoryResult> => {
      try {
        const { project, session } = await projectSession(ctx, projectQueries, request.projectId);
        const command = buildGitTreeCommand(project.repository_path, request.path);
        const result = await ctx.execCommand(session, command);
        const error = result.stderr.trim();
        if (result.exitCode !== 0 || error) {
          return { success: false, error: error || 'Could not read Git tree', errorCode: error ? undefined : 'DIRECTORY_READ_FAILED' };
        }
        const byteLength = Buffer.byteLength(result.stdout, 'utf8');
        const parsed = parseGitTreeEntries(result.stdout, request.path);
        return {
          success: true,
          entries: parsed.entries,
          truncated: parsed.skipped || byteLength > MAX_GIT_TREE_BYTES,
        };
      } catch (error) {
        logger.error('Failed to load project Git code directory', error, {
          projectId: request.projectId,
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Could not load Git directory',
          errorCode: error instanceof Error ? undefined : 'DIRECTORY_READ_FAILED',
        };
      }
    }
  );

  safeHandle(
    'ssh:git:code-file',
    sshGitCodeFileSchema,
    async (_event, request): Promise<GitCodeFileResult> => {
      try {
        const { project, session } = await projectSession(ctx, projectQueries, request.projectId);
        const metadata = await ctx.execCommand(
          session,
          buildGitFileMetadataCommand(project.repository_path, request.path)
        );
        const [type, encodedSize] = metadata.stdout.trim().split(/\s+/);
        const byteLength = Number(encodedSize);
        const metadataError = metadata.stderr.trim();
        if (
          metadata.exitCode !== 0 ||
          type !== 'blob' ||
          !Number.isSafeInteger(byteLength) ||
          byteLength < 0
        ) {
          return { success: false, error: metadataError || 'Git object is not a file', errorCode: metadataError ? undefined : 'NOT_A_FILE' };
        }
        if (byteLength > MAX_GIT_CODE_FILE_BYTES) {
          return { success: false, error: 'File exceeds the 512 KiB preview limit', errorCode: 'FILE_TOO_LARGE' };
        }
        const content = await ctx.execCommand(
          session,
          buildGitFileContentCommand(project.repository_path, request.path)
        );
        const contentError = content.stderr.trim();
        if (
          content.exitCode !== 0 ||
          Buffer.byteLength(content.stdout, 'utf8') > MAX_GIT_CODE_FILE_BYTES
        ) {
          return { success: false, error: contentError || 'Could not read Git file', errorCode: contentError ? undefined : 'FILE_READ_FAILED' };
        }
        if (content.stdout.includes('\0') || content.stdout.includes('\uFFFD')) {
          return { success: false, error: 'Binary files cannot be previewed', errorCode: 'BINARY_FILE' };
        }
        return { success: true, path: request.path, content: content.stdout, byteLength };
      } catch (error) {
        logger.error('Failed to load project Git code file', error, {
          projectId: request.projectId,
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Could not load Git file',
          errorCode: error instanceof Error ? undefined : 'FILE_READ_FAILED',
        };
      }
    }
  );
}
