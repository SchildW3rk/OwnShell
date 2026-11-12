import type { ISSHSFTP, TransferQueueTable } from '@ownshell/core';
import * as fs from 'fs';
import * as path from 'path';

export async function executeUpload(
  transfer: TransferQueueTable,
  sftp: ISSHSFTP,
  signal: AbortSignal,
  onProgress: (transferred: number, percentage: number, total: number) => void
): Promise<void> {
  const remoteDir = path.posix.dirname(transfer.remote_path);
  try {
    await sftp.mkdir(remoteDir);
  } catch {
    // Directory might already exist.
  }

  await sftp.uploadFile(transfer.local_path, transfer.remote_path, (progress) => {
    if (signal.aborted) {
      throw new Error('Transfer aborted');
    }

    onProgress(progress.transferred, progress.percentage, progress.total);
  });
}

export async function executeDownload(
  transfer: TransferQueueTable,
  sftp: ISSHSFTP,
  signal: AbortSignal,
  onProgress: (transferred: number, percentage: number, total: number) => void
): Promise<void> {
  const localDir = path.dirname(transfer.local_path);
  await fs.promises.mkdir(localDir, { recursive: true });

  await sftp.downloadFile(transfer.remote_path, transfer.local_path, (progress) => {
    if (signal.aborted) {
      throw new Error('Transfer aborted');
    }

    onProgress(progress.transferred, progress.percentage, progress.total);
  });
}
