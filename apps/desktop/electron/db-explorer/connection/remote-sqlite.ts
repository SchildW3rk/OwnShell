import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { DBConnectionConfig, DBConnectionError } from '@ownshell/core';
import { getSSHAdapter } from '../../ipc/ssh';
import { sshSessionManager } from '../../ssh/session-manager';
import { logger } from '../../logger';
import { resolveSshSession } from './tunnel';

/**
 * Downloads a SQLite file from an SSH host into a private temp dir (0700, file 0600).
 * The copy is opened read-only: there is no write-back, so edits can never silently
 * diverge from or overwrite the file on the server. Remove the dir on disconnect.
 */
export async function downloadRemoteSqlite(
  config: DBConnectionConfig & { filePath?: string; remoteHostId?: string },
  requestedSshSessionId: string | undefined,
  connectionId: string
): Promise<{ localPath: string; tempDir: string }> {
  const remotePath = config.filePath;
  const hostId = config.remoteHostId || config.sshHostId;
  if (!remotePath || !hostId) {
    throw new DBConnectionError('Remote SQLite needs an SSH host and a file path', 'INVALID_CONFIG');
  }

  const { sshSessionId, autoCreatedSshSession } = await resolveSshSession(
    { ...config, sshHostId: hostId },
    requestedSshSessionId,
    connectionId
  );
  const tempDir = await fs.mkdtemp(join(tmpdir(), 'ownshell-sqlite-'));
  const localPath = join(tempDir, 'database.sqlite');

  try {
    const ssh = getSSHAdapter(sshSessionId);
    if (!ssh) {
      throw new DBConnectionError('SSH session not available for SFTP', 'SSH_SESSION_NOT_FOUND');
    }
    const sftp = await ssh.sftp();
    try {
      await sftp.downloadFile(remotePath, localPath);
      // shortcut: the -wal file is fetched after the main file, not atomically; a writer
      // committing in between can make the copy inconsistent. Retry the connect if it fails.
      await sftp
        .downloadFile(`${remotePath}-wal`, `${localPath}-wal`)
        .catch(() => undefined);
    } finally {
      await sftp.close().catch(() => undefined);
    }
    await Promise.all(
      [localPath, `${localPath}-wal`].map((file) => fs.chmod(file, 0o600).catch(() => undefined))
    );

    // Fold a downloaded WAL into the copy so it opens read-only without side files.
    const db = new Database(localPath, { fileMustExist: true });
    try {
      db.pragma('journal_mode = DELETE');
    } finally {
      db.close();
    }

    logger.info('Remote SQLite file downloaded', { connectionId, sshSessionId });
    return { localPath, tempDir };
  } catch (error) {
    await removeRemoteSqliteCopy(tempDir);
    if (error instanceof DBConnectionError) throw error;
    throw new DBConnectionError(
      `Failed to download SQLite file: ${error instanceof Error ? error.message : String(error)}`,
      'REMOTE_SQLITE_DOWNLOAD_FAILED',
      error instanceof Error ? error : undefined
    );
  } finally {
    if (autoCreatedSshSession) {
      sshSessionManager.disconnect(sshSessionId, 'db-sqlite-downloaded');
    }
  }
}

export async function removeRemoteSqliteCopy(tempDir: string): Promise<void> {
  await fs.rm(tempDir, { recursive: true, force: true }).catch((error) => {
    logger.warn('Failed to remove remote SQLite copy', { error });
  });
}
