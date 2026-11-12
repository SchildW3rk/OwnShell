import type { ISSHSFTP } from '@ownshell/core';
import * as fs from 'fs';
import * as path from 'path';
import type { QueueTransferInput } from './types';

export async function collectLocalFiles(
  localDir: string,
  remoteDir: string,
  hostId: string,
  items: QueueTransferInput[]
): Promise<void> {
  // Errors propagate: a folder we cannot read must fail the enqueue, not silently shrink it.
  const entries = await fs.promises.readdir(localDir, { withFileTypes: true });

  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const remotePath = path.posix.join(remoteDir, entry.name);

    if (entry.isDirectory()) {
      await collectLocalFiles(localPath, remotePath, hostId, items);
    } else if (entry.isFile()) {
      const stats = await fs.promises.stat(localPath);
      items.push({
        hostId,
        type: 'upload',
        localPath,
        remotePath,
        fileSize: stats.size,
      });
    }
  }
}

/** Server-supplied names must be a single path segment, or they could escape localDir. */
export function isSafeRemoteName(name: string): boolean {
  return (
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    !/[/\\\0]/.test(name) &&
    path.basename(name) === name
  );
}

export async function collectRemoteFiles(
  sftp: ISSHSFTP,
  remoteDir: string,
  localDir: string,
  hostId: string,
  items: QueueTransferInput[]
): Promise<void> {
  // Errors propagate: a folder we cannot list must fail the enqueue, not silently shrink it.
  const entries = await sftp.list(remoteDir);

  for (const entry of entries) {
    if (entry.name === '.' || entry.name === '..') continue;
    if (!isSafeRemoteName(entry.name)) {
      throw new Error(
        `Refusing unsafe remote file name in ${remoteDir}: ${JSON.stringify(entry.name)}`
      );
    }

    const remotePath = path.posix.join(remoteDir, entry.name);
    const localPath = path.join(localDir, entry.name);

    if (entry.type === 'directory') {
      await collectRemoteFiles(sftp, remotePath, localPath, hostId, items);
    } else if (entry.type === 'file') {
      items.push({
        hostId,
        type: 'download',
        localPath,
        remotePath,
        fileSize: entry.size,
      });
    }
  }
}
