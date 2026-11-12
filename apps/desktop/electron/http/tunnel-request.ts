import type { HttpMethod } from '@ownshell/core';
import * as http from 'node:http';
import * as https from 'node:https';
import type { Duplex } from 'node:stream';
import * as zlib from 'node:zlib';
import type { EventStreamHooks } from './http-client';
import { isEventStream } from './sse';
import type { HttpResponse } from './types';
import {
  MAX_RESPONSE_BODY_BYTES,
  decodeResponseBody,
  responseTooLargeError,
} from './fetch-timeout';

const REQUEST_TIMEOUT_MS = 30000;

function decompress(bytes: Buffer, encoding: string | undefined): Buffer {
  const options = { maxOutputLength: MAX_RESPONSE_BODY_BYTES };
  try {
    switch ((encoding ?? '').trim().toLowerCase()) {
      case 'gzip':
      case 'x-gzip':
        return zlib.gunzipSync(bytes, options);
      case 'deflate':
        return zlib.inflateSync(bytes, options);
      case 'br':
        return zlib.brotliDecompressSync(bytes, options);
      default:
        return bytes;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw responseTooLargeError();
    throw error;
  }
}

function flattenHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') flat[key] = value;
    else if (Array.isArray(value)) flat[key] = value.join(', ');
  }
  return flat;
}

/** Streaming counterpart of decompress() for event streams. */
function streamDecoder(encoding: string | undefined): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | undefined {
  switch ((encoding ?? '').trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    default:
      return undefined;
  }
}

/** One HTTP exchange; `headersAt`/`doneAt` are performance.now() stamps. */
export type TransportResponse = Omit<HttpResponse, 'time' | 'timings'> & {
  headersAt: number;
  doneAt: number;
  /** Each Set-Cookie header on its own (joined headers cannot be split safely). */
  setCookies?: string[];
};

/**
 * Sends one HTTP request. With `createConnection` the bytes go over that stream
 * (e.g. an SSH channel, already TLS-wrapped for https); otherwise Node's default
 * http/https transport is used with certificate verification on.
 */
export function requestOverConnection(options: {
  url: URL;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: Buffer;
  createConnection?: () => Duplex;
  /** Inactivity timeout; the caller enforces the overall deadline. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Only for the direct https route; SSH-host TLS is set up by the caller. */
  rejectUnauthorized?: boolean;
  /** A text/event-stream body goes here chunk by chunk instead of being buffered. */
  stream?: EventStreamHooks;
}): Promise<TransportResponse> {
  const { url, method, headers, body, createConnection, signal } = options;
  return new Promise((resolve, reject) => {
    const requestOptions: http.RequestOptions = {
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers:
        body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')
          ? { ...headers, 'Content-Length': String(body.length) }
          : headers,
      signal,
    };
    if (options.rejectUnauthorized === false) {
      (requestOptions as https.RequestOptions).rejectUnauthorized = false;
    }
    if (createConnection) {
      // No agent: with any agent (even `agent: false`) Node ignores createConnection and dials directly.
      requestOptions.createConnection = createConnection as http.RequestOptions['createConnection'];
    }

    const onResponse = (res: http.IncomingMessage) => {
      const headersAt = performance.now();
      if (options.stream && isEventStream(res.headers['content-type'])) {
        const responseHeaders = flattenHeaders(res.headers);
        options.stream.start(res.statusCode || 0, res.statusMessage || '', responseHeaders);
        const decoder = streamDecoder(responseHeaders['content-encoding']);
        const source = decoder ? res.pipe(decoder) : res;
        source.on('data', (chunk: Buffer) => options.stream!.data(chunk));
        source.on('error', reject);
        source.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: responseHeaders,
            body: '',
            size: 0,
            headersAt,
            doneAt: performance.now(),
            setCookies: res.headers['set-cookie'],
          })
        );
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BODY_BYTES) {
          req.destroy();
          reject(responseTooLargeError());
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        try {
          const responseHeaders = flattenHeaders(res.headers);
          const bytes = decompress(Buffer.concat(chunks), responseHeaders['content-encoding']);
          resolve({
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: responseHeaders,
            ...decodeResponseBody(bytes, responseHeaders['content-type']),
            size: bytes.length,
            headersAt,
            doneAt: performance.now(),
            setCookies: res.headers['set-cookie'],
          });
        } catch (error) {
          reject(error);
        }
      });
    };

    const req =
      !createConnection && url.protocol === 'https:'
        ? https.request(requestOptions, onResponse)
        : http.request(requestOptions, onResponse);

    req.on('error', reject);
    // An SSH channel has no setTimeout (Node would throw); that route has the caller's deadline.
    if (!createConnection) {
      req.setTimeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error('Request timeout'));
      });
    }
    req.end(body);
  });
}

/** Plain request against a local port (kept for callers/tests that address 127.0.0.1 directly). */
export function requestViaTunnel(
  tunnelPort: number,
  isHttps: boolean,
  path: string,
  method: HttpMethod,
  headers: Record<string, string>,
  body?: string
): Promise<TransportResponse> {
  return requestOverConnection({
    url: new URL(`${isHttps ? 'https' : 'http'}://127.0.0.1:${tunnelPort}${path}`),
    method,
    headers,
    body: body === undefined ? undefined : Buffer.from(body),
  });
}
