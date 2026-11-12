/**
 * HTTP transport for the API client.
 *
 * Sends a PreparedRequest either directly (fetch) or through the selected SSH
 * host (direct-tcpip channel to the target, TLS on top). A request bound to a
 * host is never sent directly, and redirects never leave the SSH route.
 */

import { isIP } from 'node:net';
import type { Duplex } from 'node:stream';
import * as tls from 'node:tls';
import { decodeResponseBody, readResponseBytes } from './fetch-timeout';
import { ApiRequestError, type PreparedRequest } from './prepare-request';
import { isEventStream } from './sse';
import { requestOverConnection, type TransportResponse } from './tunnel-request';
import type { HttpResponse, RedirectNotice } from './types';

export type { HttpRequestConfig, HttpResponse } from './types';

export const REQUEST_TIMEOUT_MS = 30000;
export const MAX_REDIRECTS = 10;

/** The workspace cookie jar, consulted again on every hop (also after a redirect). */
export interface CookieJarAccess {
  header(url: URL): Promise<string | undefined>;
  store(url: URL, setCookies: string[]): Promise<void>;
}

export interface SendDeps {
  /** Opens a byte stream from the SSH host to host:port. */
  openHostStream: (hostId: string, host: string, port: number) => Promise<Duplex>;
  fetch?: typeof fetch;
  /** Overall deadline from connection setup to the last body byte, across redirects. */
  timeoutMs?: number;
  /** Default true. */
  followRedirects?: boolean;
  /** Default true; false only per request on the user's explicit choice. */
  verifyTls?: boolean;
  /** User cancel. */
  signal?: AbortSignal;
  /** Off when the request disabled the jar. */
  cookieJar?: CookieJarAccess;
  /**
   * Server-Sent Events: a text/event-stream response is handed over chunk by chunk
   * instead of buffered. Timeouts for a stream: `timeoutMs` bounds everything up to
   * the response headers; after that only an idle timeout of the same length applies
   * (no byte for `timeoutMs` ends the stream), so a live stream is never cut off.
   */
  onEventStream?: EventStreamHooks;
}

export interface EventStreamHooks {
  start(status: number, statusText: string, headers: Record<string, string>): void;
  data(chunk: Buffer): void;
}

/** Jar cookies go on the wire copy only, so a redirect never forwards them to another origin. */
function withJarCookies(request: PreparedRequest, jarCookies: string | undefined): PreparedRequest {
  if (!jarCookies) return request;
  const headers = { ...request.headers };
  const userKey = Object.keys(headers).find((key) => key.toLowerCase() === 'cookie');
  if (userKey) headers[userKey] = `${headers[userKey]}; ${jarCookies}`;
  else headers['Cookie'] = jarCookies;
  return { ...request, headers };
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function effectivePort(url: URL): string {
  return url.port || (url.protocol === 'https:' ? '443' : '80');
}

export type RedirectDecision =
  | { follow: false; notice?: RedirectNotice }
  | { follow: true; request: PreparedRequest };

/**
 * Whether to follow a response. On the SSH route only targets with the same
 * host:port are followed, so a redirect can never make the request leave it.
 */
export function decideRedirect(
  current: PreparedRequest,
  response: { status: number; location?: string },
  options: { followRedirects: boolean; viaSshHost: boolean; redirectCount: number }
): RedirectDecision {
  if (!options.followRedirects || !REDIRECT_STATUSES.has(response.status) || !response.location) {
    return { follow: false };
  }
  let target: URL;
  try {
    target = new URL(response.location, current.url);
  } catch {
    return { follow: false };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return { follow: false };
  if (options.redirectCount >= MAX_REDIRECTS) return { follow: false, notice: 'REDIRECT_LIMIT' };
  if (
    options.viaSshHost &&
    (target.hostname !== current.url.hostname || effectivePort(target) !== effectivePort(current.url))
  ) {
    return { follow: false, notice: 'REDIRECT_OTHER_HOST' };
  }

  const toGet =
    (response.status === 303 && current.method !== 'HEAD') ||
    ((response.status === 301 || response.status === 302) && current.method === 'POST');
  const sameOrigin = target.origin === current.url.origin;
  // Same rule as browsers/fetch: credentials are not handed to another origin,
  // including the header or query param that API-key auth added.
  const credentialHeaders = new Set(['authorization', 'cookie', 'proxy-authorization', 'host']);
  for (const name of current.authHeaderNames ?? []) credentialHeaders.add(name.toLowerCase());
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(current.headers)) {
    const lower = key.toLowerCase();
    if (toGet && (lower === 'content-type' || lower === 'content-length')) continue;
    if (!sameOrigin && credentialHeaders.has(lower)) continue;
    headers[key] = value;
  }
  // Also when the server echoed the key into Location.
  if (!sameOrigin) {
    for (const name of current.authQueryNames ?? []) {
      // has() first: delete() re-encodes the whole query even when nothing matches.
      if (target.searchParams.has(name)) target.searchParams.delete(name);
    }
  }
  return {
    follow: true,
    request: {
      method: toGet ? 'GET' : current.method,
      url: target,
      headers,
      body: toGet ? undefined : current.body,
      // Kept for later hops, so an echo on any later cross-origin hop is stripped too.
      authHeaderNames: current.authHeaderNames,
      authQueryNames: current.authQueryNames,
    },
  };
}

export async function sendPreparedRequest(
  prepared: PreparedRequest,
  networkHostId: string | null,
  deps: SendDeps
): Promise<HttpResponse> {
  const started = performance.now();
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const verifyTls = deps.verifyTls !== false;

  // One signal for deadline and user cancel; every hop and channel listens to it.
  const controller = new AbortController();
  const arm = (message: string) =>
    setTimeout(() => controller.abort(new ApiRequestError('TIMEOUT', message)), timeoutMs);
  let timer = arm(`Request timed out after ${timeoutMs / 1000} s`);

  // Once a stream has started, its end (also by cancel or idle timeout) is a normal response.
  let streamed: { status: number; statusText: string; headers: Record<string, string>; size: number; at: number } | undefined;
  const idle = () => {
    clearTimeout(timer);
    timer = arm(`No stream data for ${timeoutMs / 1000} s`);
  };
  const stream: EventStreamHooks | undefined = deps.onEventStream && {
    start: (status, statusText, headers) => {
      streamed = { status, statusText, headers, size: 0, at: performance.now() };
      idle();
      deps.onEventStream!.start(status, statusText, headers);
    },
    data: (chunk) => {
      if (!streamed || controller.signal.aborted) return;
      streamed.size += chunk.length;
      idle();
      deps.onEventStream!.data(chunk);
    },
  };
  const streamResponse = (streamEnd: NonNullable<HttpResponse['streamEnd']>): HttpResponse => {
    const doneAt = performance.now();
    return {
      status: streamed!.status,
      statusText: streamed!.statusText,
      headers: streamed!.headers,
      body: '',
      size: streamed!.size,
      time: Math.round(doneAt - started),
      timings: { prepareMs: 0, headersMs: streamed!.at - started, bodyReadMs: doneAt - streamed!.at, totalMs: doneAt - started },
      streamEnd,
    };
  };
  const cancel = () => controller.abort(new ApiRequestError('CANCELLED', 'Request cancelled'));
  if (deps.signal?.aborted) cancel();
  else deps.signal?.addEventListener('abort', cancel, { once: true });

  try {
    let request = prepared;
    for (let redirectCount = 0; ; redirectCount++) {
      const jarCookies = deps.cookieJar ? await deps.cookieJar.header(request.url) : undefined;
      if (controller.signal.aborted) throw controller.signal.reason;
      const wire = withJarCookies(request, jarCookies);
      const { setCookies, ...hop } = networkHostId
        ? await sendViaHost(wire, networkHostId, deps.openHostStream, controller.signal, verifyTls, timeoutMs, stream)
        : await sendDirect(wire, deps.fetch ?? fetch, controller.signal, verifyTls, timeoutMs, stream);
      if (setCookies?.length) await deps.cookieJar?.store(request.url, setCookies);
      if (streamed) return streamResponse('complete');
      const decision = decideRedirect(
        request,
        { status: hop.status, location: hop.headers['location'] },
        { followRedirects: deps.followRedirects !== false, viaSshHost: !!networkHostId, redirectCount }
      );
      if (decision.follow) {
        request = decision.request;
        continue;
      }
      const { headersAt, doneAt, ...response } = hop;
      return {
        ...response,
        time: Math.round(doneAt - started),
        timings: {
          prepareMs: 0,
          headersMs: headersAt - started,
          bodyReadMs: doneAt - headersAt,
          totalMs: doneAt - started,
        },
        ...(decision.notice ? { redirectNotice: decision.notice } : {}),
      };
    }
  } catch (error) {
    const reason: unknown = controller.signal.aborted ? controller.signal.reason : error;
    if (streamed && reason instanceof ApiRequestError && (reason.code === 'CANCELLED' || reason.code === 'TIMEOUT')) {
      return streamResponse(reason.code === 'CANCELLED' ? 'cancelled' : 'timeout');
    }
    throw reason;
  } finally {
    clearTimeout(timer);
    deps.signal?.removeEventListener('abort', cancel);
  }
}

async function sendDirect(
  prepared: PreparedRequest,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  verifyTls: boolean,
  timeoutMs: number,
  stream?: EventStreamHooks
): Promise<TransportResponse> {
  if (!verifyTls && prepared.url.protocol === 'https:') {
    // fetch has no per-request TLS option; Node's https transport does.
    return requestOverConnection({
      url: prepared.url,
      method: prepared.method,
      headers: prepared.headers,
      body: prepared.body,
      signal,
      timeoutMs,
      rejectUnauthorized: false,
      stream,
    });
  }

  const response = await fetchImpl(prepared.url, {
    method: prepared.method,
    headers: prepared.headers,
    body: prepared.body,
    redirect: 'manual',
    // Also aborts the body read below.
    signal,
  });
  const headersAt = performance.now();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  if (stream && isEventStream(headers['content-type']) && response.body) {
    stream.start(response.status, response.statusText, headers);
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      stream.data(Buffer.from(value));
    }
    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body: '',
      size: 0,
      headersAt,
      doneAt: performance.now(),
      setCookies: response.headers.getSetCookie(),
    };
  }

  const bytes = await readResponseBytes(response);

  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    ...decodeResponseBody(bytes, headers['content-type']),
    size: bytes.length,
    headersAt,
    doneAt: performance.now(),
    setCookies: response.headers.getSetCookie(),
  };
}

async function sendViaHost(
  prepared: PreparedRequest,
  hostId: string,
  openHostStream: SendDeps['openHostStream'],
  signal: AbortSignal,
  verifyTls: boolean,
  timeoutMs: number,
  eventStream?: EventStreamHooks
): Promise<TransportResponse> {
  const { url } = prepared;
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);

  // req.setTimeout only catches inactivity; the shared signal bounds a hung channel open,
  // a trickling response and a user cancel, and closes the channel right away.
  const opened: Duplex[] = [];
  let removeListener = () => {};
  const stopped = new Promise<never>((_, reject) => {
    const stop = () => {
      for (const item of opened) item.destroy();
      reject(signal.reason);
    };
    if (signal.aborted) stop();
    else {
      signal.addEventListener('abort', stop, { once: true });
      removeListener = () => signal.removeEventListener('abort', stop);
    }
  });
  stopped.catch(() => undefined);
  const untilStopped = <T>(promise: Promise<T>): Promise<T> => {
    promise.catch(() => undefined); // a failure after the stop is not an unhandled rejection
    return Promise.race([promise, stopped]);
  };

  try {
    let stream: Duplex;
    try {
      stream = await untilStopped(
        openHostStream(hostId, hostname, port).then((channel) => {
          // A channel that arrives after the stop is closed right away.
          if (signal.aborted) channel.destroy();
          else opened.push(channel);
          return channel;
        })
      );
    } catch (error) {
      if (signal.aborted) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new ApiRequestError(
        'NETWORK_HOST_UNAVAILABLE',
        `Could not reach ${url.host} through the selected SSH host: ${reason}`,
        reason
      );
    }

    const socket =
      url.protocol === 'https:'
        ? tls.connect({
            socket: stream,
            host: hostname,
            // SNI must be a DNS name; for IP targets the certificate is still checked against `host`.
            servername: isIP(hostname) ? undefined : hostname,
            rejectUnauthorized: verifyTls,
          })
        : stream;
    opened.push(socket);

    const headers = { ...prepared.headers };
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'host')) headers['Host'] = url.host;

    return await untilStopped(
      requestOverConnection({
        url,
        method: prepared.method,
        headers,
        body: prepared.body,
        createConnection: () => socket,
        timeoutMs,
        stream: eventStream,
      })
    );
  } finally {
    removeListener();
    for (const item of opened) item.destroy();
  }
}
