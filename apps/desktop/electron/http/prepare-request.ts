/**
 * Shared request preparation for the API client.
 *
 * Turns a stored request (plus resolved variables and the parent collections'
 * auth) into the exact method, URL, headers and body bytes that go on the wire.
 * Direct sends, SSH-host sends and any later export/runner must use this so the
 * rules stay identical. Pure apart from the injected `loadFile`.
 */

import { randomBytes } from 'node:crypto';
import type { HttpMethod, RequestAuthType, RequestBodyType } from '@ownshell/core';
import { MAX_RESPONSE_BODY_BYTES } from './fetch-timeout';
import type { AuthConfig, KeyValueItem, RawContentType } from './types';

export const MAX_REQUEST_BODY_BYTES = MAX_RESPONSE_BODY_BYTES;

export type ApiRequestErrorCode =
  | 'MISSING_VARIABLES'
  | 'VAULT_LOCKED'
  | 'INVALID_URL'
  | 'FILE_ERROR'
  | 'BODY_TOO_LARGE'
  | 'NETWORK_HOST_UNAVAILABLE';

/** Error with a stable code the renderer can translate; `detail` is safe to show (names only, no values). */
export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiRequestErrorCode,
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface RequestInput {
  method: HttpMethod;
  url: string;
  params: string;
  headers: string;
  body: string;
  bodyType: RequestBodyType;
  rawContentType?: RawContentType;
  authType: RequestAuthType;
  authConfig: string;
}

export interface AuthSource {
  auth_type: RequestAuthType;
  auth_config: string;
}

export interface LoadedFile {
  data: Buffer;
  name: string;
  contentType: string;
}

export interface PrepareContext {
  variables: Record<string, string>;
  /** Environment selected but the vault is locked, so its variables could not be decrypted. */
  variablesLocked?: boolean;
  /** Auth of the parent collections, nearest first. */
  authChain?: AuthSource[];
  /** Must not return more than `maxBytes` bytes (throw BODY_TOO_LARGE instead). */
  loadFile: (filePath: string, maxBytes: number) => Promise<LoadedFile>;
  boundary?: string;
}

export interface PreparedRequest {
  method: HttpMethod;
  url: URL;
  headers: Record<string, string>;
  body?: Buffer;
}

interface FormDataItem extends KeyValueItem {
  type?: 'text' | 'file';
}

const RAW_CONTENT_TYPES: Record<RawContentType, string> = {
  text: 'text/plain',
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
};

function parseJson<T>(json: string, fallback: T): T {
  try {
    return (JSON.parse(json) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function enabledItems<T extends KeyValueItem>(json: string): T[] {
  const items = parseJson<unknown>(json, []);
  return Array.isArray(items)
    ? (items as T[]).filter((item) => item?.enabled && typeof item.key === 'string' && item.key.trim())
    : [];
}

/** Walks `inherit` up the collection chain; an unresolved inherit at the root means no auth. */
export function resolveAuth(
  authType: RequestAuthType,
  authConfig: string,
  chain: AuthSource[] = []
): { type: RequestAuthType; config: AuthConfig } {
  let source: AuthSource = { auth_type: authType, auth_config: authConfig };
  for (const parent of chain) {
    if (source.auth_type !== 'inherit') break;
    source = parent;
  }
  if (source.auth_type === 'inherit') return { type: 'none', config: {} };
  return { type: source.auth_type, config: parseJson<AuthConfig>(source.auth_config, {}) };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function deleteHeader(headers: Record<string, string>, name: string): void {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) delete headers[key];
  }
}

// RFC 7578 / WHATWG: quotes and line breaks in names must not break the part header.
function escapeMultipartName(value: string): string {
  return value.replace(/"/g, '%22').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export async function prepareRequest(
  input: RequestInput,
  context: PrepareContext
): Promise<PreparedRequest> {
  const missing = new Set<string>();
  const interpolate = (text: string): string =>
    text.replace(/\{\{([^}]+)\}\}/g, (match, rawName: string) => {
      const name = rawName.trim();
      if (Object.prototype.hasOwnProperty.call(context.variables, name)) return context.variables[name];
      missing.add(name);
      return match;
    });

  const urlText = interpolate(input.url.trim());
  const query: Array<[string, string]> = enabledItems(input.params).map((item) => [
    interpolate(item.key),
    interpolate(item.value ?? ''),
  ]);

  const headers: Record<string, string> = {};
  for (const item of enabledItems(input.headers)) {
    headers[interpolate(item.key).trim()] = interpolate(item.value ?? '');
  }

  const auth = resolveAuth(input.authType, input.authConfig, context.authChain);
  switch (auth.type) {
    case 'bearer':
      if (auth.config.token) headers['Authorization'] = `Bearer ${interpolate(auth.config.token)}`;
      break;
    case 'basic':
      if (auth.config.username || auth.config.password) {
        const credentials = `${interpolate(auth.config.username ?? '')}:${interpolate(auth.config.password ?? '')}`;
        headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
      }
      break;
    case 'api-key':
      if (auth.config.key && auth.config.value) {
        const key = interpolate(auth.config.key);
        const value = interpolate(auth.config.value);
        if (auth.config.addTo === 'query') query.push([key, value]);
        else headers[key] = value;
      }
      break;
  }

  const sendsBody = input.method !== 'GET' && input.method !== 'HEAD';
  let body: Buffer | undefined;
  let contentType: string | undefined;

  if (sendsBody) {
    switch (input.bodyType) {
      case 'json':
      case 'raw':
        if (input.body.trim()) {
          body = Buffer.from(interpolate(input.body), 'utf8');
          contentType =
            input.bodyType === 'json'
              ? 'application/json'
              : RAW_CONTENT_TYPES[input.rawContentType ?? 'text'] ?? 'text/plain';
        }
        break;

      case 'form-urlencoded': {
        const items = parseJson<unknown>(input.body, null);
        if (Array.isArray(items)) {
          const form = new URLSearchParams();
          for (const item of enabledItems(input.body)) form.append(interpolate(item.key), interpolate(item.value ?? ''));
          body = Buffer.from(form.toString(), 'utf8');
        } else if (input.body.trim()) {
          body = Buffer.from(interpolate(input.body), 'utf8');
        }
        if (body) contentType = 'application/x-www-form-urlencoded';
        break;
      }

      case 'form-data': {
        const boundary = context.boundary ?? `----OwnShellFormBoundary${randomBytes(12).toString('hex')}`;
        const parts: Buffer[] = [];
        let size = 0;
        // Running budget so the 50 MB cap holds before anything is concatenated.
        const push = (...chunks: Buffer[]) => {
          for (const chunk of chunks) size += chunk.length;
          if (size > MAX_REQUEST_BODY_BYTES) {
            throw new ApiRequestError('BODY_TOO_LARGE', 'Request body exceeds the 50 MB limit');
          }
          parts.push(...chunks);
        };
        for (const item of enabledItems<FormDataItem>(input.body)) {
          const name = escapeMultipartName(interpolate(item.key));
          if (item.type === 'file') {
            if (!item.value) continue;
            const file = await context.loadFile(item.value, MAX_REQUEST_BODY_BYTES - size);
            push(
              Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${escapeMultipartName(file.name)}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
              ),
              file.data,
              Buffer.from('\r\n')
            );
          } else {
            push(
              Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${interpolate(item.value ?? '')}\r\n`
              )
            );
          }
        }
        push(Buffer.from(`--${boundary}--\r\n`));
        body = Buffer.concat(parts, size);
        // The boundary is ours, so a user-supplied multipart Content-Type would not match the body.
        deleteHeader(headers, 'Content-Type');
        headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
        break;
      }

      case 'binary': {
        const file = parseJson<{ path?: unknown }>(input.body, {});
        if (typeof file.path === 'string' && file.path) {
          const loaded = await context.loadFile(file.path, MAX_REQUEST_BODY_BYTES);
          body = loaded.data;
          contentType = loaded.contentType;
        } else if (input.body.trim()) {
          throw new ApiRequestError('FILE_ERROR', 'Select the file for the binary body again');
        }
        break;
      }
    }
  }

  if (missing.size > 0) {
    const names = [...missing].join(', ');
    if (context.variablesLocked) {
      throw new ApiRequestError('VAULT_LOCKED', 'Unlock OwnShell to resolve environment variables', names);
    }
    throw new ApiRequestError('MISSING_VARIABLES', `Unknown variables: ${names}`, names);
  }

  if (body && body.length > MAX_REQUEST_BODY_BYTES) {
    throw new ApiRequestError('BODY_TOO_LARGE', 'Request body exceeds the 50 MB limit');
  }

  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new ApiRequestError('INVALID_URL', 'Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiRequestError('INVALID_URL', 'Only http and https URLs are supported');
  }
  if (query.length > 0) {
    // Append as text so the user's existing query keeps its exact encoding.
    const extra = new URLSearchParams(query).toString();
    url.search = url.search ? `${url.search}&${extra}` : `?${extra}`;
  }

  if (contentType && !hasHeader(headers, 'Content-Type')) headers['Content-Type'] = contentType;

  return { method: input.method, url, headers, body };
}
