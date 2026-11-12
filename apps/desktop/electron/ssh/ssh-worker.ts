/**
 * SSH Worker Thread (v1.21.0)
 *
 * Isolates SSH2 crypto operations (Key Exchange, AES encryption) in a dedicated
 * Worker Thread to prevent blocking the Main Process Event Loop.
 *
 * Each SSH connection runs in its own Worker for true parallelism.
 *
 * Message Protocol:
 * - Main → Worker: { type: 'connect' | 'send' | 'resize' | 'exec' | 'disconnect', ... }
 * - Worker → Main: { type: 'ready' | 'data' | 'error' | 'close' | 'exec-result', ... }
 */

import { parentPort } from 'worker_threads';
import { Client, ClientChannel } from 'ssh2';
import { toConnectOptions, type ConnectOptionsInput } from './ssh2-compat';
import { hostKeyMismatchMessage } from './host-key';

// Types for message protocol
interface ConnectMessage {
  type: 'connect';
  config: ConnectOptionsInput;
  sessionId: string;
}

interface SendMessage {
  type: 'send';
  data: string | Uint8Array;
}

interface ResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

interface ExecMessage {
  type: 'exec';
  command: string;
  execId: string;
  timeout?: number;
}

interface DisconnectMessage {
  type: 'disconnect';
}

interface HostKeyClaimResultMessage {
  type: 'host-key-claim-result';
  stored: string | null;
}

type WorkerMessage =
  | ConnectMessage
  | SendMessage
  | ResizeMessage
  | ExecMessage
  | DisconnectMessage
  | HostKeyClaimResultMessage;

// The worker has no DB access: first-use host keys are stored by the main process.
let pendingHostKeyClaim: ((stored: string | null) => void) | null = null;

function claimHostKeyViaMain(fingerprint: string): Promise<string | null> {
  return new Promise((resolve) => {
    pendingHostKeyClaim = resolve;
    parentPort?.postMessage({ type: 'host-key-claim', sessionId, fingerprint });
  });
}

// Worker state
let client: Client | null = null;
let shellStream: ClientChannel | null = null;
let sessionId: string = '';

// Adaptive buffering (same as stream-handler.ts)
const BUFFER_SIZE = 8 * 1024; // 8KB
const LOW_LATENCY_FLUSH_MS = 4;
const THROUGHPUT_FLUSH_MS = 16;
const THROUGHPUT_THRESHOLD = 2048; // bytes
const INITIAL_FLUSH_DELAY_MS = 150; // v1.21.0: Longer delay for first flush to avoid race condition
const INPUT_ECHO_WINDOW_MS = 140;
const LOW_LATENCY_OUTPUT_MAX_BYTES = 512;

const outputBuffer: Uint8Array = new Uint8Array(BUFFER_SIZE);
let bufferOffset = 0;
let flushTimer: NodeJS.Timeout | null = null;
let lastDataTime = 0;
let throughputMode = false;
let isFirstFlush = true; // v1.21.0: Track if this is the first flush after connect
let inputEchoUntil = 0;

/**
 * Flush buffered output to Main Process
 */
function postData(data: Uint8Array): void {
  parentPort?.postMessage({
    type: 'data',
    data,
    sessionId,
  });
}

function flushBuffer(): void {
  if (bufferOffset === 0) return;

  // Create a COPY of the buffer slice (important: Uint8Array view gets detached after postMessage)
  const data = new Uint8Array(outputBuffer.slice(0, bufferOffset));

  postData(data);

  // Reset first flush flag after successful flush
  isFirstFlush = false;

  bufferOffset = 0;

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/**
 * Buffer SSH output with adaptive flushing
 */
function bufferOutput(chunk: Buffer): void {
  const now = Date.now();
  const timeSinceLastData = now - lastDataTime;
  lastDataTime = now;

  // Adaptive mode switching
  if (chunk.length > THROUGHPUT_THRESHOLD) {
    throughputMode = true;
  } else if (timeSinceLastData > 100) {
    throughputMode = false;
  }

  // Handle chunks larger than buffer size - send directly without buffering
  if (chunk.length >= BUFFER_SIZE) {
    // Flush any existing buffered data first
    flushBuffer();

    // Send large chunk directly (create a copy to avoid ssh2 buffer reuse issues)
    const copy = new Uint8Array(chunk.length);
    copy.set(chunk);

    postData(copy);
    return;
  }

  if (
    now <= inputEchoUntil &&
    chunk.length <= LOW_LATENCY_OUTPUT_MAX_BYTES &&
    !throughputMode
  ) {
    flushBuffer();
    const copy = new Uint8Array(chunk.length);
    copy.set(chunk);
    postData(copy);
    isFirstFlush = false;
    return;
  }

  // If chunk doesn't fit in remaining buffer space, flush first
  if (bufferOffset + chunk.length > BUFFER_SIZE) {
    flushBuffer();
  }

  // Copy chunk to buffer (safe: chunk.length < BUFFER_SIZE and we have space)
  outputBuffer.set(chunk, bufferOffset);
  bufferOffset += chunk.length;

  // Schedule flush
  if (!flushTimer) {
    // v1.21.0: Use longer delay for first flush to give frontend time to set up listeners
    // This avoids the race condition where shell data arrives before the IPC handler is ready
    let flushDelay: number;
    if (isFirstFlush) {
      flushDelay = INITIAL_FLUSH_DELAY_MS;
    } else {
      flushDelay = throughputMode ? THROUGHPUT_FLUSH_MS : LOW_LATENCY_FLUSH_MS;
    }
    flushTimer = setTimeout(flushBuffer, flushDelay);
  }
}

/**
 * Handle SSH connection
 */
async function handleConnect(msg: ConnectMessage): Promise<void> {
  sessionId = msg.sessionId;

  client = new Client();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, msg.config.readyTimeout || 30000);

    client!.once('ready', async () => {
      clearTimeout(timeout);

      try {
        // Open shell
        shellStream = await new Promise<ClientChannel>((res, rej) => {
          client!.shell({ term: 'xterm-256color' }, (err, stream) => {
            if (err) rej(err);
            else res(stream);
          });
        });

        // Pipe shell output through adaptive buffer
        shellStream.on('data', (data: Buffer) => {
          bufferOutput(data);
        });

        shellStream.stderr?.on('data', (data: Buffer) => {
          bufferOutput(data);
        });

        // Handle shell errors (e.g., from large data transfers)
        shellStream.on('error', (err: Error) => {
          flushBuffer();
          parentPort?.postMessage({
            type: 'error',
            error: err?.message || 'Shell stream error',
            sessionId,
          });
        });

        // Handle shell close with exit code/signal
        shellStream.once('close', (code?: number, signal?: string) => {
          flushBuffer();
          parentPort?.postMessage({
            type: 'close',
            sessionId,
            exitCode: code,
            exitSignal: signal,
          });
        });

        // Handle shell exit (may fire before close)
        shellStream.once('exit', (code?: number, signal?: string) => {
          flushBuffer();
          parentPort?.postMessage({
            type: 'close',
            sessionId,
            exitCode: code,
            exitSignal: signal,
          });
        });

        parentPort?.postMessage({ type: 'ready', sessionId });
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    client!.once('error', (err) => {
      clearTimeout(timeout);
      const message = hostKeyMismatchMessage(msg.config.hostKey, msg.config.host) ?? err.message;
      parentPort?.postMessage({
        type: 'error',
        error: message,
        sessionId,
      });
      reject(new Error(message));
    });

    client!.once('close', () => {
      flushBuffer();
      parentPort?.postMessage({ type: 'close', sessionId });
    });

    // Connect
    msg.config.hostKey.claim = claimHostKeyViaMain;
    client!.connect(toConnectOptions(msg.config, false));
  });
}

/**
 * Send data to shell
 */
function handleSend(msg: SendMessage): void {
  if (!shellStream) return;

  inputEchoUntil = Date.now() + INPUT_ECHO_WINDOW_MS;

  if (msg.data instanceof Uint8Array) {
    shellStream.write(Buffer.from(msg.data));
  } else {
    shellStream.write(msg.data);
  }
}

/**
 * Resize shell PTY
 */
function handleResize(msg: ResizeMessage): void {
  if (!shellStream) return;
  shellStream.setWindow(msg.rows, msg.cols, 0, 0);
}

/**
 * Execute command (non-interactive)
 */
async function handleExec(msg: ExecMessage): Promise<void> {
  if (!client) {
    parentPort?.postMessage({
      type: 'exec-result',
      execId: msg.execId,
      error: 'Not connected',
      sessionId,
    });
    return;
  }

  const timeout = msg.timeout || 30000;
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>(
      (resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Command timeout after ${timeout}ms`));
        }, timeout);

        client!.exec(msg.command, (err, stream) => {
          if (err) {
            clearTimeout(timeoutId!);
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          stream.once('close', (code: number) => {
            clearTimeout(timeoutId!);
            resolve({ stdout, stderr, code });
          });
        });
      }
    );

    parentPort?.postMessage({
      type: 'exec-result',
      execId: msg.execId,
      result,
      sessionId,
    });
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    parentPort?.postMessage({
      type: 'exec-result',
      execId: msg.execId,
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    });
  }
}

/**
 * Disconnect and cleanup
 */
function handleDisconnect(): void {
  flushBuffer();

  if (shellStream) {
    shellStream.end();
    shellStream = null;
  }

  if (client) {
    client.end();
    client = null;
  }
}

/**
 * Main message handler
 */
parentPort?.on('message', async (msg: WorkerMessage) => {
  try {
    switch (msg.type) {
      case 'connect':
        await handleConnect(msg);
        break;
      case 'send':
        handleSend(msg);
        break;
      case 'resize':
        handleResize(msg);
        break;
      case 'exec':
        await handleExec(msg);
        break;
      case 'disconnect':
        handleDisconnect();
        break;
      case 'host-key-claim-result':
        pendingHostKeyClaim?.(msg.stored);
        pendingHostKeyClaim = null;
        break;
    }
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    });
  }
});

// Signal worker is ready
parentPort?.postMessage({ type: 'worker-ready' });
