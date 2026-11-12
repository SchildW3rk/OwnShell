/**
 * SFTP File Entry
 * Represents a file or directory on the remote server
 */
export interface SFTPFileEntry {
  /** File or directory name */
  name: string;
  /** Full path on remote server */
  path: string;
  /** Entry type */
  type: 'file' | 'directory' | 'symlink';
  /** File size in bytes */
  size: number;
  /** Unix permissions string (e.g., "rwxr-xr-x") */
  permissions: string;
  /** Numeric Unix permissions (e.g., 755) */
  mode: number;
  /** Owner username */
  owner: string;
  /** Group name */
  group: string;
  /** Last modified timestamp */
  modifiedAt: Date;
  /** UID of owner */
  uid: number;
  /** GID of group */
  gid: number;
}

/**
 * SFTP Transfer Progress
 */
export interface SFTPTransferProgress {
  /** Total bytes to transfer */
  total: number;
  /** Bytes transferred so far */
  transferred: number;
  /** Progress percentage (0-100) */
  percentage: number;
}

/**
 * SFTP Interface
 * Represents an SFTP session for file operations
 */
export interface ISSHSFTP {
  /**
   * List directory contents
   */
  list(path: string): Promise<SFTPFileEntry[]>;

  /**
   * Download a file from remote to local
   */
  downloadFile(
    remotePath: string,
    localPath: string,
    onProgress?: (progress: SFTPTransferProgress) => void
  ): Promise<void>;

  /**
   * Upload a file from local to remote
   */
  uploadFile(
    localPath: string,
    remotePath: string,
    onProgress?: (progress: SFTPTransferProgress) => void
  ): Promise<void>;

  /**
   * Delete a file or empty directory
   */
  deleteFile(path: string): Promise<void>;

  /**
   * Create a directory
   */
  mkdir(path: string): Promise<void>;

  /**
   * Rename or move a file/directory
   */
  rename(oldPath: string, newPath: string): Promise<void>;

  /**
   * Get file/directory stats
   */
  stat(path: string): Promise<SFTPFileEntry>;

  /**
   * Change file permissions (chmod)
   */
  chmod(path: string, mode: number): Promise<void>;

  /**
   * Read file contents into memory
   * @param path Remote file path
   * @param maxSize Maximum file size in bytes (default 10MB)
   */
  readFile(path: string, maxSize?: number): Promise<Buffer>;

  /**
   * Write content to a remote file
   * @param path Remote file path
   * @param content File content as Buffer or string
   * @param options.mode Permission bits to set on the file (e.g. 0o600 for secrets)
   */
  writeFile(path: string, content: Buffer | string, options?: { mode?: number }): Promise<void>;

  /**
   * Close the SFTP session
   */
  close(): Promise<void>;
}

/**
 * SFTP Error Types
 */
export class SFTPError extends Error {
  constructor(
    message: string,
    public code?: number
  ) {
    super(message);
    this.name = 'SFTPError';
  }
}
