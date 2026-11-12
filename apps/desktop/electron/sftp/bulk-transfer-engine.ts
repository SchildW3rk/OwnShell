/**
 * Bulk Transfer Engine (v1.16.0)
 *
 * Orchestrates queued SFTP transfers. Persistence, directory collection,
 * transfer execution, and shared event types live in focused modules.
 */

import type { BrowserWindow } from 'electron';
import type { Kysely } from 'kysely';
import type { Database, TransferQueueTable, TransferStatus, TransferType } from '@ownshell/core';
import { sftpConnectionManager } from './sftp-connection-manager';
import { logger } from '../logger';
import { collectLocalFiles, collectRemoteFiles } from './bulk-transfer/collector';
import { executeDownload, executeUpload } from './bulk-transfer/executor';
import {
  clearHistory as clearTransferHistory,
  countPendingTransfers,
  deleteTransfer,
  deleteTransfersByHost,
  getHistory as getTransferHistory,
  getNextPendingTransfer,
  getQueue as getTransferQueue,
  getTransfer,
  getTransfersByHost,
  insertTransfer,
  insertTransfers,
  markTransferActive,
  moveToHistory,
  pauseTransferRecord,
  resetActiveTransfersToPending,
  resumeTransferRecord,
  updateTransferred,
} from './bulk-transfer/queue-store';
import type {
  QueueChangedEvent,
  QueueTransferInput,
  TransferItem,
  TransferProgressEvent,
} from './bulk-transfer/types';

export type {
  QueueChangedEvent,
  QueueTransferInput,
  TransferItem,
  TransferProgressEvent,
} from './bulk-transfer/types';

/**
 * Bulk Transfer Engine Singleton
 */
class BulkTransferEngine {
  private db: Kysely<Database> | null = null;
  private mainWindow: BrowserWindow | null = null;
  private maxParallelTransfers = 3;
  private activeTransfers = new Map<
    string,
    { transfer: TransferQueueTable; controller: AbortController; completion: Promise<void> }
  >();
  private isProcessing = false;
  private hostLabels = new Map<string, string>();

  setup(db: Kysely<Database>, mainWindow: BrowserWindow): void {
    this.db = db;
    this.mainWindow = mainWindow;
    logger.info('Bulk Transfer Engine initialized');
  }

  setMainWindow(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
  }

  setMaxParallelTransfers(max: number): void {
    this.maxParallelTransfers = Math.max(1, Math.min(10, max));
    logger.info('Max parallel transfers set', { max: this.maxParallelTransfers });
  }

  cacheHostLabel(hostId: string, label: string): void {
    this.hostLabels.set(hostId, label);
  }

  async addToQueue(params: QueueTransferInput): Promise<string> {
    const db = this.requireDb();
    const id = await insertTransfer(db, params);

    logger.info('Transfer added to queue', {
      id,
      type: params.type,
      hostId: params.hostId,
    });

    this.emitQueueChanged();
    this.processQueue();

    return id;
  }

  async addBulkToQueue(items: QueueTransferInput[]): Promise<string[]> {
    const db = this.requireDb();
    const ids = await insertTransfers(db, items);

    logger.info('Bulk transfers added to queue', { count: ids.length });

    this.emitQueueChanged();
    this.processQueue();

    return ids;
  }

  async addDirectoryToQueue(params: {
    hostId: string;
    type: TransferType;
    localPath: string;
    remotePath: string;
    sftpConnectionId: string;
  }): Promise<string[]> {
    const items: QueueTransferInput[] = [];

    if (params.type === 'upload') {
      await collectLocalFiles(params.localPath, params.remotePath, params.hostId, items);
    } else {
      const sftp = sftpConnectionManager.getSFTPClient(params.sftpConnectionId);
      if (!sftp) {
        throw new Error('SFTP connection not found');
      }
      await collectRemoteFiles(sftp, params.remotePath, params.localPath, params.hostId, items);
    }

    if (items.length === 0) {
      logger.info('No files found in directory', { path: params.localPath || params.remotePath });
      return [];
    }

    return this.addBulkToQueue(items);
  }

  async pauseTransfer(transferId: string): Promise<void> {
    const db = this.requireDb();
    const active = this.activeTransfers.get(transferId);
    active?.controller.abort();

    await pauseTransferRecord(db, transferId);
    await active?.completion;

    logger.info('Transfer paused', { transferId });
    this.emitQueueChanged();
  }

  async resumeTransfer(transferId: string): Promise<void> {
    const db = this.requireDb();
    await this.activeTransfers.get(transferId)?.completion;
    await resumeTransferRecord(db, transferId);

    logger.info('Transfer resumed', { transferId });
    this.emitQueueChanged();
    this.processQueue();
  }

  async cancelTransfer(transferId: string): Promise<void> {
    const db = this.requireDb();
    const active = this.activeTransfers.get(transferId);
    active?.controller.abort();

    const transfer = await getTransfer(db, transferId);
    if (transfer) {
      await this.moveTransferToHistory(transfer, 'cancelled');
      await deleteTransfer(db, transferId);
    }

    logger.info('Transfer cancelled', { transferId });
    this.emitQueueChanged();
  }

  async cancelAllForHost(hostId: string): Promise<void> {
    const db = this.requireDb();

    for (const [transferId, active] of this.activeTransfers) {
      const transfer = await getTransfer(db, transferId);
      if (transfer?.host_id === hostId) {
        active.controller.abort();
      }
    }

    const transfers = await getTransfersByHost(db, hostId);
    for (const transfer of transfers) {
      await this.moveTransferToHistory(transfer, 'cancelled');
    }

    await deleteTransfersByHost(db, hostId);

    logger.info('All transfers cancelled for host', { hostId, count: transfers.length });
    this.emitQueueChanged();
  }

  async getQueue(): Promise<TransferItem[]> {
    if (!this.db) return [];
    return getTransferQueue(this.db, this.hostLabels);
  }

  async getHistory(limit = 100): Promise<any[]> {
    if (!this.db) return [];
    return getTransferHistory(this.db, limit);
  }

  async clearHistory(before?: number): Promise<void> {
    if (!this.db) return;

    await clearTransferHistory(this.db, before);
    logger.info('Transfer history cleared');
  }

  async resumePendingTransfers(): Promise<void> {
    if (!this.db) return;

    await resetActiveTransfersToPending(this.db);

    const pendingCount = await countPendingTransfers(this.db);
    if (pendingCount > 0) {
      logger.info('Resuming pending transfers', { count: pendingCount });
      this.processQueue();
    }
  }

  async getStats(): Promise<{
    queueSize: number;
    activeCount: number;
    pendingCount: number;
    totalTransferred: number;
    totalSize: number;
  }> {
    if (!this.db) {
      return { queueSize: 0, activeCount: 0, pendingCount: 0, totalTransferred: 0, totalSize: 0 };
    }

    const queue = await this.getQueue();
    return {
      queueSize: queue.length,
      activeCount: queue.filter((transfer) => transfer.status === 'active').length,
      pendingCount: queue.filter((transfer) => transfer.status === 'pending').length,
      totalTransferred: queue.reduce((sum, transfer) => sum + (transfer.transferred || 0), 0),
      totalSize: queue.reduce((sum, transfer) => sum + (transfer.file_size || 0), 0),
    };
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || !this.db) return;

    this.isProcessing = true;

    try {
      while (this.activeTransfers.size < this.maxParallelTransfers) {
        const transfer = await getNextPendingTransfer(this.db, this.activeTransfers.values());
        if (!transfer) break;

        const controller = new AbortController();
        const completion = this.startTransfer(transfer, controller);
        this.activeTransfers.set(transfer.id, { transfer, controller, completion });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async startTransfer(
    transfer: TransferQueueTable,
    abortController: AbortController
  ): Promise<void> {
    if (!this.db) return;

    await markTransferActive(this.db, transfer.id);
    this.emitTransferState(transfer, 'active', 0, 0);

    try {
      const sftp = await sftpConnectionManager.ensureClientForHost(transfer.host_id);
      if (abortController.signal.aborted) return;
      const onProgress = (transferred: number, percentage: number, total: number) => {
        this.updateProgress(transfer.id, transferred, percentage, total);
      };

      if (transfer.type === 'upload') {
        await executeUpload(transfer, sftp, abortController.signal, onProgress);
      } else {
        await executeDownload(transfer, sftp, abortController.signal, onProgress);
      }
      if (abortController.signal.aborted) return;

      await this.completeTransfer(transfer, 'completed');
    } catch (error) {
      if (abortController.signal.aborted) {
        logger.info('Transfer aborted', { transferId: transfer.id });
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.completeTransfer(transfer, 'failed', errorMessage);
      }
    } finally {
      if (this.activeTransfers.get(transfer.id)?.controller === abortController) {
        this.activeTransfers.delete(transfer.id);
      }
      setTimeout(() => this.processQueue(), 100);
    }
  }

  private async updateProgress(
    transferId: string,
    transferred: number,
    percentage: number,
    total: number
  ): Promise<void> {
    if (!this.db) return;

    await updateTransferred(this.db, transferId, transferred, total);

    const transfer = await getTransfer(this.db, transferId);
    if (transfer) {
      this.emitTransferState(transfer, 'active', transferred, percentage);
    }
  }

  private async completeTransfer(
    transfer: TransferQueueTable,
    status: 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    if (!this.db) return;
    const latest = await getTransfer(this.db, transfer.id);
    if (!latest || latest.status !== 'active') return;
    if (status === 'completed') latest.file_size = latest.transferred;

    await this.moveTransferToHistory(latest, status, error);
    await deleteTransfer(this.db, latest.id);

    const percentage = status === 'completed'
      ? 100
      : latest.file_size ? Math.round((latest.transferred / latest.file_size) * 100) : 0;
    this.emitTransferState(
      latest,
      status,
      latest.transferred,
      percentage,
      error
    );

    this.emitQueueChanged();

    logger.info('Transfer completed', {
      transferId: transfer.id,
      status,
      error,
    });
  }

  private async moveTransferToHistory(
    transfer: TransferQueueTable,
    status: 'completed' | 'failed' | 'cancelled',
    error?: string
  ): Promise<void> {
    if (!this.db) return;

    await moveToHistory(
      this.db,
      transfer,
      this.hostLabels.get(transfer.host_id) || 'Unknown Host',
      status,
      error
    );
  }

  private emitTransferState(
    transfer: TransferQueueTable,
    status: TransferStatus,
    transferred: number,
    percentage: number,
    error?: string
  ): void {
    this.emitProgress({
      transferId: transfer.id,
      hostId: transfer.host_id,
      type: transfer.type as TransferType,
      status,
      localPath: transfer.local_path,
      remotePath: transfer.remote_path,
      fileName: transfer.file_name,
      fileSize: transfer.file_size,
      transferred,
      percentage,
      error,
    });
  }

  private emitProgress(event: TransferProgressEvent): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('sftp:transfer:progress', event);
    }
  }

  private async emitQueueChanged(): Promise<void> {
    if (!this.db || !this.mainWindow || this.mainWindow.isDestroyed()) return;

    try {
      const queue = await this.getQueue();
      const event: QueueChangedEvent = {
        totalCount: queue.length,
        pendingCount: queue.filter((transfer) => transfer.status === 'pending').length,
        activeCount: queue.filter((transfer) => transfer.status === 'active').length,
        completedCount: queue.filter((transfer) => transfer.status === 'completed').length,
        failedCount: queue.filter((transfer) => transfer.status === 'failed').length,
      };

      this.mainWindow.webContents.send('sftp:transfer:queue-changed', event);
    } catch (error) {
      logger.error('Failed to emit queue changed event', { error });
    }
  }

  private requireDb(): Kysely<Database> {
    if (!this.db) {
      throw new Error('Transfer engine not initialized');
    }
    return this.db;
  }
}

// Export singleton instance
export const bulkTransferEngine = new BulkTransferEngine();
