/**
 * HTTP transport for the API client.
 *
 * Sends a PreparedRequest either directly (fetch) or through the selected SSH
 * host (direct-tcpip channel to the target, TLS on top with verification on).
 * A request bound to a host is never sent directly.
 */

import { isIP } from 'node:net';
import type { Duplex } from 'node:stream';
import * as tls from 'node:tls';
import { decodeResponseBody, readResponseBytes } from './fetch-timeout';
import { ApiRequestError, type PreparedRequest } from './prepare-request';
import { requestOverConnection } from './tunnel-request';
import type { HttpResponse } from './types';

export type { HttpRequestConfig, HttpResponse } from './types';

const REQUEST_TIMEOUT_MS = 30000;

export interface SendDeps {
  /** Opens a byte stream from the SSH host to host:port. */
  openHostStream: (hostId: string, host: string, port: number) => Promise<Duplex>;
  fetch?: typeof fetch;
  /** Overall deadline from connection setup to the last body byte. */
  timeoutMs?: number;
}

export async function sendPreparedRequest(
  prepared: PreparedRequest,
  networkHostId: string | null,
  deps: SendDeps
): Promise<HttpResponse> {
  const started = performance.now();
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  return networkHostId
    ? sendViaHost(prepared, networkHostId, deps.openHostStream, timeoutMs, started)
    : sendDirect(prepared, deps.fetch ?? fetch, timeoutMs, started);
}

async function sendDirect(
  prepared: PreparedRequest,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  started: number
): Promise<HttpResponse> {
  const response = await fetchImpl(prepared.url, {
    method: prepared.method,
    headers: prepared.headers,
    body: prepared.body,
    // Also aborts the body read below, so this is an overall deadline.
    signal: AbortSignal.timeout(timeoutMs),
  });
  const headersReceived = performance.now();
  const bytes = await readResponseBytes(response);
  const bodyReceived = performance.now();

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    ...decodeResponseBody(bytes, headers['content-type']),
    time: Math.round(bodyReceived - started),
    size: bytes.length,
    timings: {
      prepareMs: 0,
      headersMs: headersReceived - started,
      bodyReadMs: bodyReceived - headersReceived,
      totalMs: bodyReceived - started,
    },
  };
}

async function sendViaHost(
  prepared: PreparedRequest,
  hostId: string,
  openHostStream: SendDeps['openHostStream'],
  timeoutMs: number,
  started: number
): Promise<HttpResponse> {
  const { url } = prepared;
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);

  // req.setTimeout only catches inactivity; this bounds a hung channel open and a trickling response.
  const opened: Duplex[] = [];
  let expired = false;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      for (const item of opened) item.destroy();
      reject(new Error(`Request timed out after ${timeoutMs / 1000} s`));
    }, timeoutMs);
  });
  const withDeadline = <T>(promise: Promise<T>): Promise<T> => {
    promise.catch(() => undefined); // a failure after the deadline is not an unhandled rejection
    return Promise.race([promise, deadline]);
  };

  try {
    let stream: Duplex;
    try {
      stream = await withDeadline(
        openHostStream(hostId, hostname, port).then((channel) => {
          // A channel that arrives after the deadline is closed right away.
          if (expired) channel.destroy();
          else opened.push(channel);
          return channel;
        })
      );
    } catch (error) {
      if (expired) throw error;
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
          })
        : stream;
    opened.push(socket);

    const headers = { ...prepared.headers };
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'host')) headers['Host'] = url.host;

    const response = await withDeadline(
      requestOverConnection({
        url,
        method: prepared.method,
        headers,
        body: prepared.body,
        createConnection: () => socket,
      })
    );
    return { ...response, time: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
    for (const item of opened) item.destroy();
  }
}
