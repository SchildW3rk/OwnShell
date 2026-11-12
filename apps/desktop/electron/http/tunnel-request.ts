import type { HttpMethod } from '@ownshell/core';
import * as https from 'https';
import * as http from 'http';
import type { HttpResponse } from './types';
import { MAX_RESPONSE_BODY_BYTES, responseTooLargeError } from './fetch-timeout';

export function requestViaTunnel(
  tunnelPort: number,
  isHttps: boolean,
  path: string,
  method: HttpMethod,
  headers: Record<string, string>,
  body?: string
): Promise<Omit<HttpResponse, 'time'>> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: tunnelPort,
      path,
      method,
      headers,
      rejectUnauthorized: false,
    };

    const client = isHttps ? https : http;
    const req = client.request(options, (res) => {
      // Collect raw bytes and decode once: decoding per chunk splits multibyte characters.
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

      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        const responseHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (typeof value === 'string') {
            responseHeaders[key] = value;
          } else if (Array.isArray(value)) {
            responseHeaders[key] = value.join(', ');
          }
        }

        resolve({
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers: responseHeaders,
          body: data,
          size,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}
