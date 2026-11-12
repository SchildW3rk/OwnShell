import { bulkTransferEngine } from '../../sftp/bulk-transfer-engine';
import { sftpConnectionManager, SFTPConnectionConfig } from '../../sftp/sftp-connection-manager';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { errorResponse, getErrorMessage } from './helpers';
import { connectionIdSchema, noPayloadSchema, sftpConnectSchema } from './schemas';

export function registerSFTPConnectionHandlers(): void {
  safeHandle('sftp:connect', sftpConnectSchema, async (_event, params) => {
    try {
      logger.info('SFTP standalone connect requested', {
        hostId: params.hostId,
        hostname: params.hostname,
        port: params.port,
        username: params.username,
      });

      const config: SFTPConnectionConfig = {
        hostId: params.hostId,
        hostname: params.hostname,
        port: params.port,
        username: params.username,
        authType: params.authType,
        passwordEncrypted: params.passwordEncrypted,
        privateKeyEncrypted: params.privateKeyEncrypted,
        passphraseEncrypted: params.passphraseEncrypted,
        jumpHostId: params.jumpHostId,
      };

      const connectionId = await sftpConnectionManager.connect(config);

      if (params.hostLabel) {
        bulkTransferEngine.cacheHostLabel(params.hostId, params.hostLabel);
      }

      return {
        success: true,
        connectionId,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('SFTP standalone connect failed', {
        hostId: params.hostId,
        error: errorMessage,
      });

      return { success: false, error: { message: errorMessage } };
    }
  });

  safeHandle('sftp:disconnect', connectionIdSchema, async (_event, params) => {
    try {
      await sftpConnectionManager.disconnect(params.connectionId);
      return { success: true };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('SFTP disconnect failed', {
        connectionId: params.connectionId,
        error: errorMessage,
      });
      return { success: false, error: { message: errorMessage } };
    }
  });

  safeHandle('sftp:get-connections', noPayloadSchema, async () => {
    try {
      const connections = sftpConnectionManager.getAllConnections().map((connection) => ({
        id: connection.id,
        hostId: connection.hostId,
        hostname: connection.hostname,
        username: connection.username,
        status: connection.status,
        createdAt: connection.createdAt,
        lastActivityAt: connection.lastActivityAt,
        error: connection.error,
      }));

      return { success: true, connections };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:is-connected', connectionIdSchema, async (_event, params) => ({
    success: true,
    connected: sftpConnectionManager.isConnected(params.connectionId),
  }));
}
