import { bulkTransferEngine } from '../../sftp/bulk-transfer-engine';
import { safeHandle } from '../safe-ipc';
import { errorResponse } from './helpers';
import {
  clearHistorySchema,
  hostIdSchema,
  noPayloadSchema,
  setParallelSchema,
  transferAddBulkSchema,
  transferAddDirectorySchema,
  transferHistorySchema,
  transferIdSchema,
  transferItemSchema,
} from './schemas';

export function registerSFTPTransferHandlers(): void {
  safeHandle('sftp:transfer:add', transferItemSchema, async (_event, params) => {
    try {
      const transferId = await bulkTransferEngine.addToQueue(params);
      return { success: true, transferId };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:add-bulk', transferAddBulkSchema, async (_event, params) => {
    try {
      const transferIds = await bulkTransferEngine.addBulkToQueue(params.items);
      return { success: true, transferIds };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:add-directory', transferAddDirectorySchema, async (_event, params) => {
    try {
      const transferIds = await bulkTransferEngine.addDirectoryToQueue({
        hostId: params.hostId,
        type: params.type,
        localPath: params.localPath,
        remotePath: params.remotePath,
        sftpConnectionId: params.connectionId,
      });
      return { success: true, transferIds };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:pause', transferIdSchema, async (_event, params) => {
    try {
      await bulkTransferEngine.pauseTransfer(params.transferId);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:resume', transferIdSchema, async (_event, params) => {
    try {
      await bulkTransferEngine.resumeTransfer(params.transferId);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:cancel', transferIdSchema, async (_event, params) => {
    try {
      await bulkTransferEngine.cancelTransfer(params.transferId);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:cancel-all', hostIdSchema, async (_event, params) => {
    try {
      await bulkTransferEngine.cancelAllForHost(params.hostId);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:get-queue', noPayloadSchema, async () => {
    try {
      const queue = await bulkTransferEngine.getQueue();
      return { success: true, queue };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:get-history', transferHistorySchema, async (_event, params) => {
    try {
      const history = await bulkTransferEngine.getHistory(params?.limit);
      return { success: true, history };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:clear-history', clearHistorySchema, async (_event, params) => {
    try {
      await bulkTransferEngine.clearHistory(params?.before);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:set-parallel', setParallelSchema, async (_event, params) => {
    try {
      bulkTransferEngine.setMaxParallelTransfers(params.max);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:transfer:get-stats', noPayloadSchema, async () => {
    try {
      const stats = await bulkTransferEngine.getStats();
      return { success: true, stats };
    } catch (error) {
      return errorResponse(error);
    }
  });
}
