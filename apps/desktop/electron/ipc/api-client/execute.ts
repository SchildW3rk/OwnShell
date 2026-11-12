import { SettingsQueries, type Database } from '@ownshell/core';
import { BrowserWindow, dialog, type WebContents } from 'electron';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Kysely } from 'kysely';
import { openHostStream } from '../../http/host-stream';
import {
  sendPreparedRequest,
  type EventStreamHooks,
  type HttpRequestConfig,
  type HttpResponse,
} from '../../http/http-client';
import {
  createSseParser,
  STREAM_BUFFER_CHARS,
  STREAM_BUFFER_EVENTS,
  sseEventChars,
  type SseEvent,
  type StreamMessage,
} from '../../http/sse';
import { ApiRequestError, prepareRequest, type PreparedRequest } from '../../http/prepare-request';
import {
  createPickedFiles,
  guessContentType,
  loadRequestFile,
  type PickedFiles,
} from '../../http/request-files';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import type { TokenStore } from '../../http/oauth';
import { createCookieJar } from './cookies';
import { createTokenStore, oauthTokenProvider } from './oauth';
import {
  exportCurl,
  loadCollectionChain,
  loadVariableScopes,
  revealAuthSecret,
  saveHistory,
} from './request-context';
import {
  cancelRequestSchema,
  executeRequestSchema,
  exportCurlSchema,
  noPayloadSchema,
} from './schemas';

/** Shared with the WebSocket and runner handlers. */
export interface ExecutionContext {
  pickedFiles: PickedFiles;
  tokens: TokenStore;
  /** Running sends and runs by `${sender.id}:${id}`; 'api:requests:cancel' aborts them. */
  running: Map<string, AbortController>;
}

export function registerApiExecutionHandlers(db: Kysely<Database>): ExecutionContext {
  const pickedFiles = createPickedFiles(new SettingsQueries(db));
  const tokens = createTokenStore(db);
  // Running sends by window + renderer-chosen id, so a window can only cancel its own.
  const running = new Map<string, AbortController>();
  safeHandle('api:requests:execute', executeRequestSchema, async (event, config) => {
    const key = config.executionId && `${event.sender.id}:${config.executionId}`;
    const controller = new AbortController();
    if (key) running.set(key, controller);
    try {
      const stream = config.executionId ? streamForwarder(event.sender, config.executionId) : undefined;
      const response = await handleExecuteRequest(db, pickedFiles, tokens, config, controller.signal, {
        onEventStream: stream,
      }).finally(() => stream?.finish());
      if (response.errorCode !== 'CANCELLED') {
        // A history write error must never turn a send into a failure.
        await saveHistory(db, config, response).catch((error) =>
          logger.warn('Failed to record API request history', error)
        );
      }
      return response;
    } finally {
      if (key && running.get(key) === controller) running.delete(key);
    }
  });
  safeHandle('api:requests:cancel', cancelRequestSchema, (event, executionId) => {
    running.get(`${event.sender.id}:${executionId}`)?.abort();
  });
  safeHandle('api:requests:export-curl', exportCurlSchema, async (_event, { config, resolveVariables }) => {
    try {
      return { command: await exportCurl(db, config, resolveVariables) };
    } catch (error) {
      if (!(error instanceof ApiRequestError)) throw error;
      return { errorCode: error.code, errorDetail: error.detail, errorScopes: error.scopes };
    }
  });
  safeHandle('api:files:pick', noPayloadSchema, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ['openFile' as const] };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;
    // Only files picked here may be read on send; the real path defeats later symlink swaps.
    const realPath = await realpath(filePath);
    const info = await stat(realPath);
    await pickedFiles.add(realPath);
    const name = path.basename(realPath);
    return { path: realPath, name, size: info.size, contentType: guessContentType(name) };
  });
  return { pickedFiles, tokens, running };
}

/**
 * Parses an event stream and forwards the events in batches (at most every 100 ms).
 * A batch keeps only the newest STREAM_BUFFER_EVENTS / STREAM_BUFFER_CHARS, so a fast
 * server cannot flood the renderer; dropped events are counted.
 */
function streamForwarder(sender: WebContents, executionId: string): EventStreamHooks & { finish(): void } {
  let batch: SseEvent[] = [];
  let batchChars = 0;
  let dropped = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const send = (message: StreamMessage) => {
    if (!sender.isDestroyed()) sender.send('api:stream', message);
  };
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (batch.length || dropped) send({ executionId, kind: 'events', events: batch, dropped });
    batch = [];
    batchChars = 0;
    dropped = 0;
  };
  const parser = createSseParser((event) => {
    batch.push(event);
    batchChars += sseEventChars(event);
    while (batch.length > STREAM_BUFFER_EVENTS || batchChars > STREAM_BUFFER_CHARS) {
      batchChars -= sseEventChars(batch.shift()!);
      dropped++;
    }
    timer ??= setTimeout(flush, 100);
  });
  return {
    start: (status, statusText, headers) => send({ executionId, kind: 'open', status, statusText, headers }),
    data: (chunk) => parser.feed(chunk),
    finish: () => {
      parser.end();
      flush();
    },
  };
}

export interface ExecuteOptions {
  onEventStream?: EventStreamHooks;
  /** Collection runner: captured values for this run only (highest precedence). */
  runtimeVariables?: Record<string, string>;
}

/** The shared preparation of a send (auth chain, OAuth secret and token, every variable scope). */
export async function prepareForSend(
  db: Kysely<Database>,
  pickedFiles: PickedFiles,
  tokens: TokenStore,
  config: HttpRequestConfig,
  signal: AbortSignal,
  options: ExecuteOptions & { webSocket?: boolean } = {}
): Promise<PreparedRequest> {
  const owner = config.requestId ? ({ type: 'request', id: config.requestId } as const) : null;
  const revealed = await revealAuthSecret(db, config, await loadCollectionChain(db, config.collectionId), owner);
  const { scopes, locked } = await loadVariableScopes(db, config, revealed.chain);
  if (options.runtimeVariables) scopes.unshift({ scope: 'runtime', variables: options.runtimeVariables });
  return prepareRequest(
    { ...config, authConfig: revealed.authConfig },
    {
      scopes,
      variablesLocked: locked,
      authChain: revealed.chain,
      // Token endpoint requests go direct, never through the request's SSH host; Cancel reaches them too.
      oauthToken: oauthTokenProvider(tokens, owner, { signal }),
      loadFile: (filePath, maxBytes) => loadRequestFile(filePath, pickedFiles, maxBytes),
      webSocket: options.webSocket,
    }
  );
}

export async function handleExecuteRequest(
  db: Kysely<Database>,
  pickedFiles: PickedFiles,
  tokens: TokenStore,
  config: HttpRequestConfig,
  signal: AbortSignal,
  options: ExecuteOptions = {}
): Promise<HttpResponse> {
  const started = performance.now();
  let host: string | undefined;
  try {
    const prepared = await prepareForSend(db, pickedFiles, tokens, config, signal, options);
    host = prepared.url.host;
    const prepareMs = performance.now() - started;

    const sent = await sendPreparedRequest(prepared, config.networkHostId, {
      openHostStream,
      timeoutMs: (config.timeoutSeconds ?? 30) * 1000,
      followRedirects: config.followRedirects,
      verifyTls: config.verifyTls,
      signal,
      cookieJar: config.useCookieJar === false ? undefined : createCookieJar(db),
      onEventStream: options.onEventStream,
    });
    const totalMs = prepareMs + (sent.timings?.totalMs ?? sent.time);
    const response: HttpResponse = {
      ...sent,
      time: Math.round(totalMs),
      timings: sent.timings && { ...sent.timings, prepareMs, totalMs },
    };
    logger.info('API request completed', {
      method: config.method,
      host,
      viaSshHost: !!config.networkHostId,
      status: response.status,
      timeMs: response.time,
      size: response.size,
      ...(response.streamEnd && { streamEnd: response.streamEnd }),
    });
    return response;
  } catch (error) {
    const time = Math.round(performance.now() - started);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const code = error instanceof ApiRequestError ? error.code : undefined;
    logger.warn('API request failed', {
      method: config.method,
      host,
      viaSshHost: !!config.networkHostId,
      code,
      timeMs: time,
    });
    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: JSON.stringify({ error: message }),
      time,
      size: 0,
      errorCode: code,
      errorDetail: error instanceof ApiRequestError ? error.detail : undefined,
      errorScopes: error instanceof ApiRequestError ? error.scopes : undefined,
    };
  }
}
