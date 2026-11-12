import type { ISSHSFTP } from './sftp';
import type { ISSHShell, ShellOptions } from './shell';

/**
 * SSH Connection Configuration
 */
export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  // Authentication: either password or private key
  password?: string;
  privateKey?: string;
  passphrase?: string;
  // Connection options
  readyTimeout?: number; // Timeout in milliseconds (default: 20000)
  keepaliveInterval?: number; // Send keepalive packets every X ms (default: 10000)
}

/**
 * SSH Exec Result
 */
export interface SSHExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * SSH Connection State
 */
export enum SSHConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * SSH Client Interface (Extended with SFTP)
 * Main interface for SSH operations
 */
export interface ISSHClient {
  /**
   * Connects to the SSH server
   */
  connect(config: SSHConnectionConfig): Promise<void>;

  /**
   * Checks if currently connected
   */
  isConnected(): boolean;

  /**
   * Executes a single command and returns the result
   */
  exec(command: string): Promise<SSHExecResult>;

  /**
   * Opens an interactive shell session
   */
  shell(options?: ShellOptions): Promise<ISSHShell>;

  /**
   * Opens an SFTP session for file operations
   */
  sftp(): Promise<ISSHSFTP>;

  /**
   * Disconnects from the server
   */
  disconnect(): Promise<void>;

  /**
   * Registers a callback for connection errors
   */
  onError(callback: (error: Error) => void): void;

  /**
   * Registers a callback for when the connection closes
   */
  onClose(callback: () => void): void;
}

/**
 * SSH Error Types
 */
export class SSHConnectionError extends Error {
  constructor(
    message: string,
    public code?: string,
    public level?: string
  ) {
    super(message);
    this.name = 'SSHConnectionError';
  }
}

export class SSHAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSHAuthenticationError';
  }
}

export class SSHTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSHTimeoutError';
  }
}
