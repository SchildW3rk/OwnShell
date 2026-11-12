import type { FileEntry, SFTPWrapper } from 'ssh2';
import type { ISSHSFTP, SFTPFileEntry, SFTPTransferProgress } from '@ownshell/core';
import { SFTPError } from '@ownshell/core';
import { logger } from '../logger';
import * as fs from 'fs';
import * as path from 'path';
import type { Readable, Writable } from 'stream';

/**
 * SSH2 SFTP Implementation
 */
export class SSH2SFTP implements ISSHSFTP {
  private sftpEnded = false;

  constructor(private sftp: SFTPWrapper) {
    const ended = () => { this.sftpEnded = true; };
    sftp.once('end', ended);
    sftp.once('close', ended);
    logger.info('SSH2 SFTP adapter created');
  }

  private rejectAfterStreamClose(
    readStream: Readable,
    writeStream: Writable,
    remote: { stream: Readable | Writable; opened: boolean; failed: boolean },
    error: unknown,
    reject: (error: unknown) => void
  ): void {
    const local = remote.stream === readStream ? writeStream : readStream;
    let localClosed = local.closed;
    let remoteClosed = remote.stream.closed || this.sftpEnded || (remote.failed && !remote.opened);
    let rejected = false;
    const finish = () => {
      if (rejected || !localClosed || !remoteClosed) return;
      rejected = true;
      local.removeListener('close', localDone);
      remote.stream.removeListener('open', remoteOpened);
      remote.stream.removeListener('close', remoteDone);
      remote.stream.removeListener('error', remoteError);
      this.sftp.removeListener('end', remoteDone);
      this.sftp.removeListener('close', remoteDone);
      reject(error);
    };
    const localDone = () => { localClosed = true; finish(); };
    const remoteDone = () => { remoteClosed = true; finish(); };
    const remoteOpened = () => { remote.opened = true; };
    const remoteError = () => {
      // ssh2 suppresses 'close' after an errored destroy. A failed OPEN owns no
      // remote handle; otherwise its destroy callback must have settled first.
      if (remote.stream.closed || !remote.opened) remoteDone();
    };
    if (!localClosed) local.once('close', localDone);
    if (!remoteClosed) {
      remote.stream.once('open', remoteOpened);
      remote.stream.once('close', remoteDone);
      remote.stream.on('error', remoteError);
      // Request cleanup can emit a read error before the channel's terminal
      // event. Never wait for another CLOSE reply on an ended transport.
      this.sftp.once('end', remoteDone);
      this.sftp.once('close', remoteDone);
    }
    readStream.unpipe(writeStream);
    readStream.destroy();
    writeStream.destroy();
    finish();
  }

  async list(dirPath: string): Promise<SFTPFileEntry[]> {
    return new Promise((resolve, reject) => {
      logger.info('Listing directory', { path: dirPath });

      this.sftp.readdir(dirPath, (err, list) => {
        if (err) {
          logger.error('Failed to list directory', { path: dirPath, error: err.message });
          reject(new SFTPError(err.message, (err as any).code));
          return;
        }

        const preparationStartedAt = performance.now();
        const entries: SFTPFileEntry[] = list.map((item: FileEntry) => {
          const fullPath = path.posix.join(dirPath, item.filename);
          const attrs = item.attrs;
          const mode = attrs.mode || 0;

          return {
            name: item.filename,
            path: fullPath,
            type: this.modeToFileType(mode),
            size: attrs.size || 0,
            permissions: this.modeToPermissions(mode),
            mode,
            owner: String(attrs.uid || 0),
            group: String(attrs.gid || 0),
            modifiedAt: new Date((attrs.mtime || 0) * 1000),
            uid: attrs.uid || 0,
            gid: attrs.gid || 0,
          };
        });
        // Keep only the latest local diagnostic entry; no filenames or credentials.
        performance.clearMeasures('sftp:list:prepare');
        performance.measure('sftp:list:prepare', {
          start: preparationStartedAt,
          detail: { entries: entries.length },
        });

        logger.info('Directory listed successfully', { path: dirPath, count: entries.length });
        resolve(entries);
      });
    });
  }

  async downloadFile(
    remotePath: string,
    localPath: string,
    onProgress?: (progress: SFTPTransferProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Downloading file', { remotePath, localPath });

      this.sftp.stat(remotePath, (statErr, stats) => {
        if (statErr) {
          logger.error('Failed to stat remote file', { remotePath, error: statErr.message });
          reject(new SFTPError(statErr.message, (statErr as any).code));
          return;
        }

        const totalSize = stats.size;
        let transferred = 0;
        let settled = false;

        const readStream = this.sftp.createReadStream(remotePath);
        let remoteOpened = false;
        readStream.once('open', () => { remoteOpened = true; });
        const writeStream = fs.createWriteStream(localPath);
        const fail = (error: unknown, remoteFailed = false) => {
          if (settled) return;
          settled = true;
          this.rejectAfterStreamClose(readStream, writeStream, { stream: readStream, opened: remoteOpened, failed: remoteFailed }, error, reject);
        };

        readStream.on('data', (chunk: Buffer) => {
          transferred += chunk.length;
          if (onProgress && totalSize > 0) {
            try {
              onProgress({
                total: totalSize,
                transferred,
                percentage: Math.round((transferred / totalSize) * 100),
              });
            } catch (error) {
              // This listener runs on ssh2's packet parsing stack. A cooperative
              // transfer abort must not escape and corrupt the shared transport.
              fail(error);
            }
          }
        });

        readStream.on('error', (err: Error) => {
          if (settled) return;
          logger.error('Download read error', { remotePath, error: err.message });
          fail(new SFTPError(err.message), true);
        });

        writeStream.on('error', (err: Error) => {
          if (settled) return;
          logger.error('Download write error', { localPath, error: err.message });
          fail(new SFTPError(err.message));
        });

        writeStream.on('finish', () => {
          if (settled) return;
          settled = true;
          logger.info('File downloaded successfully', { remotePath, localPath });
          resolve();
        });

        readStream.pipe(writeStream);
      });
    });
  }

  async uploadFile(
    localPath: string,
    remotePath: string,
    onProgress?: (progress: SFTPTransferProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Uploading file', { localPath, remotePath });

      fs.stat(localPath, (statErr, stats) => {
        if (statErr) {
          logger.error('Failed to stat local file', { localPath, error: statErr.message });
          reject(new SFTPError(statErr.message));
          return;
        }

        const totalSize = stats.size;
        let transferred = 0;
        let resolved = false;

        const readStream = fs.createReadStream(localPath);
        const writeStream = this.sftp.createWriteStream(remotePath);
        let remoteOpened = false;
        writeStream.once('open', () => { remoteOpened = true; });
        const fail = (error: unknown, remoteFailed = false) => {
          if (resolved) return;
          resolved = true;
          this.rejectAfterStreamClose(readStream, writeStream, { stream: writeStream, opened: remoteOpened, failed: remoteFailed }, error, reject);
        };

        const complete = () => {
          if (resolved) return;
          resolved = true;
          logger.info('File uploaded successfully', {
            localPath,
            remotePath,
            transferred,
            totalSize,
          });
          resolve();
        };

        readStream.on('data', (chunk: Buffer | string) => {
          const chunkLength = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
          transferred += chunkLength;
          if (onProgress && totalSize > 0) {
            try {
              onProgress({
                total: totalSize,
                transferred,
                percentage: Math.round((transferred / totalSize) * 100),
              });
            } catch (error) {
              fail(error);
            }
          }
        });

        readStream.on('error', (err) => {
          if (resolved) return;
          logger.error('Upload read error', { localPath, error: err.message });
          fail(new SFTPError(err.message));
        });

        readStream.on('end', () => {
          logger.debug('Upload read stream ended', { localPath, transferred });
        });

        writeStream.on('error', (err: Error) => {
          if (resolved) return;
          logger.error('Upload write error', { remotePath, error: err.message });
          fail(new SFTPError(err.message), true);
        });

        writeStream.on('finish', () => {
          logger.debug('Upload write stream finish event', { remotePath });
          complete();
        });

        writeStream.on('close', () => {
          logger.debug('Upload write stream close event', { remotePath, transferred, totalSize });
          if (transferred >= totalSize) {
            complete();
          }
        });

        readStream.pipe(writeStream);
      });
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Deleting file', { path: filePath });

      this.sftp.stat(filePath, (statErr, stats) => {
        if (statErr) {
          logger.error('Failed to stat file for deletion', {
            path: filePath,
            error: statErr.message,
          });
          reject(new SFTPError(statErr.message, (statErr as any).code));
          return;
        }

        if (stats.isDirectory()) {
          this.sftp.rmdir(filePath, (err) => {
            if (err) {
              logger.error('Failed to delete directory', { path: filePath, error: err.message });
              reject(new SFTPError(err.message, (err as any).code));
            } else {
              logger.info('Directory deleted successfully', { path: filePath });
              resolve();
            }
          });
        } else {
          this.sftp.unlink(filePath, (err) => {
            if (err) {
              logger.error('Failed to delete file', { path: filePath, error: err.message });
              reject(new SFTPError(err.message, (err as any).code));
            } else {
              logger.info('File deleted successfully', { path: filePath });
              resolve();
            }
          });
        }
      });
    });
  }

  async mkdir(dirPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Creating directory', { path: dirPath });

      this.sftp.mkdir(dirPath, (err) => {
        if (err) {
          logger.error('Failed to create directory', { path: dirPath, error: err.message });
          reject(new SFTPError(err.message, (err as any).code));
        } else {
          logger.info('Directory created successfully', { path: dirPath });
          resolve();
        }
      });
    });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Renaming file', { oldPath, newPath });

      this.sftp.rename(oldPath, newPath, (err) => {
        if (err) {
          logger.error('Failed to rename file', { oldPath, newPath, error: err.message });
          reject(new SFTPError(err.message, (err as any).code));
        } else {
          logger.info('File renamed successfully', { oldPath, newPath });
          resolve();
        }
      });
    });
  }

  async stat(filePath: string): Promise<SFTPFileEntry> {
    return new Promise((resolve, reject) => {
      logger.info('Getting file stats', { path: filePath });

      this.sftp.stat(filePath, (err, stats) => {
        if (err) {
          logger.error('Failed to get file stats', { path: filePath, error: err.message });
          reject(new SFTPError(err.message, (err as any).code));
          return;
        }

        let type: 'file' | 'directory' | 'symlink' = 'file';
        if (stats.isDirectory()) {
          type = 'directory';
        } else if (stats.isSymbolicLink()) {
          type = 'symlink';
        }

        const mode = stats.mode || 0;
        const entry: SFTPFileEntry = {
          name: path.posix.basename(filePath),
          path: filePath,
          type,
          size: stats.size || 0,
          permissions: this.modeToPermissions(mode),
          mode,
          owner: String(stats.uid || 0),
          group: String(stats.gid || 0),
          modifiedAt: new Date((stats.mtime || 0) * 1000),
          uid: stats.uid || 0,
          gid: stats.gid || 0,
        };

        logger.info('File stats retrieved', { path: filePath, type });
        resolve(entry);
      });
    });
  }

  async chmod(filePath: string, mode: number): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Changing file permissions', { path: filePath, mode: mode.toString(8) });

      this.sftp.chmod(filePath, mode, (err) => {
        if (err) {
          logger.error('Failed to change permissions', { path: filePath, error: err.message });
          reject(new SFTPError(err.message, (err as any).code));
        } else {
          logger.info('Permissions changed successfully', {
            path: filePath,
            mode: mode.toString(8),
          });
          resolve();
        }
      });
    });
  }

  async readFile(filePath: string, maxSize: number = 10 * 1024 * 1024): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      logger.info('Reading file content', { path: filePath, maxSize });

      this.sftp.stat(filePath, (statErr, stats) => {
        if (statErr) {
          logger.error('Failed to stat file for reading', {
            path: filePath,
            error: statErr.message,
          });
          reject(new SFTPError(statErr.message, (statErr as any).code));
          return;
        }

        if (stats.size > maxSize) {
          const errorMsg = `File too large: ${stats.size} bytes (max: ${maxSize} bytes)`;
          logger.error(errorMsg, { path: filePath });
          reject(new SFTPError(errorMsg));
          return;
        }

        const chunks: Buffer[] = [];
        const readStream = this.sftp.createReadStream(filePath);

        readStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        readStream.on('error', (err: Error) => {
          logger.error('Failed to read file', { path: filePath, error: err.message });
          reject(new SFTPError(err.message));
        });

        readStream.on('end', () => {
          const content = Buffer.concat(chunks);
          logger.info('File read successfully', { path: filePath, size: content.length });
          resolve(content);
        });
      });
    });
  }

  async writeFile(filePath: string, content: Buffer | string, options?: { mode?: number }): Promise<void> {
    const mode = options?.mode;
    if (mode !== undefined) {
      // Tighten an existing file before new content lands. Only "no such file" (SFTP status 2) is
      // fine, the file is then created below with `mode`; any other failure must stop the upload.
      await new Promise<void>((resolve, reject) =>
        this.sftp.chmod(filePath, mode, (err) =>
          !err || (err as { code?: unknown }).code === 2 ? resolve() : reject(err)
        )
      );
    }
    return new Promise((resolve, reject) => {
      const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
      logger.info('Writing file content', { path: filePath, size: buffer.length });

      const writeStream = this.sftp.createWriteStream(filePath, mode === undefined ? undefined : { mode });
      let resolved = false;

      const complete = () => {
        if (resolved) return;
        resolved = true;
        logger.info('File written successfully', { path: filePath, size: buffer.length });
        resolve();
      };

      writeStream.on('error', (err: Error) => {
        if (resolved) return;
        resolved = true;
        logger.error('Failed to write file', { path: filePath, error: err.message });
        reject(new SFTPError(err.message));
      });

      writeStream.on('finish', complete);
      writeStream.on('close', complete);
      writeStream.end(buffer);
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      logger.info('Closing SFTP session');
      this.sftp.end();
      logger.info('SFTP session closed');
      resolve();
    });
  }

  private modeToFileType(mode: number): 'file' | 'directory' | 'symlink' {
    const S_IFDIR = 0o040000;
    const S_IFLNK = 0o120000;
    const S_IFMT = 0o170000;
    const fileType = mode & S_IFMT;

    if (fileType === S_IFDIR) {
      return 'directory';
    }
    if (fileType === S_IFLNK) {
      return 'symlink';
    }
    return 'file';
  }

  private modeToPermissions(mode: number): string {
    const perms = [
      mode & 0o400 ? 'r' : '-',
      mode & 0o200 ? 'w' : '-',
      mode & 0o100 ? 'x' : '-',
      mode & 0o040 ? 'r' : '-',
      mode & 0o020 ? 'w' : '-',
      mode & 0o010 ? 'x' : '-',
      mode & 0o004 ? 'r' : '-',
      mode & 0o002 ? 'w' : '-',
      mode & 0o001 ? 'x' : '-',
    ];
    return perms.join('');
  }
}
