import { isUtf8 } from 'node:buffer';
import { safeHandle } from '../safe-ipc';
import { errorResponse, getErrorMessage, getSFTPClientOrThrow } from './helpers';
import {
  sftpChmodSchema,
  sftpPathOperationSchema,
  sftpReadFileSchema,
  sftpRenameSchema,
  sftpWriteFileSchema,
} from './schemas';
import { logger } from '../../logger';

export function registerSFTPFileOperationHandlers(): void {
  safeHandle('sftp:list', sftpPathOperationSchema, async (_event, params) => {
    try {
      const sftp = getSFTPClientOrThrow(params.connectionId);
      const files = await sftp.list(params.path);
      return { success: true, files };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('SFTP list failed', {
        connectionId: params.connectionId,
        path: params.path,
        error: errorMessage,
      });
      return { success: false, error: { message: errorMessage } };
    }
  });

  safeHandle('sftp:stat', sftpPathOperationSchema, async (_event, params) => {
    try {
      const sftp = getSFTPClientOrThrow(params.connectionId);
      const stats = await sftp.stat(params.path);
      return { success: true, stats };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:mkdir', sftpPathOperationSchema, async (_event, params) => {
    try {
      const sftp = getSFTPClientOrThrow(params.connectionId);
      await sftp.mkdir(params.path);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:delete', sftpPathOperationSchema, async (_event, params) => {
    try {
      const sftp = getSFTPClientOrThrow(params.connectionId);
      await sftp.deleteFile(params.path);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:rename', sftpRenameSchema, async (_event, params) => {
    try {
      const sftp = getSFTPClientOrThrow(params.connectionId);
      await sftp.rename(params.oldPath, params.newPath);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:chmod', sftpChmodSchema, async (_event, params) => {
    try {
      const sftp = getSFTPClientOrThrow(params.connectionId);
      await sftp.chmod(params.path, params.mode);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:read-file', sftpReadFileSchema, async (_event, params) => {
    try {
      const sftp = getSFTPClientOrThrow(params.connectionId);
      const content = await sftp.readFile(params.path, params.maxSize);
      const encoding = isUtf8(content) ? 'utf-8' : 'latin1';
      return {
        success: true,
        content: content.toString(encoding),
        encoding,
        size: content.length,
      };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:write-file', sftpWriteFileSchema, async (_event, params) => {
    try {
      const sftp = getSFTPClientOrThrow(params.connectionId);
      // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
      if (params.encoding === 'latin1' && /[^\u0000-\u00ff]/u.test(params.content)) {
        throw new Error('Content contains characters outside the ISO-8859-1 range');
      }
      const buffer = Buffer.from(params.content, params.encoding);

      await sftp.writeFile(params.path, buffer);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });
}
