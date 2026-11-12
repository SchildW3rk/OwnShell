import type { Terminal } from '@xterm/xterm';

export const connectionState = new Map<string, string>();
export const connectionPromises = new Map<string, Promise<string>>();
export const listenerCleanups = new Map<string, () => void>();
export const sshSessionIds = new Map<string, string>();
export const pendingWrites = new Map<string, Uint8Array[]>();
export const rafScheduled = new Map<string, boolean>();
export const activeMounts = new Map<string, symbol>();

const textEncoder = new TextEncoder();
const sshRoutes = new Map<string, Map<string, SSHRouteHandlers>>();
const sshRoutesByTerminal = new Map<string, string>();
const bufferedSSHEvents = new Map<string, BufferedSSHEvent[]>();
const inputEchoUntil = new Map<string, number>();
let sshRouterCleanup: (() => void) | null = null;

const MAX_TERMINAL_HISTORY_CHARS = 256 * 1024;
const terminalHistory = new Map<string, { chunks: string[]; size: number }>();

const MAX_BUFFERED_SSH_EVENTS = 512;
const MAX_BUFFERED_SSH_BYTES = 512 * 1024;
const SSH_BUFFER_TTL_MS = 10_000;
const INPUT_ECHO_WINDOW_MS = 140;
const LOW_LATENCY_INPUT_MAX_BYTES = 64;
const LOW_LATENCY_OUTPUT_MAX_BYTES = 512;

export interface SSHErrorEvent {
  sessionId: string;
  error: string | { message?: string; name?: string };
}

export interface SSHClosedEvent {
  sessionId: string;
  exitCode?: number | null;
  exitSignal?: string | null;
  reason?: string;
}

export interface SSHRouteHandlers {
  onData: (data: string | Uint8Array) => void;
  onError: (event: SSHErrorEvent) => void;
  onClosed: (event: SSHClosedEvent) => void;
}

type BufferedSSHEvent =
  | {
      type: 'data';
      event: { sessionId: string; data: string | Uint8Array };
      receivedAt: number;
      bytes: number;
    }
  | { type: 'error'; event: SSHErrorEvent; receivedAt: number; bytes: number }
  | { type: 'closed'; event: SSHClosedEvent; receivedAt: number; bytes: number };

function mergeBuffers(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0];

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function scheduleWrite(
  termSessionId: string,
  term: Terminal,
  data: string | Uint8Array
): void {
  const chunk = typeof data === 'string' ? textEncoder.encode(data) : data;

  if (shouldWriteImmediately(termSessionId, chunk)) {
    writeImmediately(termSessionId, term, chunk);
    return;
  }

  let pending = pendingWrites.get(termSessionId);
  if (!pending) {
    pending = [];
    pendingWrites.set(termSessionId, pending);
  }
  pending.push(chunk);

  if (!rafScheduled.get(termSessionId)) {
    rafScheduled.set(termSessionId, true);
    requestAnimationFrame(() => {
      rafScheduled.set(termSessionId, false);
      const chunks = pendingWrites.get(termSessionId);
      if (chunks && chunks.length > 0) {
        pendingWrites.set(termSessionId, []);
        term.write(mergeBuffers(chunks));
      }
    });
  }
}

export function markTerminalInput(termSessionId: string, data: string | Uint8Array): void {
  if (getDataByteLength(data) > LOW_LATENCY_INPUT_MAX_BYTES) return;
  inputEchoUntil.set(termSessionId, Date.now() + INPUT_ECHO_WINDOW_MS);
}

export function clearTerminalInputState(termSessionId: string): void {
  inputEchoUntil.delete(termSessionId);
}

export function ensureSSHEventRouter(): void {
  if (sshRouterCleanup) return;

  const unsubscribeData = window.electronAPI.ssh.onData((event) => {
    const handlersByTerminal = sshRoutes.get(event.sessionId);
    if (handlersByTerminal?.size) {
      for (const handlers of handlersByTerminal.values()) {
        handlers.onData(event.data);
      }
      return;
    }
    bufferSSHEvent({
      type: 'data',
      event,
      receivedAt: Date.now(),
      bytes: getDataByteLength(event.data),
    });
  });

  const unsubscribeError = window.electronAPI.ssh.onError((event) => {
    const handlersByTerminal = sshRoutes.get(event.sessionId);
    if (handlersByTerminal?.size) {
      for (const handlers of handlersByTerminal.values()) {
        handlers.onError(event);
      }
      return;
    }
    bufferSSHEvent({ type: 'error', event, receivedAt: Date.now(), bytes: 256 });
  });

  const unsubscribeClosed = window.electronAPI.ssh.onClosed((event) => {
    const handlersByTerminal = sshRoutes.get(event.sessionId);
    if (handlersByTerminal?.size) {
      for (const handlers of [...handlersByTerminal.values()]) {
        handlers.onClosed(event);
      }
      return;
    }
    bufferSSHEvent({ type: 'closed', event, receivedAt: Date.now(), bytes: 128 });
  });

  sshRouterCleanup = () => {
    unsubscribeData();
    unsubscribeError();
    unsubscribeClosed();
    sshRoutes.clear();
    sshRoutesByTerminal.clear();
    bufferedSSHEvents.clear();
  };
}

function shouldWriteImmediately(termSessionId: string, chunk: Uint8Array): boolean {
  const echoUntil = inputEchoUntil.get(termSessionId);
  return Boolean(
    echoUntil && Date.now() <= echoUntil && chunk.byteLength <= LOW_LATENCY_OUTPUT_MAX_BYTES
  );
}

function writeImmediately(termSessionId: string, term: Terminal, chunk: Uint8Array): void {
  const pending = pendingWrites.get(termSessionId);

  if (pending && pending.length > 0) {
    pendingWrites.set(termSessionId, []);
    rafScheduled.set(termSessionId, false);
    term.write(mergeBuffers([...pending, chunk]));
    return;
  }

  term.write(chunk);
}

export function registerSSHRoute(
  termSessionId: string,
  sshSessionId: string,
  handlers: SSHRouteHandlers
): () => void {
  ensureSSHEventRouter();

  const previousSshSessionId = sshRoutesByTerminal.get(termSessionId);
  if (previousSshSessionId && previousSshSessionId !== sshSessionId) {
    const previousHandlers = sshRoutes.get(previousSshSessionId);
    previousHandlers?.delete(termSessionId);
    if (previousHandlers?.size === 0) {
      sshRoutes.delete(previousSshSessionId);
    }
  }

  sshRoutesByTerminal.set(termSessionId, sshSessionId);
  let handlersByTerminal = sshRoutes.get(sshSessionId);
  if (!handlersByTerminal) {
    handlersByTerminal = new Map();
    sshRoutes.set(sshSessionId, handlersByTerminal);
  }
  handlersByTerminal.set(termSessionId, handlers);
  flushBufferedSSHEvents(sshSessionId, handlers);

  return () => {
    if (sshRoutesByTerminal.get(termSessionId) === sshSessionId) {
      sshRoutesByTerminal.delete(termSessionId);
    }
    const activeHandlers = sshRoutes.get(sshSessionId);
    if (activeHandlers?.get(termSessionId) === handlers) {
      activeHandlers.delete(termSessionId);
    }
    if (activeHandlers?.size === 0) {
      sshRoutes.delete(sshSessionId);
    }
  };
}

export function clearBufferedSSHEvents(sshSessionId: string): void {
  bufferedSSHEvents.delete(sshSessionId);
}

function getDataByteLength(data: string | Uint8Array): number {
  return typeof data === 'string' ? data.length : data.byteLength;
}

function bufferSSHEvent(event: BufferedSSHEvent): void {
  pruneBufferedSSHEvents(event.receivedAt);

  let events = bufferedSSHEvents.get(event.event.sessionId);
  if (!events) {
    events = [];
    bufferedSSHEvents.set(event.event.sessionId, events);
  }

  events.push(event);

  let totalBytes = events.reduce((sum, item) => sum + item.bytes, 0);
  while (
    events.length > MAX_BUFFERED_SSH_EVENTS ||
    (totalBytes > MAX_BUFFERED_SSH_BYTES && events.length > 1)
  ) {
    const removed = events.shift();
    totalBytes -= removed?.bytes ?? 0;
  }
}

function flushBufferedSSHEvents(sshSessionId: string, handlers: SSHRouteHandlers): void {
  const events = bufferedSSHEvents.get(sshSessionId);
  if (!events) return;

  bufferedSSHEvents.delete(sshSessionId);

  for (const item of events) {
    if (item.type === 'data') {
      handlers.onData(item.event.data);
    } else if (item.type === 'error') {
      handlers.onError(item.event);
    } else {
      handlers.onClosed(item.event);
    }
  }
}

function pruneBufferedSSHEvents(now: number): void {
  for (const [sshSessionId, events] of bufferedSSHEvents.entries()) {
    const freshEvents = events.filter((event) => now - event.receivedAt <= SSH_BUFFER_TTL_MS);
    if (freshEvents.length === 0) {
      bufferedSSHEvents.delete(sshSessionId);
    } else if (freshEvents.length !== events.length) {
      bufferedSSHEvents.set(sshSessionId, freshEvents);
    }
  }
}

/**
 * Bounded output history for PTY-backed views (local + native SSH). Lets a remounted
 * view (e.g. single pane -> split view) redraw the scrollback the disposed xterm held.
 */
export function appendTerminalHistory(termSessionId: string, data: string): void {
  let history = terminalHistory.get(termSessionId);
  if (!history) {
    history = { chunks: [], size: 0 };
    terminalHistory.set(termSessionId, history);
  }
  history.chunks.push(data);
  history.size += data.length;
  while (history.size > MAX_TERMINAL_HISTORY_CHARS && history.chunks.length > 1) {
    history.size -= history.chunks.shift()?.length ?? 0;
  }
  if (history.size > MAX_TERMINAL_HISTORY_CHARS) {
    history.chunks = [history.chunks[0].slice(-MAX_TERMINAL_HISTORY_CHARS)];
    history.size = MAX_TERMINAL_HISTORY_CHARS;
  }
}

export function getTerminalHistory(termSessionId: string): string {
  return terminalHistory.get(termSessionId)?.chunks.join('') ?? '';
}

export function clearTerminalHistory(termSessionId: string): void {
  terminalHistory.delete(termSessionId);
}
