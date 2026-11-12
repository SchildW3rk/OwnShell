import type { HttpMethod } from '@ownshell/core';
import * as http from 'node:http';
import * as https from 'node:https';
import type { Duplex } from 'node:stream';
import * as zlib from 'node:zlib';
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
}): Promise<Omit<HttpResponse, 'time'>> {
  const { url, method, headers, body, createConnection } = options;
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
    };
    if (createConnection) {
      // No agent: with any agent (even `agent: false`) Node ignores createConnection and dials directly.
      requestOptions.createConnection = createConnection as http.RequestOptions['createConnection'];
    }

    const onResponse = (res: http.IncomingMessage) => {
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
          const responseHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') responseHeaders[key] = value;
            else if (Array.isArray(value)) responseHeaders[key] = value.join(', ');
          }
          const bytes = decompress(Buffer.concat(chunks), responseHeaders['content-encoding']);
          resolve({
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: responseHeaders,
            ...decodeResponseBody(bytes, responseHeaders['content-type']),
            size: bytes.length,
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
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('Request timeout'));
    });
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
): Promise<Omit<HttpResponse, 'time'>> {
  return requestOverConnection({
    url: new URL(`${isHttps ? 'https' : 'http'}://127.0.0.1:${tunnelPort}${path}`),
    method,
    headers,
    body: body === undefined ? undefined : Buffer.from(body),
  });
}
