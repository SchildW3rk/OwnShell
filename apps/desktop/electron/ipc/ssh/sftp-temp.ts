import * as path from 'path';
import * as os from 'os';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { cleanupTempSchema, sshSftpDownloadToTempSchema, sshSftpUploadFromTempSchema } from '../schemas/ssh';
import type { SSHIPCContext } from './context';

export function setupSSHTempFileHandlers(ctx: SSHIPCContext) {
  const { activeSessions, ensureSftpClient } = ctx;
// ============================================
// SFTP TEMP FILE HANDLERS (for SQLite remote files)
// ============================================

/**
 * Download a remote file to a temporary location
 * Used for SQLite remote file access
 */
safeHandle(
  'ssh:sftp:download-to-temp',
  sshSftpDownloadToTempSchema,
  async (_event, params) => {
    try {
      const session = activeSessions.get(params.sessionId);
      if (!session) {
        throw new Error('SSH session not found');
      }

      await ensureSftpClient(session);

      // Create temp directory for SQLite files if it doesn't exist
      const tempDir = path.join(os.tmpdir(), 'ownshell-sqlite');
      const fs = await import('fs/promises');
      await fs.mkdir(tempDir, { recursive: true });

      // Generate unique temp file name
      const timestamp = Date.now();
      const prefix = params.prefix || 'sqlite';
      const fileName = path.basename(params.remotePath);
      const tempFileName = `${prefix}_${timestamp}_${fileName}`;
      const localPath = path.join(tempDir, tempFileName);

      logger.info('Downloading remote file to temp', {
        sessionId: params.sessionId,
        remotePath: params.remotePath,
        localPath,
      });

      // Download file
      await session.sftpClient!.downloadFile(params.remotePath, localPath);

      logger.info('Remote file downloaded to temp', {
        sessionId: params.sessionId,
        remotePath: params.remotePath,
        localPath,
      });

      return {
        success: true,
        localPath,
        remotePath: params.remotePath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to download file to temp', {
        sessionId: params.sessionId,
        remotePath: params.remotePath,
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
 * Upload a temp file back to remote location
 * Used for syncing SQLite changes
 */
safeHandle(
  'ssh:sftp:upload-from-temp',
  sshSftpUploadFromTempSchema,
  async (_event, params) => {
    try {
      const session = activeSessions.get(params.sessionId);
      if (!session) {
        throw new Error('SSH session not found');
      }

      await ensureSftpClient(session);

      logger.info('Uploading temp file to remote', {
        sessionId: params.sessionId,
        localPath: params.localPath,
        remotePath: params.remotePath,
      });

      // Upload file
      await session.sftpClient!.uploadFile(params.localPath, params.remotePath);

      logger.info('Temp file uploaded to remote', {
        sessionId: params.sessionId,
        localPath: params.localPath,
        remotePath: params.remotePath,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to upload temp file to remote', {
        sessionId: params.sessionId,
        localPath: params.localPath,
        remotePath: params.remotePath,
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
 * Clean up temp SQLite files
 */
safeHandle(
  'ssh:sftp:cleanup-temp',
  cleanupTempSchema,
  async (_event, params) => {
    try {
      const fs = await import('fs/promises');
      const tempDir = path.join(os.tmpdir(), 'ownshell-sqlite');
      const resolvedPath = path.resolve(params.localPath);
      const resolvedTempDir = path.resolve(tempDir);
      if (!resolvedPath.startsWith(`${resolvedTempDir}${path.sep}`)) {
        logger.warn('Rejected cleanup outside temp directory', { localPath: params.localPath });
        return { success: true };
      }
      await fs.unlink(params.localPath);
      logger.info('Cleaned up temp file', { localPath: params.localPath });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('Failed to cleanup temp file', {
        localPath: params.localPath,
        errorMessage,
      });
      // Don't return error, cleanup failure is not critical
      return { success: true };
    }
  }
);


}
