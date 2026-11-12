import type { ClientChannel } from 'ssh2';
import type { ISSHShell } from '@ownshell/core';
import { logger } from '../logger';

/**
 * SSH2 Shell Implementation
 */
export class SSH2Shell implements ISSHShell {
  private dataCallbacks: Array<(data: Buffer) => void> = [];
  private closeCallbacks: Array<() => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];
  private exitCode: number | null = null;
  private exitSignal: string | null = null;

  constructor(private stream: ClientChannel) {
    logger.info('🐚 Setting up SSH shell event listeners');

    stream.on('data', (data: Buffer) => {
      this.dataCallbacks.forEach((cb) => cb(data));
    });

    stream.on('close', (hadError?: boolean) => {
      logger.info('🔴 SSH shell "close" event', {
        hadError: !!hadError,
        exitCode: this.exitCode,
        exitSignal: this.exitSignal,
        who: 'client or server initiated close',
      });
      this.closeCallbacks.forEach((cb) => cb());

      this.dataCallbacks = [];
      this.closeCallbacks = [];
      this.errorCallbacks = [];
    });

    stream.on('end', () => {
      logger.info('🔵 SSH shell "end" event (remote end sent EOF)', {
        exitCode: this.exitCode,
        exitSignal: this.exitSignal,
      });
    });

    stream.on('exit', (code: number | null, signal: string | null, dump: boolean, desc: string) => {
      this.exitCode = code;
      this.exitSignal = signal || null;

      logger.info('🚪 SSH shell "exit" event', {
        code,
        signal,
        coreDump: dump,
        description: desc,
        who: 'server sent exit status',
      });
    });

    stream.on('error', (err: Error) => {
      logger.error('❌ SSH shell "error" event', {
        error: err.message,
        stack: err.stack,
      });
      this.errorCallbacks.forEach((cb) => cb(err));
    });

    stream.stderr.on('data', (data: Buffer) => {
      logger.debug('📢 SSH shell stderr data', { length: data.length });
      this.dataCallbacks.forEach((cb) => cb(data));
    });

    logger.info('✅ SSH shell event listeners setup complete');
  }

  onData(callback: (data: Buffer) => void): void {
    this.dataCallbacks.push(callback);
  }

  onClose(callback: () => void): void {
    this.closeCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  getExitCode(): number | null {
    return this.exitCode;
  }

  getExitSignal(): string | null {
    return this.exitSignal;
  }

  write(data: string | Buffer): void {
    this.stream.write(data);
  }

  resize(cols: number, rows: number): void {
    try {
      this.stream.setWindow(rows, cols, 0, 0);
      logger.debug('Terminal resized', { cols, rows });
    } catch (error) {
      logger.warn('Failed to resize terminal (non-critical)', {
        cols,
        rows,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  close(): void {
    this.stream.close();
  }
}
