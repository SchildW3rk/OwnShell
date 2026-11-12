import { dialog } from 'electron';
import { isUtf8 } from 'node:buffer';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { sshSftpChmodSchema, sshSftpPathSchema, sshSftpReadFileSchema, sshSftpRemotePathSchema, sshSftpRenameSchema, sshSftpWriteFileSchema } from '../schemas/ssh';
import type { SSHIPCContext } from './context';

export function setupSSHSftpHandlers(ctx: SSHIPCContext) {
  const { activeSessions, ensureSftpClient, mainWindow } = ctx;
  /**
   * SFTP: List directory contents
   */
  safeHandle(
    'ssh:sftp:list',
    sshSftpPathSchema,
    async (_event, params) => {
      try {
        // Debug: Log all active sessions
        const activeSessionIds = Array.from(activeSessions.keys());
        logger.info('SFTP list requested', {
          requestedSessionId: params.sessionId,
          path: params.path,
          activeSessionIds,
          activeSessionCount: activeSessions.size,
        });

        const session = activeSessions.get(params.sessionId);
        if (!session) {
          logger.error('Session not found in activeSessions', {
            requestedSessionId: params.sessionId,
            activeSessionIds,
          });
          throw new Error('SSH session not found');
        }

        // Lazy-initialize SFTP client (routes through background connection for worker sessions)
        await ensureSftpClient(session);

        // List directory
        const files = await session.sftpClient!.list(params.path);

        return { success: true, files };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error('Failed to list SFTP directory', {
          sessionId: params.sessionId,
          path: params.path,
          errorMessage,
          errorStack,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
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
   * SFTP: Download file
   */
  safeHandle(
    'ssh:sftp:download',
    sshSftpRemotePathSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        // Ensure SFTP client (routes through background connection for worker sessions)
        await ensureSftpClient(session);

        // Open save dialog
        const result = await dialog.showSaveDialog({
          title: 'Save File',
          defaultPath: path.join(os.homedir(), 'Downloads', path.basename(params.remotePath)),
        });

        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true };
        }

        const localPath = result.filePath;

        // Download file with progress
        await session.sftpClient!.downloadFile(params.remotePath, localPath, (progress) => {
          // Send progress updates to renderer
          mainWindow.webContents.send('ssh:sftp:progress', {
            sessionId: params.sessionId,
            operation: 'download',
            remotePath: params.remotePath,
            progress,
          });
        });

        return { success: true, localPath };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error('Failed to download file', {
          sessionId: params.sessionId,
          remotePath: params.remotePath,
          errorMessage,
          errorStack,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
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
   * SFTP: Upload file
   */
  safeHandle(
    'ssh:sftp:upload',
    sshSftpRemotePathSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        // Ensure SFTP client (routes through background connection for worker sessions)
        await ensureSftpClient(session);

        // Open file dialog
        const result = await dialog.showOpenDialog({
          title: 'Select File to Upload',
          properties: ['openFile'],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, canceled: true };
        }

        const localPath = result.filePaths[0];
        const fileName = path.basename(localPath);
        const fullRemotePath = path.posix.join(params.remotePath, fileName);

        logger.info('Starting file upload', {
          localPath,
          remotePath: fullRemotePath,
          sessionId: params.sessionId,
        });

        // Upload file with progress
        await session.sftpClient!.uploadFile(localPath, fullRemotePath, (progress) => {
          // Send progress updates to renderer
          mainWindow.webContents.send('ssh:sftp:progress', {
            sessionId: params.sessionId,
            operation: 'upload',
            remotePath: fullRemotePath,
            progress,
          });
        });

        logger.info('File upload completed successfully', {
          localPath,
          remotePath: fullRemotePath,
          sessionId: params.sessionId,
        });

        return { success: true, remotePath: fullRemotePath };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error('Failed to upload file', {
          sessionId: params.sessionId,
          remotePath: params.remotePath,
          errorMessage,
          errorStack,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
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
   * SFTP: Delete file or directory
   */
  safeHandle(
    'ssh:sftp:delete',
    sshSftpPathSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        // Ensure SFTP client (routes through background connection for worker sessions)
        await ensureSftpClient(session);

        await session.sftpClient!.deleteFile(params.path);

        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error('Failed to delete file', {
          sessionId: params.sessionId,
          path: params.path,
          errorMessage,
          errorStack,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
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
   * SFTP: Create directory
   */
  safeHandle(
    'ssh:sftp:mkdir',
    sshSftpPathSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        // Ensure SFTP client (routes through background connection for worker sessions)
        await ensureSftpClient(session);

        await session.sftpClient!.mkdir(params.path);

        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error('Failed to create directory', {
          sessionId: params.sessionId,
          path: params.path,
          errorMessage,
          errorStack,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
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
   * SFTP: Rename file or directory
   */
  safeHandle(
    'ssh:sftp:rename',
    sshSftpRenameSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        // Ensure SFTP client (routes through background connection for worker sessions)
        await ensureSftpClient(session);

        await session.sftpClient!.rename(params.oldPath, params.newPath);

        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error('Failed to rename file', {
          sessionId: params.sessionId,
          oldPath: params.oldPath,
          newPath: params.newPath,
          errorMessage,
          errorStack,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
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
   * SFTP: Change file permissions (chmod)
   */
  safeHandle(
    'ssh:sftp:chmod',
    sshSftpChmodSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        // Ensure SFTP client (routes through background connection for worker sessions)
        await ensureSftpClient(session);

        await session.sftpClient!.chmod(params.path, params.mode);

        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error('Failed to change permissions', {
          sessionId: params.sessionId,
          path: params.path,
          mode: params.mode,
          errorMessage,
          errorStack,
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
   * SFTP: Read file content
   */
  safeHandle(
    'ssh:sftp:read-file',
    sshSftpReadFileSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        // Ensure SFTP client (routes through background connection for worker sessions)
        await ensureSftpClient(session);

        const content = await session.sftpClient!.readFile(params.path, params.maxSize);

        // Keep non-UTF-8 bytes lossless, matching the editor's previous byte-string behavior.
        const encoding = isUtf8(content) ? 'utf-8' : 'latin1';
        return {
          success: true,
          content: content.toString(encoding),
          encoding,
          size: content.length,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error('Failed to read file', {
          sessionId: params.sessionId,
          path: params.path,
          errorMessage,
          errorStack,
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
   * SFTP: Write file content
   */
  safeHandle(
    'ssh:sftp:write-file',
    sshSftpWriteFileSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }

        // Ensure SFTP client (routes through background connection for worker sessions)
        await ensureSftpClient(session);

        // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
        if (params.encoding === 'latin1' && /[^\u0000-\u00ff]/u.test(params.content)) {
          throw new Error('Content contains characters outside the ISO-8859-1 range');
        }
        const buffer = Buffer.from(params.content, params.encoding);

        await session.sftpClient!.writeFile(params.path, buffer);

        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error('Failed to write file', {
          sessionId: params.sessionId,
          path: params.path,
          errorMessage,
          errorStack,
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


}
