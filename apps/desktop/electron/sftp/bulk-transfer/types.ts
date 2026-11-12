import type { TransferQueueTable, TransferStatus, TransferType } from '@ownshell/core';

/**
 * Transfer item (in-memory representation with additional runtime data).
 */
export interface TransferItem extends TransferQueueTable {
  hostLabel?: string;
}

export interface QueueTransferInput {
  hostId: string;
  type: TransferType;
  localPath: string;
  remotePath: string;
  fileSize?: number;
  priority?: number;
}

export interface TransferProgressEvent {
  transferId: string;
  hostId: string;
  type: TransferType;
  status: TransferStatus;
  localPath: string;
  remotePath: string;
  fileName: string;
  fileSize: number | null;
  transferred: number;
  percentage: number;
  error?: string;
}

export interface QueueChangedEvent {
  totalCount: number;
  pendingCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}
