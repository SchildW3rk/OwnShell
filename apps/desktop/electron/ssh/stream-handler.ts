/**
 * SSH Stream Handler with Adaptive Buffering
 *
 * CRITICAL FOR PERFORMANCE!
 *
 * This handler prevents UI freezing when large amounts of data flow through SSH
 * (e.g., cat /var/log/syslog, tail -f, npm install output).
 *
 * Strategy:
 * - Buffer incoming SSH data in memory
 * - Adaptive flush intervals: 4ms for typing (low latency), 16ms for bulk output (~60fps)
 * - Send data as Uint8Array for efficient IPC transfer (no string conversion overhead)
 * - Deferred replay buffer updates (out of critical path)
 * - Prevents flooding renderer with thousands of tiny IPC messages
 *
 * Without buffering: UI freezes on large outputs
 * With buffering: Smooth performance even with massive logs
 */

import { BrowserWindow } from 'electron';
import { ISSHShell } from '@ownshell/core';
import { logger } from '../logger';
import { sshSessionManager } from './session-manager';

/**
 * Stream Handler Configuration
 */
interface StreamHandlerConfig {
  /**
   * Maximum buffer size before forced flush (in bytes)
   * Default: 8192 (8KB)
   */
  maxBufferSize?: number;

  /**
   * Session ID for this connection (for IPC routing)
   */
  sessionId: string;
}

/**
 * SSH Stream Handler
 *
 * Manages bidirectional data flow between SSH shell and renderer process
 * with intelligent adaptive buffering to prevent UI freezing
 */
export class SSHStreamHandler {
  private buffer: Buffer[] = [];
  private bufferSize = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private isActive = true;
  private lastFlushTime = 0;
  private throughputMode = false;

  // Adaptive flush intervals for optimal latency/throughput balance
  private static readonly LOW_LATENCY_MS = 4; // Typing: flush fast for responsiveness
  private static readonly HIGH_THROUGHPUT_MS = 16; // Bulk: ~60fps for smooth scrolling
  private static readonly THROUGHPUT_THRESHOLD = 512; // Bytes: switch to bulk mode

  // Deferred replay buffer (out of critical path)
  private pendingReplay: Buffer[] = [];
  private replayTimer: NodeJS.Timeout | null = null;
  private static readonly REPLAY_DEFER_MS = 200; // Batch replay updates
  private static readonly INPUT_ECHO_WINDOW_MS = 140;
  private static readonly LOW_LATENCY_OUTPUT_MAX_BYTES = 512;
  private inputEchoUntil = 0;

  private readonly maxBufferSize: number;
  private readonly sessionId: string;

  constructor(
    private window: BrowserWindow,
    private shell: ISSHShell,
    config: StreamHandlerConfig
  ) {
    this.maxBufferSize = config.maxBufferSize || 8192; // 8KB default (increased from 4KB)
    this.sessionId = config.sessionId;

    logger.info('SSH stream handler created (adaptive)', {
      sessionId: this.sessionId,
      maxBufferSize: this.maxBufferSize,
      lowLatencyMs: SSHStreamHandler.LOW_LATENCY_MS,
      highThroughputMs: SSHStreamHandler.HIGH_THROUGHPUT_MS,
    });

    this.setupHandlers();
  }

  /**
   * Setup event handlers for SSH shell
   */
  private setupHandlers(): void {
    // Handle incoming data from SSH server
    this.shell.onData((data: Buffer) => {
      if (!this.isActive) return;

      if (
        Date.now() <= this.inputEchoUntil &&
        data.length <= SSHStreamHandler.LOW_LATENCY_OUTPUT_MAX_BYTES &&
        !this.throughputMode
      ) {
        this.buffer.push(data);
        this.bufferSize += data.length;
        this.flush();
        return;
      }

      // Add to buffer
      this.buffer.push(data);
      this.bufferSize += data.length;

      // Adaptive mode: Large chunks indicate bulk output (cat, logs, etc.)
      if (data.length > SSHStreamHandler.THROUGHPUT_THRESHOLD) {
        this.throughputMode = true;
      }

      // Force flush if buffer exceeds max size
      // This prevents memory buildup on very fast streams
      if (this.bufferSize >= this.maxBufferSize) {
        if (this.flushTimer) {
          clearTimeout(this.flushTimer);
          this.flushTimer = null;
        }
        this.flush();
        return;
      }

      // Start adaptive flush timer if not already running
      if (!this.flushTimer) {
        const delay = this.throughputMode
          ? SSHStreamHandler.HIGH_THROUGHPUT_MS
          : SSHStreamHandler.LOW_LATENCY_MS;

        this.flushTimer = setTimeout(() => {
          this.flush();
        }, delay);
      }
    });

    // Handle shell close
    this.shell.onClose(() => {
      // Get exit information if available
      const exitCode =
        typeof this.shell.getExitCode === 'function' ? this.shell.getExitCode() : null;
      const exitSignal =
        typeof this.shell.getExitSignal === 'function' ? this.shell.getExitSignal() : null;

      logger.info('📭 SSH shell closed, sending to frontend', {
        sessionId: this.sessionId,
        exitCode,
        exitSignal,
      });

      this.flush(); // Flush any remaining data
      this.flushReplayBuffer(); // Flush pending replay data
      this.destroy();

      // Send close event with exit information to frontend
      this.window.webContents.send('ssh:session:closed', {
        sessionId: this.sessionId,
        exitCode,
        exitSignal,
        reason: exitSignal
          ? `Terminated by signal: ${exitSignal}`
          : exitCode !== null && exitCode !== 0
            ? `Exited with code ${exitCode}`
            : 'Normal exit',
      });
    });

    // Handle shell errors
    this.shell.onError((error: Error) => {
      logger.error('SSH shell error', { sessionId: this.sessionId, error });
      this.window.webContents.send('ssh:session:error', {
        sessionId: this.sessionId,
        error: {
          message: error.message,
          name: error.name,
        },
      });
    });
  }

  /**
   * Flush buffered data to renderer process
   *
   * Performance optimizations:
   * - Combines multiple small chunks into one IPC message
   * - Sends as Uint8Array (no string conversion overhead)
   * - Defers replay buffer updates out of critical path
   * - Adaptive mode switching based on data volume
   */
  private flush(): void {
    if (this.buffer.length === 0) return;

    // Combine all buffered chunks into single buffer
    const combined = Buffer.concat(this.buffer, this.bufferSize);

    // Use trace level for high-frequency event (disabled by default)
    logger.trace('Flushing SSH buffer', {
      sessionId: this.sessionId,
      chunks: this.buffer.length,
      bytes: this.bufferSize,
      mode: this.throughputMode ? 'throughput' : 'low-latency',
    });

    // Send to renderer as Uint8Array for efficient IPC transfer
    // IMPORTANT: Create explicit slice to avoid copying entire pooled buffer
    this.window.webContents.send('ssh:session:data', {
      sessionId: this.sessionId,
      data: new Uint8Array(combined.buffer, combined.byteOffset, combined.byteLength),
    });

    // Deferred replay buffer update (out of critical path)
    this.pendingReplay.push(combined);
    if (!this.replayTimer) {
      this.replayTimer = setTimeout(() => {
        this.flushReplayBuffer();
      }, SSHStreamHandler.REPLAY_DEFER_MS);
    }

    // Reset throughput mode after short idle period
    const now = Date.now();
    if (now - this.lastFlushTime > 50) {
      this.throughputMode = false; // Back to low-latency mode
    }
    this.lastFlushTime = now;

    // Clear buffer
    this.buffer = [];
    this.bufferSize = 0;
    this.flushTimer = null;
  }

  /**
   * Flush pending replay buffer data
   * Called on timer or when session closes
   */
  private flushReplayBuffer(): void {
    if (this.pendingReplay.length === 0) return;

    // Combine and convert to string only when needed (deferred)
    const replayData = Buffer.concat(this.pendingReplay).toString('utf-8');
    sshSessionManager.addToReplayBuffer(this.sessionId, replayData);

    this.pendingReplay = [];
    this.replayTimer = null;
  }

  /**
   * Write data to SSH shell (user input from terminal)
   */
  write(data: string): void {
    if (!this.isActive) {
      logger.warn('Attempted to write to inactive stream', {
        sessionId: this.sessionId,
      });
      return;
    }

    try {
      this.inputEchoUntil = Date.now() + SSHStreamHandler.INPUT_ECHO_WINDOW_MS;
      this.shell.write(data);
    } catch (error) {
      logger.error('Failed to write to SSH shell', {
        sessionId: this.sessionId,
        error,
      });
      this.window.webContents.send('ssh:session:error', {
        sessionId: this.sessionId,
        error: {
          message: 'Failed to send data to SSH server',
          name: 'WriteError',
        },
      });
    }
  }

  /**
   * Resize terminal
   *
   * Critical for interactive programs (vim, top, htop, etc.)
   * Sends window change signal to SSH server
   */
  resize(cols: number, rows: number): void {
    if (!this.isActive) {
      logger.warn('Attempted to resize inactive stream', {
        sessionId: this.sessionId,
      });
      return;
    }

    try {
      this.shell.resize(cols, rows);
      logger.debug('Terminal resized', {
        sessionId: this.sessionId,
        cols,
        rows,
      });
    } catch (error) {
      logger.error('Failed to resize terminal', {
        sessionId: this.sessionId,
        error,
      });
    }
  }

  /**
   * Close the SSH shell
   */
  close(): void {
    logger.info('Closing SSH stream handler', { sessionId: this.sessionId });
    this.flush(); // Flush any remaining data
    this.flushReplayBuffer(); // Flush pending replay data
    this.shell.close();
    this.destroy();
  }

  /**
   * Cleanup resources
   */
  private destroy(): void {
    this.isActive = false;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.replayTimer) {
      clearTimeout(this.replayTimer);
      this.replayTimer = null;
    }

    this.buffer = [];
    this.bufferSize = 0;
    this.pendingReplay = [];

    logger.info('SSH stream handler destroyed', { sessionId: this.sessionId });
  }
}
