/**
 * Minimal WebSocket client (RFC 6455) for the API client: the opening handshake over
 * any byte stream (direct TCP/TLS or an SSH direct-tcpip channel with TLS on top),
 * masked client frames, text/binary messages with fragmentation reassembly, ping/pong
 * and the close handshake. No extensions (compression) and no subprotocol handling.
 * Message sizes are capped; message contents are never logged.
 */

import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { isIP } from 'node:net';
import * as net from 'node:net';
import type { Duplex } from 'node:stream';
import * as tls from 'node:tls';
import { ApiRequestError, type PreparedRequest } from './prepare-request';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** Largest message (after reassembly) accepted from the server or sent by the user. */
export const MAX_WS_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_HANDSHAKE_BYTES = 64 * 1024;
/** Frames one fragmented message may consist of (empty continuations would otherwise be free). */
export const MAX_WS_FRAGMENTS = 1024;
/** Bytes queued for a server that does not read; beyond this the connection is dropped. */
export const MAX_WS_PENDING_WRITE_BYTES = 8 * 1024 * 1024;

export const Opcode = {
  Continuation: 0x0,
  Text: 0x1,
  Binary: 0x2,
  Close: 0x8,
  Ping: 0x9,
  Pong: 0xa,
} as const;
export type Opcode = (typeof Opcode)[keyof typeof Opcode];
type ControlOpcode = typeof Opcode.Close | typeof Opcode.Ping | typeof Opcode.Pong;

export class WebSocketProtocolError extends Error {
  constructor(
    readonly closeCode: number,
    message: string
  ) {
    super(message);
    this.name = 'WebSocketProtocolError';
  }
}

/** RFC 6455 §7.4: codes a peer may send in a close frame (1012–1014 are registered by IANA). */
export const isValidCloseCode = (code: number) =>
  (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999);

export const acceptKey = (key: string) => createHash('sha1').update(key + GUID).digest('base64');

/** The GET upgrade request; `url` is ws: or wss:. */
export function buildHandshake(url: URL, headers: Record<string, string>, key: string): string {
  const reserved = new Set(['host', 'upgrade', 'connection', 'sec-websocket-key', 'sec-websocket-version', 'content-length']);
  const lines = [
    `GET ${url.pathname || '/'}${url.search} HTTP/1.1`,
    `Host: ${url.host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
  ];
  for (const [name, value] of Object.entries(headers)) {
    if (reserved.has(name.toLowerCase())) continue;
    // No header injection through a value with a line break.
    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) throw new ApiRequestError('INVALID_URL', 'Header contains a line break');
    lines.push(`${name}: ${value}`);
  }
  return `${lines.join('\r\n')}\r\n\r\n`;
}

export interface HandshakeResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/** Parses the response head and checks the RFC 6455 accept rules. */
export function verifyHandshake(head: string, key: string): HandshakeResponse {
  const [statusLine, ...headerLines] = head.split('\r\n');
  const match = /^HTTP\/1\.1 (\d{3})(?: (.*))?$/.exec(statusLine ?? '');
  if (!match) throw new WebSocketProtocolError(1002, 'Invalid handshake response');
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  const response = { status: Number(match[1]), statusText: match[2] ?? '', headers };
  if (response.status !== 101) return response;
  const ok =
    headers['upgrade']?.toLowerCase() === 'websocket' &&
    (headers['connection'] ?? '').toLowerCase().split(',').some((token) => token.trim() === 'upgrade') &&
    headers['sec-websocket-accept'] === acceptKey(key) &&
    // Nothing was offered, so the server must not pick an extension.
    !headers['sec-websocket-extensions'];
  if (!ok) throw new WebSocketProtocolError(1002, 'The server did not accept the WebSocket upgrade correctly');
  return response;
}

/** One client frame; client → server frames are always masked. */
export function encodeFrame(opcode: Opcode, payload: Buffer, mask: Buffer = randomBytes(4)): Buffer {
  const length = payload.length;
  const headerLength = length < 126 ? 2 : length < 65536 ? 4 : 10;
  const frame = Buffer.alloc(headerLength + 4 + length);
  frame[0] = 0x80 | opcode;
  if (length < 126) frame[1] = 0x80 | length;
  else if (length < 65536) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(length, 2);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(length), 2);
  }
  mask.copy(frame, headerLength);
  for (let index = 0; index < length; index++) frame[headerLength + 4 + index] = payload[index] ^ mask[index & 3];
  return frame;
}

export interface DecodedMessage {
  binary: boolean;
  data: Buffer;
}

/**
 * Server → client frame decoder. Reassembles fragmented messages, hands control
 * frames over separately and throws WebSocketProtocolError (with the close code to
 * send) on anything RFC 6455 forbids or that exceeds `maxMessageBytes`.
 */
export function createFrameDecoder(handlers: {
  message(message: DecodedMessage): void;
  control(opcode: ControlOpcode, payload: Buffer): void;
  maxMessageBytes?: number;
}) {
  const max = handlers.maxMessageBytes ?? MAX_WS_MESSAGE_BYTES;
  let buffer = Buffer.alloc(0);
  let fragments: Buffer[] | null = null;
  let fragmentsBinary = false;
  let fragmentsSize = 0;
  let fragmentCount = 0;
  const textDecoder = new TextDecoder('utf-8', { fatal: true });

  const deliver = (binary: boolean, data: Buffer) => {
    if (!binary) {
      try {
        textDecoder.decode(data);
      } catch {
        throw new WebSocketProtocolError(1007, 'Text message is not valid UTF-8');
      }
    }
    handlers.message({ binary, data });
  };

  return {
    feed(chunk: Buffer) {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      for (;;) {
        if (buffer.length < 2) return;
        const fin = (buffer[0] & 0x80) !== 0;
        if (buffer[0] & 0x70) throw new WebSocketProtocolError(1002, 'Reserved bits set');
        const opcode = buffer[0] & 0x0f;
        if (buffer[1] & 0x80) throw new WebSocketProtocolError(1002, 'Server frames must not be masked');
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffer.length < 10) return;
          const big = buffer.readBigUInt64BE(2);
          if (big > BigInt(max)) throw new WebSocketProtocolError(1009, 'Message too large');
          length = Number(big);
          offset = 10;
        }
        const control = opcode >= 0x8;
        if (control && (length > 125 || !fin)) throw new WebSocketProtocolError(1002, 'Invalid control frame');
        // Checked before buffering the payload, so an announced huge frame is refused early.
        if (length > max || (!control && fragmentsSize + length > max)) {
          throw new WebSocketProtocolError(1009, 'Message too large');
        }
        if (buffer.length < offset + length) return;
        const payload = buffer.subarray(offset, offset + length);
        buffer = buffer.subarray(offset + length);

        if (control) {
          if (opcode !== Opcode.Close && opcode !== Opcode.Ping && opcode !== Opcode.Pong) {
            throw new WebSocketProtocolError(1002, 'Unknown opcode');
          }
          if (opcode === Opcode.Close && length > 0) {
            if (length === 1 || !isValidCloseCode(payload.readUInt16BE(0))) {
              throw new WebSocketProtocolError(1002, 'Invalid close frame');
            }
            try {
              textDecoder.decode(payload.subarray(2));
            } catch {
              throw new WebSocketProtocolError(1007, 'Close reason is not valid UTF-8');
            }
          }
          handlers.control(opcode as ControlOpcode, Buffer.from(payload));
          continue;
        }
        if (opcode === Opcode.Continuation) {
          if (!fragments) throw new WebSocketProtocolError(1002, 'Unexpected continuation frame');
          if (++fragmentCount > MAX_WS_FRAGMENTS) throw new WebSocketProtocolError(1009, 'Message has too many fragments');
          if (length) fragments.push(Buffer.from(payload));
          fragmentsSize += length;
          if (fin) {
            const data = Buffer.concat(fragments, fragmentsSize);
            fragments = null;
            fragmentsSize = 0;
            deliver(fragmentsBinary, data);
          }
          continue;
        }
        if (opcode !== Opcode.Text && opcode !== Opcode.Binary) throw new WebSocketProtocolError(1002, 'Unknown opcode');
        if (fragments) throw new WebSocketProtocolError(1002, 'New message before the previous one ended');
        if (fin) deliver(opcode === Opcode.Binary, Buffer.from(payload));
        else {
          fragments = [Buffer.from(payload)];
          fragmentsBinary = opcode === Opcode.Binary;
          fragmentsSize = length;
          fragmentCount = 1;
        }
      }
    },
  };
}

export interface WebSocketConnection extends EventEmitter {
  on(event: 'message', listener: (message: DecodedMessage) => void): this;
  on(event: 'close', listener: (code: number, reason: string) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  send(text: string): void;
  close(code?: number, reason?: string): void;
}

/** Wraps an upgraded socket: answers pings, runs the close handshake, emits messages. */
export function wrapConnection(socket: Duplex, leftover: Buffer, maxMessageBytes = MAX_WS_MESSAGE_BYTES): WebSocketConnection {
  const emitter = new EventEmitter() as WebSocketConnection;
  let closeSent = false;
  let closed = false;
  const finish = (code: number, reason: string, graceful = false) => {
    if (closed) return;
    closed = true;
    if (graceful) {
      // Let the queued close frame go out; the server ends TCP (or we do after 2 s).
      socket.end();
      setTimeout(() => socket.destroy(), 2000).unref?.();
    } else {
      socket.destroy();
    }
    emitter.emit('close', code, reason);
  };
  /** Queues a frame; a server that stops reading must not grow the queue without bound. */
  const write = (frame: Buffer) => {
    if (closed || socket.destroyed) return false;
    if (socket.writableLength + frame.length > MAX_WS_PENDING_WRITE_BYTES) {
      emitter.emit('error', Object.assign(new Error('The server is not reading; the WebSocket connection was closed'), { code: 'WS_BACKPRESSURE' }));
      finish(1006, '');
      return false;
    }
    socket.write(frame);
    return true;
  };
  const sendClose = (code: number, reason = '') => {
    if (closeSent || socket.destroyed) return;
    closeSent = true;
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
    payload.writeUInt16BE(code, 0);
    payload.write(reason, 2);
    write(encodeFrame(Opcode.Close, payload.subarray(0, 125)));
  };
  // While the socket is backed up only the latest ping gets an answer, once it drains.
  let pendingPong: Buffer | null = null;
  const sendPong = (payload: Buffer) => {
    if (closeSent) return;
    if (!socket.writableNeedDrain) {
      write(encodeFrame(Opcode.Pong, payload));
      return;
    }
    if (!pendingPong) {
      socket.once('drain', () => {
        const latest = pendingPong;
        pendingPong = null;
        if (latest) sendPong(latest);
      });
    }
    pendingPong = payload;
  };

  const decoder = createFrameDecoder({
    maxMessageBytes,
    message: (message) => emitter.emit('message', message),
    control: (opcode, payload) => {
      if (opcode === Opcode.Ping) {
        sendPong(payload);
      } else if (opcode === Opcode.Close) {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        // Code and UTF-8 of the reason were validated by the decoder.
        const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : '';
        // Echo the close (if we did not start it), then the server closes TCP.
        sendClose(code === 1005 ? 1000 : code);
        finish(code, reason, true);
      }
    },
  });

  const onData = (chunk: Buffer) => {
    try {
      decoder.feed(chunk);
    } catch (error) {
      const protocolError = error instanceof WebSocketProtocolError ? error : new WebSocketProtocolError(1002, String(error));
      sendClose(protocolError.closeCode);
      emitter.emit('error', protocolError);
      // Graceful: a close frame still queued behind a slow socket must reach the server.
      finish(protocolError.closeCode, protocolError.message, true);
    }
  };
  socket.on('data', onData);
  socket.on('error', (error) => {
    emitter.emit('error', error);
    finish(1006, '');
  });
  socket.on('close', () => finish(1006, ''));

  emitter.send = (text: string) => {
    if (closed || closeSent) throw new Error('WebSocket is not open');
    const payload = Buffer.from(text, 'utf8');
    if (payload.length > maxMessageBytes) throw new WebSocketProtocolError(1009, 'Message too large');
    if (!write(encodeFrame(Opcode.Text, payload))) throw new Error('WebSocket is not open');
  };
  emitter.close = (code = 1000, reason = '') => {
    if (closed) return;
    sendClose(code, reason);
    // A server that never answers the close still ends the connection.
    setTimeout(() => finish(code, reason), 2000).unref?.();
  };
  // The socket was paused after the handshake: first the frames that came with the
  // response, then the rest, once the caller has attached its listeners.
  setImmediate(() => {
    if (leftover.length) onData(leftover);
    socket.resume();
  });
  return emitter;
}

export interface ConnectDeps {
  openHostStream: (hostId: string, host: string, port: number) => Promise<Duplex>;
  /** Up to the end of the handshake; an open connection has no timeout. */
  timeoutMs: number;
  verifyTls?: boolean;
  signal?: AbortSignal;
  /** Workspace cookie jar header for the http(s) form of the URL. */
  cookieHeader?: string;
  /** Tests: direct TCP connect. */
  connectDirect?: (host: string, port: number) => Duplex;
}

/**
 * Opens a WebSocket for a prepared request (ws:/wss: URL, headers incl. auth).
 * With a host id the connection only ever goes through that SSH host.
 */
export async function connectWebSocket(
  prepared: PreparedRequest,
  networkHostId: string | null,
  deps: ConnectDeps
): Promise<{ connection: WebSocketConnection; response: HandshakeResponse }> {
  const url = prepared.url;
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new ApiRequestError('INVALID_URL', 'WebSocket URLs start with ws:// or wss://');
  }
  const secure = url.protocol === 'wss:';
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const port = Number(url.port) || (secure ? 443 : 80);
  const key = randomBytes(16).toString('base64');
  const headers = { ...prepared.headers };
  if (deps.cookieHeader) {
    const userKey = Object.keys(headers).find((name) => name.toLowerCase() === 'cookie');
    if (userKey) headers[userKey] = `${headers[userKey]}; ${deps.cookieHeader}`;
    else headers['Cookie'] = deps.cookieHeader;
  }
  const request = buildHandshake(url, headers, key);

  const opened: Duplex[] = [];
  // After a timeout or cancel, a host channel that opens late is closed right away.
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort = () => {};
  const stopped = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ApiRequestError('TIMEOUT', `WebSocket handshake timed out after ${deps.timeoutMs / 1000} s`)),
      deps.timeoutMs
    );
    const abort = () => reject(new ApiRequestError('CANCELLED', 'Connection cancelled'));
    if (deps.signal?.aborted) abort();
    deps.signal?.addEventListener('abort', abort, { once: true });
    removeAbort = () => deps.signal?.removeEventListener('abort', abort);
  });
  stopped.catch(() => undefined);
  const race = <T>(promise: Promise<T>) => {
    promise.catch(() => undefined);
    return Promise.race([promise, stopped]);
  };

  try {
    let raw: Duplex;
    if (networkHostId) {
      try {
        raw = await race(
          deps.openHostStream(networkHostId, hostname, port).then((channel) => {
            if (settled) channel.destroy();
            else opened.push(channel);
            return channel;
          })
        );
      } catch (error) {
        if (error instanceof ApiRequestError) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        throw new ApiRequestError(
          'NETWORK_HOST_UNAVAILABLE',
          `Could not reach ${url.host} through the selected SSH host: ${reason}`,
          reason
        );
      }
    } else {
      raw = deps.connectDirect ? deps.connectDirect(hostname, port) : net.connect({ host: hostname, port });
      opened.push(raw);
    }
    const socket: Duplex = secure
      ? tls.connect({
          socket: raw,
          host: hostname,
          servername: isIP(hostname) ? undefined : hostname,
          rejectUnauthorized: deps.verifyTls !== false,
          ALPNProtocols: ['http/1.1'],
        })
      : raw;
    if (socket !== raw) opened.push(socket);

    const { response, leftover } = await race(
      new Promise<{ response: HandshakeResponse; leftover: Buffer }>((resolve, reject) => {
        let head = Buffer.alloc(0);
        const onData = (chunk: Buffer) => {
          head = Buffer.concat([head, chunk]);
          const end = head.indexOf('\r\n\r\n');
          if (end < 0) {
            if (head.length > MAX_HANDSHAKE_BYTES) fail(new WebSocketProtocolError(1002, 'Handshake response too large'));
            return;
          }
          cleanup();
          try {
            resolve({ response: verifyHandshake(head.subarray(0, end).toString('latin1'), key), leftover: head.subarray(end + 4) });
          } catch (error) {
            reject(error);
          }
        };
        const fail = (error: Error) => {
          cleanup();
          reject(error);
        };
        const onClose = () => fail(new Error('Connection closed during the WebSocket handshake'));
        const cleanup = () => {
          socket.pause();
          socket.off('data', onData);
          socket.off('error', fail);
          socket.off('close', onClose);
        };
        socket.on('data', onData);
        socket.on('error', fail);
        socket.on('close', onClose);
        socket.write(request);
      })
    );
    if (response.status !== 101) {
      throw new WebSocketHandshakeRejected(response);
    }
    opened.length = 0; // handed over to the connection
    return { connection: wrapConnection(socket, leftover), response };
  } finally {
    settled = true;
    clearTimeout(timer);
    removeAbort();
    for (const item of opened) item.destroy();
  }
}

/** The server answered the upgrade with a normal HTTP response (e.g. 401). */
export class WebSocketHandshakeRejected extends Error {
  constructor(readonly response: HandshakeResponse) {
    super(`The server answered ${response.status} instead of switching to WebSocket`);
    this.name = 'WebSocketHandshakeRejected';
  }
}
