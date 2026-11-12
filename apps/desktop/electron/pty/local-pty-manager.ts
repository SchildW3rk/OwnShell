import { BrowserWindow } from 'electron';
import { rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { IDisposable, IPty, spawn } from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger';

const FLUSH_INTERVAL_MS = 16;
const HIGH_WATER_BYTES = 1024 * 1024;
const LOW_WATER_BYTES = 256 * 1024;
const MAX_WRITE_BYTES = 128 * 1024;
const SHUTDOWN_SIGKILL_DELAY_MS = 500;
const SHUTDOWN_TIMEOUT_MS = 1500;
const COMMON_MAC_PATHS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

interface LocalPtySession {
  id: string;
  pty: IPty;
  dataDisposable: IDisposable;
  exitDisposable: IDisposable;
  outputBuffer: string[];
  pendingBytes: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
  isPaused: boolean;
  isClosing: boolean;
  cleanupPaths: string[];
}

export interface CreateLocalPtyParams {
  shell?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  cleanupPaths?: string[];
}

class LocalPtyManager {
  private sessions = new Map<string, LocalPtySession>();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  create(params: CreateLocalPtyParams = {}): { sessionId: string; pid: number } {
    if (process.platform !== 'darwin') {
      throw new Error('Local PTY sessions are currently enabled for macOS only');
    }

    const sessionId = uuidv4();
    const shell = params.shell || process.env.SHELL || '/bin/zsh';
    const args = params.args || [];
    const cwd = params.cwd || os.homedir();
    const cols = this.normalizeDimension(params.cols, 80);
    const rows = this.normalizeDimension(params.rows, 24);

    const pty = spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: this.buildEnvironment(params.env),
    });

    const session: LocalPtySession = {
      id: sessionId,
      pty,
      dataDisposable: { dispose: () => undefined },
      exitDisposable: { dispose: () => undefined },
      outputBuffer: [],
      pendingBytes: 0,
      flushTimer: null,
      isPaused: false,
      isClosing: false,
      cleanupPaths: params.cleanupPaths || [],
    };
    this.sessions.set(sessionId, session);

    session.dataDisposable = pty.onData((data) => {
      if (session.isClosing) return;
      this.enqueueOutput(sessionId, data);
    });

    session.exitDisposable = pty.onExit(({ exitCode, signal }) => {
      if (session.isClosing) return;
      logger.info('Local PTY exited', { sessionId, exitCode, signal });
      this.cleanupSession(sessionId);
      const window = this.getUsableWindow();
      if (window) {
        window.webContents.send('pty:exit', { sessionId, exitCode, signal });
      }
    });

    logger.info('Local PTY created', { sessionId, shell, cwd, pid: pty.pid });
    return { sessionId, pid: pty.pid };
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (Buffer.byteLength(data, 'utf8') > MAX_WRITE_BYTES) {
      logger.warn('Ignoring oversized local PTY input', {
        sessionId,
        bytes: Buffer.byteLength(data, 'utf8'),
      });
      return;
    }
    session.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pty.resize(this.normalizeDimension(cols, 80), this.normalizeDimension(rows, 24));
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.closeSession(session, { killProcess: true, flushOutput: true });
  }

  async killAll(): Promise<void> {
    const sessions = Array.from(this.sessions.values());
    this.mainWindow = null;

    await Promise.all(sessions.map((session) => this.shutdownSession(session)));
  }

  private normalizeDimension(value: number | undefined, fallback: number): number {
    if (!Number.isFinite(value) || value == null) return fallback;
    return Math.max(1, Math.floor(value));
  }

  private buildEnvironment(env?: Record<string, string>): Record<string, string> {
    const merged: Record<string, string> = {
      ...this.stringifyEnvironment(process.env),
      ...(env || {}),
      TERM_PROGRAM: 'OwnShell',
    };

    merged.PATH = this.extendMacPath(merged.PATH);
    return merged;
  }

  private stringifyEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string') {
        result[key] = value;
      }
    }
    return result;
  }

  private extendMacPath(currentPath?: string): string {
    const entries = (currentPath || '').split(path.delimiter).filter(Boolean);
    return Array.from(new Set([...entries, ...COMMON_MAC_PATHS])).join(path.delimiter);
  }

  private enqueueOutput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.outputBuffer.push(data);
    session.pendingBytes += Buffer.byteLength(data, 'utf8');

    if (session.pendingBytes >= HIGH_WATER_BYTES && !session.isPaused) {
      session.pty.pause();
      session.isPaused = true;
      logger.warn('Local PTY output paused due to backpressure', {
        sessionId,
        pendingBytes: session.pendingBytes,
      });
    }

    if (!session.flushTimer) {
      session.flushTimer = setTimeout(() => {
        session.flushTimer = null;
        this.flushOutput(sessionId);
      }, FLUSH_INTERVAL_MS);
    }
  }

  private flushOutput(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.outputBuffer.length === 0) return;

    const data = session.outputBuffer.join('');
    session.outputBuffer = [];
    session.pendingBytes = 0;

    const window = this.getUsableWindow();
    if (window) {
      window.webContents.send('pty:data', { sessionId, data });
    }

    if (!session.isClosing && session.isPaused && session.pendingBytes <= LOW_WATER_BYTES) {
      session.pty.resume();
      session.isPaused = false;
      logger.info('Local PTY output resumed after backpressure', { sessionId });
    }
  }

  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.closeSession(session, { killProcess: false, flushOutput: true });
  }

  private closeSession(
    session: LocalPtySession,
    options: { killProcess: boolean; flushOutput: boolean }
  ): void {
    if (session.isClosing && !this.sessions.has(session.id)) return;
    session.isClosing = true;

    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }

    if (options.flushOutput) {
      this.flushOutput(session.id);
    } else {
      session.outputBuffer = [];
      session.pendingBytes = 0;
    }

    this.disposeListener(session.dataDisposable, 'data', session.id);
    this.disposeListener(session.exitDisposable, 'exit', session.id);
    this.sessions.delete(session.id);

    if (options.killProcess) {
      try {
        session.pty.kill();
      } catch (error) {
        logger.warn('Failed to kill local PTY during cleanup', {
          sessionId: session.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.cleanupSessionPaths(session);
  }

  private async shutdownSession(session: LocalPtySession): Promise<void> {
    if (session.isClosing && !this.sessions.has(session.id)) return;
    session.isClosing = true;

    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }

    session.outputBuffer = [];
    session.pendingBytes = 0;

    this.disposeListener(session.dataDisposable, 'data', session.id);
    this.disposeListener(session.exitDisposable, 'exit', session.id);
    this.sessions.delete(session.id);

    await this.waitForPtyExit(session);
    this.cleanupSessionPaths(session);
  }

  private waitForPtyExit(session: LocalPtySession): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      let sigkillTimer: ReturnType<typeof setTimeout> | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let exitDisposable: IDisposable | null = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (sigkillTimer) clearTimeout(sigkillTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (exitDisposable) this.disposeListener(exitDisposable, 'shutdown-exit', session.id);
        resolve();
      };

      try {
        exitDisposable = session.pty.onExit(() => finish());
      } catch (error) {
        logger.warn('Failed to attach local PTY shutdown listener', {
          sessionId: session.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      this.signalPtyProcess(session, 'SIGHUP');

      sigkillTimer = setTimeout(() => {
        if (!settled) this.signalPtyProcess(session, 'SIGKILL');
      }, SHUTDOWN_SIGKILL_DELAY_MS);

      timeoutTimer = setTimeout(() => {
        logger.warn('Timed out waiting for local PTY shutdown', {
          sessionId: session.id,
          pid: session.pty.pid,
        });
        finish();
      }, SHUTDOWN_TIMEOUT_MS);
    });
  }

  private signalPtyProcess(session: LocalPtySession, signal: NodeJS.Signals): void {
    try {
      process.kill(session.pty.pid, signal);
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code === 'ESRCH') return;
      logger.warn('Failed to signal local PTY during shutdown', {
        sessionId: session.id,
        pid: session.pty.pid,
        signal,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getUsableWindow(): BrowserWindow | null {
    try {
      if (!this.mainWindow) return null;
      if (this.mainWindow.isDestroyed() || this.mainWindow.webContents.isDestroyed()) return null;
      return this.mainWindow;
    } catch {
      return null;
    }
  }

  private disposeListener(disposable: IDisposable, label: string, sessionId: string): void {
    try {
      disposable.dispose();
    } catch (error) {
      logger.warn('Failed to dispose local PTY listener', {
        sessionId,
        listener: label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private cleanupSessionPaths(session: LocalPtySession): void {
    for (const cleanupPath of session.cleanupPaths) {
      try {
        rmSync(cleanupPath, { recursive: true, force: true });
      } catch (error) {
        logger.warn('Failed to remove local PTY cleanup path', {
          sessionId: session.id,
          cleanupPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export const localPtyManager = new LocalPtyManager();
