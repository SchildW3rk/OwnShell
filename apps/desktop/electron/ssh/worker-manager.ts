/**
 * SSH Worker Manager (v1.21.0)
 *
 * Manages the lifecycle of SSH Worker Threads:
 * - Spawns workers for new SSH connections
 * - Routes messages between Main Process and Workers
 * - Handles worker crashes with auto-restart
 * - Provides Promise-based exec() API
 *
 * Worker Path Resolution:
 * - Development: __dirname points to dist-electron/ (same as worker output)
 * - Production: Worker is unpacked from ASAR to app.asar.unpacked/dist-electron/
 */

import { Worker } from 'worker_threads';
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { logger } from '../logger';
import type { ConnectOptionsInput } from './ssh2-compat';

// Message types from worker
interface WorkerDataMessage {
  type: 'data';
  data: Uint8Array;
  sessionId: string;
}

interface WorkerReadyMessage {
  type: 'ready' | 'worker-ready';
  sessionId?: string;
}

interface WorkerHostKeyClaimMessage {
  type: 'host-key-claim';
  sessionId: string;
  fingerprint: string;
}

interface WorkerErrorMessage {
  type: 'error';
  error: string;
  sessionId: string;
}

interface WorkerCloseMessage {
  type: 'close';
  sessionId: string;
  exitCode?: number;
  exitSignal?: string;
}

interface WorkerExecResultMessage {
  type: 'exec-result';
  execId: string;
  result?: { stdout: string; stderr: string; code: number };
  error?: string;
  sessionId: string;
}

type WorkerMessage =
  | WorkerDataMessage
  | WorkerReadyMessage
  | WorkerHostKeyClaimMessage
  | WorkerErrorMessage
  | WorkerCloseMessage
  | WorkerExecResultMessage;

// Connection config for worker
export type WorkerConnectionConfig = ConnectOptionsInput;

// Pending exec callbacks
interface PendingExec {
  resolve: (result: { stdout: string; stderr: string; code: number }) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

// Worker session state
interface WorkerSession {
  worker: Worker;
  sessionId: string;
  hostId: string;
  status: 'connecting' | 'connected' | 'disconnected';
  pendingExecs: Map<string, PendingExec>;
  connectPromise?: {
    resolve: () => void;
    reject: (error: Error) => void;
  };
}

/**
 * Get the correct path to the SSH worker script
 */
function getWorkerPath(): string {
  if (app.isPackaged) {
    // Production: Worker is unpacked from ASAR
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-electron', 'ssh-worker.js');
  }
  // Development: __dirname is dist-electron/ after Vite build
  return path.join(__dirname, 'ssh-worker.js');
}

/**
 * SSH Worker Manager
 * Singleton that manages all SSH worker threads
 */
class SSHWorkerManager {
  private workers = new Map<string, WorkerSession>();
  private mainWindow: BrowserWindow | null = null;
  private execIdCounter = 0;

  /**
   * Initialize with main window reference for IPC
   */
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    logger.info('SSH Worker Manager initialized', {
      workerPath: getWorkerPath(),
      isPackaged: app.isPackaged,
    });
  }

  /**
   * Spawn a new worker for an SSH connection
   */
  async connect(sessionId: string, hostId: string, config: WorkerConnectionConfig): Promise<void> {
    const workerPath = getWorkerPath();

    logger.info('Spawning SSH worker', {
      sessionId,
      hostId,
      host: config.host,
      workerPath,
    });

    const worker = new Worker(workerPath);

    const session: WorkerSession = {
      worker,
      sessionId,
      hostId,
      status: 'connecting',
      pendingExecs: new Map(),
    };

    this.workers.set(sessionId, session);

    // Setup message handler
    worker.on('message', (msg: WorkerMessage) => {
      this.handleWorkerMessage(sessionId, msg);
    });

    // Handle worker errors
    worker.on('error', (error) => {
      logger.error('SSH worker error', {
        sessionId,
        error: error.message,
      });

      // Reject pending connect promise
      if (session.connectPromise) {
        session.connectPromise.reject(error);
        session.connectPromise = undefined;
      }

      // Reject all pending execs
      for (const pending of session.pendingExecs.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(error);
      }
      session.pendingExecs.clear();

      // Notify frontend (must match channel name in preload.ts)
      this.mainWindow?.webContents.send('ssh:session:error', {
        sessionId,
        error: error.message,
      });

      // Cleanup
      this.workers.delete(sessionId);
    });

    // Handle worker exit
    worker.on('exit', (code) => {
      logger.info('SSH worker exited', { sessionId, code });

      const existingSession = this.workers.get(sessionId);
      if (existingSession) {
        existingSession.status = 'disconnected';

        // Reject pending execs
        for (const pending of existingSession.pendingExecs.values()) {
          clearTimeout(pending.timeoutId);
          pending.reject(new Error(`Worker exited with code ${code}`));
        }
        existingSession.pendingExecs.clear();
      }

      this.workers.delete(sessionId);
    });

    // Wait for worker to be ready, then send connect message
    return new Promise((resolve, reject) => {
      session.connectPromise = { resolve, reject };

      // Timeout for connection
      const connectTimeout = setTimeout(() => {
        if (session.connectPromise) {
          session.connectPromise.reject(new Error('Connection timeout'));
          session.connectPromise = undefined;
          this.terminate(sessionId);
        }
      }, config.readyTimeout || 20000);

      // Listen for worker-ready message first
      const onWorkerReady = (msg: WorkerMessage) => {
        if (msg.type === 'worker-ready') {
          // Worker script loaded, now send connect command
          // `claim` is a function (not cloneable); the worker asks for it via 'host-key-claim'.
          const { hostId, expected } = config.hostKey;
          worker.postMessage({
            type: 'connect',
            sessionId,
            config: { ...config, hostKey: { hostId, expected } },
          });
        } else if (msg.type === 'host-key-claim' && msg.sessionId === sessionId) {
          const claim = config.hostKey.claim;
          const respond = (stored: string | null) =>
            worker.postMessage({ type: 'host-key-claim-result', stored });
          if (!claim) respond(null);
          else claim(msg.fingerprint).then(respond, () => respond(null));
        } else if (msg.type === 'ready' && msg.sessionId === sessionId) {
          // SSH connection established
          clearTimeout(connectTimeout);
          session.status = 'connected';
          if (session.connectPromise) {
            session.connectPromise.resolve();
            session.connectPromise = undefined;
          }
        } else if (msg.type === 'error' && msg.sessionId === sessionId) {
          clearTimeout(connectTimeout);
          if (session.connectPromise) {
            session.connectPromise.reject(new Error(msg.error));
            session.connectPromise = undefined;
          }
        }
      };

      worker.on('message', onWorkerReady);
    });
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(sessionId: string, msg: WorkerMessage): void {
    const session = this.workers.get(sessionId);

    switch (msg.type) {
      case 'data':
        // Forward SSH output to frontend
        this.mainWindow?.webContents.send('ssh:session:data', {
          sessionId,
          data: msg.data,
        });
        break;

      case 'error':
        logger.error('SSH worker reported error', {
          sessionId,
          error: msg.error,
        });
        // Wrap error string in object to match preload.ts expected format
        this.mainWindow?.webContents.send('ssh:session:error', {
          sessionId,
          error: {
            message: msg.error || 'Unknown error',
            name: 'SSHError',
          },
        });
        break;

      case 'close':
        logger.info('SSH connection closed by worker', {
          sessionId,
          exitCode: msg.exitCode,
          exitSignal: msg.exitSignal,
        });
        if (session) {
          session.status = 'disconnected';
        }
        this.mainWindow?.webContents.send('ssh:session:closed', {
          sessionId,
          exitCode: msg.exitCode,
          exitSignal: msg.exitSignal,
        });
        break;

      case 'exec-result':
        if (session) {
          const pending = session.pendingExecs.get(msg.execId);
          if (pending) {
            clearTimeout(pending.timeoutId);
            session.pendingExecs.delete(msg.execId);

            if (msg.error) {
              pending.reject(new Error(msg.error));
            } else if (msg.result) {
              pending.resolve(msg.result);
            }
          }
        }
        break;

      // ready/worker-ready handled in connect()
    }
  }

  /**
   * Send data to SSH shell
   */
  send(sessionId: string, data: string | Uint8Array): void {
    const session = this.workers.get(sessionId);
    if (!session || session.status !== 'connected') {
      return;
    }

    session.worker.postMessage({
      type: 'send',
      data,
    });
  }

  /**
   * Resize SSH PTY
   */
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.workers.get(sessionId);
    if (!session || session.status !== 'connected') {
      return;
    }

    session.worker.postMessage({
      type: 'resize',
      cols,
      rows,
    });
  }

  /**
   * Execute command and return result
   */
  async exec(
    sessionId: string,
    command: string,
    timeout: number = 30000
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const session = this.workers.get(sessionId);
    if (!session || session.status !== 'connected') {
      throw new Error('Session not connected');
    }

    const execId = `exec-${++this.execIdCounter}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        session.pendingExecs.delete(execId);
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      session.pendingExecs.set(execId, {
        resolve,
        reject,
        timeoutId,
      });

      session.worker.postMessage({
        type: 'exec',
        command,
        execId,
        timeout,
      });
    });
  }

  /**
   * Check if session is connected
   */
  isConnected(sessionId: string): boolean {
    const session = this.workers.get(sessionId);
    return session?.status === 'connected';
  }

  /**
   * Terminate worker and cleanup
   */
  terminate(sessionId: string): void {
    const session = this.workers.get(sessionId);
    if (!session) return;

    logger.info('Terminating SSH worker', { sessionId });

    // Send disconnect message first (graceful)
    try {
      session.worker.postMessage({ type: 'disconnect' });
    } catch {
      // Worker might already be dead
    }

    // Reject pending execs
    for (const pending of session.pendingExecs.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Session terminated'));
    }
    session.pendingExecs.clear();

    // Force terminate after short delay
    setTimeout(() => {
      try {
        session.worker.terminate();
      } catch {
        // Already terminated
      }
    }, 100);

    session.status = 'disconnected';
    this.workers.delete(sessionId);
  }

  /**
   * Terminate all workers (app shutdown)
   */
  terminateAll(): void {
    logger.info('Terminating all SSH workers', {
      count: this.workers.size,
    });

    for (const sessionId of this.workers.keys()) {
      this.terminate(sessionId);
    }
  }

  /**
   * Get worker session info
   */
  getSession(sessionId: string): WorkerSession | undefined {
    return this.workers.get(sessionId);
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.workers.keys()).filter(
      (id) => this.workers.get(id)?.status === 'connected'
    );
  }
}

// Singleton instance
export const sshWorkerManager = new SSHWorkerManager();
