/**
 * SSH2 Adapter
 *
 * Implements ISSHClient using the ssh2 library in the Electron main process.
 * Shell, SFTP, command streaming, and compatibility configuration live in
 * focused modules so this class only owns connection lifecycle.
 */

import { Client } from 'ssh2';
import {
  ISSHClient,
  ISSHShell,
  ISSHSFTP,
  SSHConnectionConfig,
  SSHExecResult,
  ShellOptions,
  SFTPError,
  SSHConnectionError,
  SSHTimeoutError,
} from '@ownshell/core';
import { logger } from '../logger';
import type { JumpHostConfig } from './ssh2-connection';
import { connectWithJumpChain as connectViaJumpChain, hostKeyError, mapSSHError } from './ssh2-connection';
import { toConnectOptions } from './ssh2-compat';
import type { HostKeyCheck } from './host-key';
import { execCommand, execFromFile, execToFile } from './ssh2-exec';
import { SSH2Shell } from './ssh2-shell';
import { SSH2SFTP } from './ssh2-sftp';

export type { JumpHostConfig } from './ssh2-connection';

export type HostConnectConfig = SSHConnectionConfig & { hostKey: HostKeyCheck };

/**
 * SSH2 Client Implementation
 *
 * Supports direct SSH connections and multi-hop connections through jump hosts.
 */
export class SSH2Adapter implements ISSHClient {
  private client: Client;
  private jumpClients: Client[] = [];
  private connected = false;
  private errorCallbacks: Array<(error: Error) => void> = [];
  private closeCallbacks: Array<() => void> = [];

  constructor() {
    this.client = new Client();
    logger.info('SSH2 adapter created');
  }

  /**
   * Get the underlying ssh2 Client.
   * Used by TunnelManager for port forwarding.
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Connect through a chain of jump hosts.
   *
   * The chain is ordered from first hop (closest to the client) to last hop
   * (closest to the target). The target connection is opened through the final
   * forwarded stream.
   */
  async connectWithJumpChain(
    config: HostConnectConfig,
    jumpChain: JumpHostConfig[]
  ): Promise<void> {
    if (jumpChain.length === 0) {
      return this.connect(config);
    }

    this.jumpClients = await connectViaJumpChain(this.client, config, jumpChain);
    this.connected = true;
  }

  async connect(config: HostConnectConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Connecting to SSH server', {
        host: config.host,
        port: config.port,
        username: config.username,
      });

      const timeoutMs = config.readyTimeout || 30000;
      const timeout = setTimeout(() => {
        this.client.end();
        const error = new SSHTimeoutError(`Connection timeout after ${timeoutMs}ms`);
        logger.error('SSH connection timeout', error);
        reject(error);
      }, timeoutMs);

      this.client.once('ready', () => {
        clearTimeout(timeout);
        this.connected = true;
        logger.info('SSH connection established');
        resolve();
      });

      this.client.once('error', (err: Error) => {
        clearTimeout(timeout);
        this.connected = false;

        const mappedError = hostKeyError(config) ?? mapSSHError(err, config.host, {
          authentication: 'Authentication failed. Please check your credentials.',
          refused: `Connection refused. Server not reachable at ${config.host}:${config.port}`,
          timeout: `Connection timeout. Server not responding at ${config.host}:${config.port}`,
          notFound: `Host not found: ${config.host}`,
          fallback: err.message,
        });

        logger.error('SSH connection error', mappedError);
        this.errorCallbacks.forEach((callback) => callback(mappedError));
        reject(mappedError);
      });

      this.client.once('close', () => {
        this.connected = false;
        logger.info('SSH connection closed');
        this.closeCallbacks.forEach((callback) => callback());
      });

      try {
        this.client.connect(toConnectOptions(config, false));
      } catch (err) {
        clearTimeout(timeout);
        const error = new SSHConnectionError((err as Error).message);
        logger.error('Failed to initiate SSH connection', error);
        reject(error);
      }
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async exec(command: string): Promise<SSHExecResult> {
    return execCommand(this.client, this.connected, command);
  }

  /**
   * Execute command and stream stdout directly to a local file.
   * Used for database dumps to avoid RAM overflow with large outputs.
   */
  async execToFile(
    command: string,
    localPath: string,
    onProgress?: (bytesWritten: number) => void
  ): Promise<{ exitCode: number; stderr: string }> {
    return execToFile(this.client, this.connected, command, localPath, onProgress);
  }

  /**
   * Execute command and stream a local file to stdin.
   * Used for database imports/restores.
   */
  async execFromFile(
    command: string,
    localPath: string,
    onProgress?: (bytesRead: number) => void
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return execFromFile(this.client, this.connected, command, localPath, onProgress);
  }

  async shell(options?: ShellOptions): Promise<ISSHShell> {
    if (!this.connected) {
      throw new SSHConnectionError('Not connected to SSH server');
    }

    return new Promise((resolve, reject) => {
      const cols = Math.max(options?.cols || 80, 80);
      const rows = Math.max(options?.rows || 24, 24);

      const shellOptions = {
        term: options?.term || 'xterm',
        cols,
        rows,
        env: options?.env,
      };

      logger.info('Opening interactive shell', {
        term: shellOptions.term,
        cols: shellOptions.cols,
        rows: shellOptions.rows,
        hasEnv: !!shellOptions.env,
      });

      this.client.shell(shellOptions, (err, stream) => {
        if (err) {
          logger.error('Failed to open shell', {
            error: err.message,
            stack: err.stack,
          });
          reject(new SSHConnectionError(err.message));
          return;
        }

        logger.info('Interactive shell opened successfully', {
          cols: shellOptions.cols,
          rows: shellOptions.rows,
        });

        resolve(new SSH2Shell(stream));
      });
    });
  }

  async sftp(): Promise<ISSHSFTP> {
    if (!this.connected) {
      throw new SSHConnectionError('Not connected to SSH server');
    }

    return new Promise((resolve, reject) => {
      logger.info('Opening SFTP session');

      this.client.sftp((err, sftp) => {
        if (err) {
          logger.error('Failed to open SFTP session', err);
          reject(new SFTPError(err.message));
          return;
        }

        logger.info('SFTP session opened successfully');
        resolve(new SSH2SFTP(sftp));
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    logger.info('Disconnecting SSH client', {
      jumpHostCount: this.jumpClients.length,
    });

    this.client.end();

    for (let i = this.jumpClients.length - 1; i >= 0; i--) {
      try {
        this.jumpClients[i].end();
        logger.debug(`Jump client ${i + 1} disconnected`);
      } catch (error) {
        logger.warn(`Failed to disconnect jump client ${i + 1}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.jumpClients = [];
    this.connected = false;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  onClose(callback: () => void): void {
    this.closeCallbacks.push(callback);
  }

  /**
   * Cleanup resources.
   */
  destroy(): void {
    const jumpHostsDestroyed = this.jumpClients.length;

    this.client.destroy();

    for (let i = this.jumpClients.length - 1; i >= 0; i--) {
      try {
        this.jumpClients[i].destroy();
      } catch {
        // Ignore cleanup errors.
      }
    }

    this.jumpClients = [];
    this.connected = false;
    this.errorCallbacks = [];
    this.closeCallbacks = [];

    logger.info('SSH2 adapter destroyed', { jumpHostsDestroyed });
  }

}
