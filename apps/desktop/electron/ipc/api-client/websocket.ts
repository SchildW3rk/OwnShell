/**
 * WebSocket requests: connect with the same preparation as an HTTP send (auth incl.
 * OAuth, variables, SSH-host route, cookies, TLS setting), then text messages both
 * ways. Message contents go to the window that opened the connection only; they are
 * never logged or stored (history records the URL template).
 */

import type { Database } from '@ownshell/core';
import type { WebContents } from 'electron';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { openHostStream } from '../../http/host-stream';
import type { TokenStore } from '../../http/oauth';
import { ApiRequestError } from '../../http/prepare-request';
import type { PickedFiles } from '../../http/request-files';
import {
  connectWebSocket,
  MAX_WS_MESSAGE_BYTES,
  WebSocketHandshakeRejected,
  WebSocketProtocolError,
  type WebSocketConnection,
} from '../../http/websocket';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { createCookieJar } from './cookies';
import { prepareForSend } from './execute';
import { saveHistory } from './request-context';
import { executeRequestSchema } from './schemas';

const connectionIdSchema = z.string().min(1).max(64);
const connectSchema = z.object({ connectionId: connectionIdSchema, config: executeRequestSchema });
const sendSchema = z.object({ connectionId: connectionIdSchema, text: z.string().max(MAX_WS_MESSAGE_BYTES) });

/** Main → renderer on 'api:ws:event'. Binary messages are shown as their size only. */
export type WebSocketEvent =
  | { connectionId: string; type: 'message'; data: string; binary: boolean; size: number; time: number }
  | { connectionId: string; type: 'close'; code: number; reason: string; time: number }
  | { connectionId: string; type: 'error'; message: string; code: string; detail?: string; time: number };

export type WebSocketConnectResult =
  | { ok: true; status: number; headers: Record<string, string> }
  | { ok: false; status?: number; errorCode?: string; errorDetail?: string; errorScopes?: string[]; message: string };

/** Per-window connections; a closed window closes its connections. */
const MAX_CONNECTIONS = 32;

export function registerApiWebSocketHandlers(
  db: Kysely<Database>,
  deps: { pickedFiles: PickedFiles; tokens: TokenStore }
): void {
  const connections = new Map<string, WebSocketConnection>();
  const pending = new Map<string, AbortController>();
  const watched = new WeakSet<WebContents>();

  const watch = (sender: WebContents) => {
    if (watched.has(sender)) return;
    watched.add(sender);
    sender.once('destroyed', () => {
      for (const [key, connection] of connections) {
        if (key.startsWith(`${sender.id}:`)) connection.close(1001);
      }
      for (const [key, controller] of pending) {
        if (key.startsWith(`${sender.id}:`)) controller.abort();
      }
    });
  };

  safeHandle('api:ws:connect', connectSchema, async (event, { connectionId, config }): Promise<WebSocketConnectResult> => {
    const sender = event.sender;
    const key = `${sender.id}:${connectionId}`;
    if (connections.has(key) || pending.has(key)) return { ok: false, message: 'Connection id in use' };
    if (connections.size + pending.size >= MAX_CONNECTIONS) return { ok: false, errorCode: 'WS_TOO_MANY', message: 'Too many open WebSocket connections' };
    watch(sender);
    const controller = new AbortController();
    pending.set(key, controller);
    const started = performance.now();
    let status = 0;
    let host: string | undefined;
    try {
      const prepared = await prepareForSend(db, deps.pickedFiles, deps.tokens, config, controller.signal, { webSocket: true });
      host = prepared.url.host;
      const cookieUrl = new URL(prepared.url.href.replace(/^ws/i, 'http'));
      const jar = config.useCookieJar === false ? undefined : createCookieJar(db);
      const { connection, response } = await connectWebSocket(prepared, config.networkHostId, {
        openHostStream,
        timeoutMs: (config.timeoutSeconds ?? 30) * 1000,
        verifyTls: config.verifyTls,
        signal: controller.signal,
        cookieHeader: jar ? await jar.header(cookieUrl) : undefined,
      });
      status = response.status;
      if (controller.signal.aborted) {
        connection.close(1001);
        throw new ApiRequestError('CANCELLED', 'Connection cancelled');
      }
      connections.set(key, connection);
      const emit = (payload: WebSocketEvent) => {
        if (!sender.isDestroyed()) sender.send('api:ws:event', payload);
      };
      connection.on('message', (message) =>
        emit({
          connectionId,
          type: 'message',
          data: message.binary ? '' : message.data.toString('utf8'),
          binary: message.binary,
          size: message.data.length,
          time: Date.now(),
        })
      );
      connection.on('error', (error) => {
        const code =
          (error as { code?: unknown }).code === 'WS_BACKPRESSURE'
            ? 'WS_BACKPRESSURE'
            : error instanceof WebSocketProtocolError
              ? 'WS_PROTOCOL'
              : 'WS_CONNECTION';
        emit({ connectionId, type: 'error', message: error.message, code, detail: error.message, time: Date.now() });
      });
      connection.on('close', (code, reason) => {
        connections.delete(key);
        emit({ connectionId, type: 'close', code, reason, time: Date.now() });
        logger.info('WebSocket closed', { host, code });
      });
      logger.info('WebSocket connected', { host, viaSshHost: !!config.networkHostId });
      return { ok: true, status: response.status, headers: response.headers };
    } catch (error) {
      if (error instanceof WebSocketHandshakeRejected) status = error.response.status;
      const code = error instanceof ApiRequestError ? error.code : undefined;
      logger.warn('WebSocket connect failed', { host, viaSshHost: !!config.networkHostId, code, status });
      return {
        ok: false,
        status: status || undefined,
        errorCode: code,
        errorDetail: error instanceof ApiRequestError ? error.detail : undefined,
        errorScopes: error instanceof ApiRequestError ? error.scopes : undefined,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      pending.delete(key);
      if (status !== 0 || !controller.signal.aborted) {
        const time = performance.now() - started;
        await saveHistory(db, config, { status, statusText: '', headers: {}, body: '', time, size: 0 }).catch((error) =>
          logger.warn('Failed to record API request history', error)
        );
      }
    }
  });

  safeHandle('api:ws:send', sendSchema, (event, { connectionId, text }) => {
    const connection = connections.get(`${event.sender.id}:${connectionId}`);
    if (!connection) throw new Error('WebSocket is not open');
    connection.send(text);
  });

  safeHandle('api:ws:close', connectionIdSchema, (event, connectionId) => {
    const key = `${event.sender.id}:${connectionId}`;
    pending.get(key)?.abort();
    connections.get(key)?.close(1000);
  });
}
