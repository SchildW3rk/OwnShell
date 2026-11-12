/**
 * Shared request preparation for the API client.
 *
 * Turns a stored request (plus resolved variables and the parent collections'
 * auth) into the exact method, URL, headers and body bytes that go on the wire.
 * Direct sends, SSH-host sends and any later export/runner must use this so the
 * rules stay identical. Pure apart from the injected `loadFile`.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { HttpMethod, RequestAuthType, RequestBodyType } from '@ownshell/core';
import { MAX_RESPONSE_BODY_BYTES } from './fetch-timeout';
import type { ResolvedOAuth } from './oauth';
import type { AuthConfig, KeyValueItem, RawContentType } from './types';

export const MAX_REQUEST_BODY_BYTES = MAX_RESPONSE_BODY_BYTES;

export type ApiRequestErrorCode =
  | 'MISSING_VARIABLES'
  | 'VAULT_LOCKED'
  | 'INVALID_URL'
  | 'FILE_ERROR'
  | 'BODY_TOO_LARGE'
  | 'NETWORK_HOST_UNAVAILABLE'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'OAUTH_FAILED'
  | 'OAUTH_TOKEN_REQUIRED'
  | 'OAUTH_INSECURE_URL';

/** Error with a stable code the renderer can translate; `detail` is safe to show (names only, no values). */
export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiRequestErrorCode,
    message: string,
    readonly detail?: string,
    /** For missing variables: the scopes that were searched, in lookup order. */
    readonly scopes?: VariableScopeName[]
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
  /** Folder id; identifies the owner of a cached OAuth token. */
  id?: string;
  auth_type: RequestAuthType;
  auth_config: string;
}

export interface LoadedFile {
  data: Buffer;
  name: string;
  contentType: string;
}

/**
 * Variable lookup order, highest precedence first:
 * request → folder chain (nearest first) → collection root → environment (vault) → global.
 */
export type VariableScopeName = 'request' | 'folder' | 'collection' | 'environment' | 'global';

export interface VariableScope {
  scope: VariableScopeName;
  variables: Record<string, string>;
}

/** Built-in dynamic values; anything else starting with `$` is an unknown variable. */
export const DYNAMIC_VARIABLES = ['$uuid', '$timestamp', '$isoTimestamp'] as const;

export interface PrepareContext {
  /** Environment variables; shorthand for `scopes: [{ scope: 'environment', variables }]`. */
  variables?: Record<string, string>;
  /** Every scope in lookup order (highest precedence first); replaces `variables`. */
  scopes?: VariableScope[];
  /** A scope's secrets could not be decrypted because the vault is locked. */
  variablesLocked?: boolean;
  /** Injected for tests; default: the current time and random UUIDs. */
  now?: () => Date;
  uuid?: () => string;
  /** Auth of the parent collections, nearest first. */
  authChain?: AuthSource[];
  /**
   * OAuth 2.0: a valid access token for the resolved config. `sourceId` is the folder
   * the auth came from (undefined: the request's own). Undefined result: the
   * `{{oauthAccessToken}}` placeholder is kept (export without a cached token).
   */
  oauthToken?: (config: ResolvedOAuth, sourceId: string | undefined) => Promise<string | undefined>;
  /** Must not return more than `maxBytes` bytes (throw BODY_TOO_LARGE instead). */
  loadFile: (filePath: string, maxBytes: number) => Promise<LoadedFile>;
  boundary?: string;
}

export interface PreparedRequest {
  method: HttpMethod;
  url: URL;
  headers: Record<string, string>;
  body?: Buffer;
  /** form-data fields as entered (file parts by path), for export; `body` holds the encoded bytes. */
  parts?: PreparedPart[];
  /** Path of a binary body file, for export. */
  bodyFile?: string;
  /** Header / query names set by API-key auth; stripped when a redirect changes origin. */
  authHeaderNames?: string[];
  authQueryNames?: string[];
}

export type PreparedPart = { name: string; value: string } | { name: string; filePath: string };

/** Like PreparedRequest, but the URL is text because `{{placeholders}}` may still be in it. */
export type ExportedRequest = Omit<PreparedRequest, 'url'> & { url: string };

interface AssembledRequest extends Omit<PreparedRequest, 'url'> {
  urlText: string;
  query: Array<[string, string]>;
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
): { type: RequestAuthType; config: AuthConfig; sourceId?: string } {
  let source: AuthSource = { auth_type: authType, auth_config: authConfig };
  for (const parent of chain) {
    if (source.auth_type !== 'inherit') break;
    source = parent;
  }
  if (source.auth_type === 'inherit') return { type: 'none', config: {} };
  return {
    type: source.auth_type,
    config: parseJson<AuthConfig>(source.auth_config, {}),
    ...(source.id && { sourceId: source.id }),
  };
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

/** Header names whose values are credentials (redacted in a placeholder export). */
export const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie)$|api[-_]?key|token|secret|password|session/i;

/**
 * Placeholder export: a value typed in directly is replaced by `{{name}}`; one that only
 * references variables (optionally after an auth scheme like "Bearer ") is kept as is.
 */
export function placeholderFor(value: string, name: string): string {
  const hasVariable = /\{\{[^}]+\}\}/.test(value);
  const literal = value.replace(/\{\{[^}]+\}\}/g, '');
  // "token" alone is a secret, "Token {{X}}" is a scheme plus a variable.
  return hasVariable && /^\s*((bearer|basic|token)\s+)?$/i.test(literal) ? value : `{{${name}}}`;
}

/** Query/param names whose values are credentials (redacted in exports and history). */
export const SENSITIVE_PARAM = /token|secret|passw(or)?d|api[-_]?key|signature|session|^(pwd|key|auth|sig)$/i;

/** Placeholder for a credential-like param value; other values stay as they are. */
export function redactParam(name: string, value: string): string {
  return SENSITIVE_PARAM.test(name.trim()) ? placeholderFor(value, name.trim()) : value;
}

/**
 * Best-effort redaction of a URL template for exports and history: drops the whole user
 * info and the fragment, and replaces literal credential-like query values by `{{name}}`.
 * Other literal values are kept.
 */
export function redactUrl(url: string): string {
  const hashStart = url.indexOf('#');
  // User info sits in the authority (before the first / ? #), with or without a scheme:
  // `https://u:p@h`, `//u:p@h`, `u:p@h/path`.
  const withoutUser = (hashStart < 0 ? url : url.slice(0, hashStart)).replace(
    /^((?:[a-z][\w+.-]*:)?\/\/)?[^/?#]*@/i,
    '$1'
  );
  const queryStart = withoutUser.indexOf('?');
  if (queryStart < 0) return withoutUser;
  const query = withoutUser
    .slice(queryStart + 1)
    .split('&')
    .map((pair) => {
      const separator = pair.indexOf('=');
      if (separator < 0) return pair;
      const rawName = pair.slice(0, separator);
      const value = decodeQueryPart(pair.slice(separator + 1));
      const kept = redactParam(decodeQueryPart(rawName), value);
      return kept === value ? pair : `${rawName}={{${rawName}}}`;
    })
    .join('&');
  return `${withoutUser.slice(0, queryStart)}?${query}`;
}

function decodeQueryPart(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
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
  const { urlText, query, ...rest } = await assembleRequest(input, context, false);

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
  return { ...rest, url };
}

/**
 * Same preparation for "Copy as curl" with `{{placeholders}}` left in place.
 * No file is read: file parts and binary bodies are described by path only.
 */
export async function prepareRequestWithPlaceholders(
  input: RequestInput,
  context: Pick<PrepareContext, 'authChain'>
): Promise<ExportedRequest> {
  const { urlText, query, ...rest } = await assembleRequest(
    input,
    {
      variables: {},
      authChain: context.authChain,
      boundary: 'x',
      loadFile: async (filePath) => ({
        data: Buffer.alloc(0),
        name: path.basename(filePath),
        contentType: 'application/octet-stream',
      }),
    },
    true
  );
  const extra = new URLSearchParams(query)
    .toString()
    .replace(/%7B%7B(.*?)%7D%7D/g, (_match, name: string) => `{{${decodeURIComponent(name)}}}`);
  const url = extra ? `${urlText}${urlText.includes('?') ? '&' : '?'}${extra}` : urlText;
  // Placeholder output is for export/history: also drop URL credentials and literal secrets in the query.
  return { ...rest, url: redactUrl(url) };
}

async function assembleRequest(
  input: RequestInput,
  context: PrepareContext,
  keepPlaceholders: boolean
): Promise<AssembledRequest> {
  const missing = new Set<string>();
  const scopes = context.scopes ?? [{ scope: 'environment' as const, variables: context.variables ?? {} }];
  // One time per request, so every {{$timestamp}} in it agrees.
  const now = (context.now ?? (() => new Date()))();
  const dynamic = (name: string): string | undefined => {
    if (name === '$uuid') return (context.uuid ?? randomUUID)();
    if (name === '$timestamp') return String(Math.floor(now.getTime() / 1000));
    if (name === '$isoTimestamp') return now.toISOString();
    return undefined;
  };
  const interpolate = (text: string): string =>
    text.replace(/\{\{([^}]+)\}\}/g, (match, rawName: string) => {
      if (keepPlaceholders) return match;
      const name = rawName.trim();
      const scope = scopes.find((entry) => Object.prototype.hasOwnProperty.call(entry.variables, name));
      if (scope) return scope.variables[name];
      const value = dynamic(name);
      if (value !== undefined) return value;
      missing.add(name);
      return match;
    });

  const throwIfMissing = () => {
    if (missing.size === 0) return;
    const names = [...missing].join(', ');
    if (context.variablesLocked) {
      throw new ApiRequestError('VAULT_LOCKED', 'Unlock OwnShell to resolve environment variables', names);
    }
    const searched = [...new Set(scopes.map((entry) => entry.scope))];
    throw new ApiRequestError('MISSING_VARIABLES', `Unknown variables: ${names}`, names, searched);
  };

  const urlText = interpolate(input.url.trim());
  const query: Array<[string, string]> = enabledItems(input.params).map((item) => [
    interpolate(item.key),
    interpolate(item.value ?? ''),
  ]);

  const headers: Record<string, string> = {};
  for (const item of enabledItems(input.headers)) {
    const name = interpolate(item.key).trim();
    const value = interpolate(item.value ?? '');
    headers[name] = keepPlaceholders && SENSITIVE_HEADER.test(name) ? placeholderFor(value, name) : value;
  }
  // Auth secrets (also inherited ones) never leave as plain text in a placeholder export.
  const secret = (value: string, name: string) =>
    keepPlaceholders ? placeholderFor(interpolate(value), name) : interpolate(value);

  const auth = resolveAuth(input.authType, input.authConfig, context.authChain);
  let authHeaderNames: string[] | undefined;
  let authQueryNames: string[] | undefined;
  switch (auth.type) {
    case 'bearer':
      if (auth.config.token) headers['Authorization'] = `Bearer ${secret(auth.config.token, 'bearerToken')}`;
      break;
    case 'basic':
      if (auth.config.username || auth.config.password) {
        const password = auth.config.password ? secret(auth.config.password, 'basicPassword') : '';
        const credentials = `${interpolate(auth.config.username ?? '')}:${password}`;
        headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
      }
      break;
    case 'api-key':
      if (auth.config.key && auth.config.value) {
        const key = interpolate(auth.config.key);
        const value = secret(auth.config.value, 'apiKey');
        if (auth.config.addTo === 'query') {
          query.push([key, value]);
          authQueryNames = [key];
        } else {
          headers[key] = value;
          authHeaderNames = [key];
        }
      }
      break;
    case 'oauth2': {
      const prefix = auth.config.headerPrefix?.trim() || 'Bearer';
      if (keepPlaceholders) {
        headers['Authorization'] = `${prefix} {{oauthAccessToken}}`;
        break;
      }
      const resolved: ResolvedOAuth = {
        grantType: auth.config.grantType === 'authorization_code' ? 'authorization_code' : 'client_credentials',
        tokenUrl: interpolate(auth.config.tokenUrl ?? '').trim(),
        authUrl: interpolate(auth.config.authUrl ?? '').trim(),
        clientId: interpolate(auth.config.clientId ?? '').trim(),
        clientSecret: interpolate(auth.config.clientSecret ?? ''),
        scopes: interpolate(auth.config.scopes ?? '').trim(),
        audience: interpolate(auth.config.audience ?? '').trim(),
        clientAuth: auth.config.clientAuth === 'body' ? 'body' : 'basic',
      };
      // Never ask the token endpoint with an unresolved {{variable}}.
      throwIfMissing();
      const token = context.oauthToken ? await context.oauthToken(resolved, auth.sourceId) : undefined;
      headers['Authorization'] = `${prefix} ${token ?? '{{oauthAccessToken}}'}`;
      break;
    }
  }

  const sendsBody = input.method !== 'GET' && input.method !== 'HEAD';
  let body: Buffer | undefined;
  let contentType: string | undefined;
  let parts: PreparedPart[] | undefined;
  let bodyFile: string | undefined;

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
        const chunks: Buffer[] = [];
        parts = [];
        let size = 0;
        // Running budget so the 50 MB cap holds before anything is concatenated.
        const push = (...pushed: Buffer[]) => {
          for (const chunk of pushed) size += chunk.length;
          if (size > MAX_REQUEST_BODY_BYTES) {
            throw new ApiRequestError('BODY_TOO_LARGE', 'Request body exceeds the 50 MB limit');
          }
          chunks.push(...pushed);
        };
        for (const item of enabledItems<FormDataItem>(input.body)) {
          const name = escapeMultipartName(interpolate(item.key));
          if (item.type === 'file') {
            if (!item.value) continue;
            parts.push({ name: interpolate(item.key), filePath: item.value });
            const file = await context.loadFile(item.value, MAX_REQUEST_BODY_BYTES - size);
            push(
              Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${escapeMultipartName(file.name)}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
              ),
              file.data,
              Buffer.from('\r\n')
            );
          } else {
            parts.push({ name: interpolate(item.key), value: interpolate(item.value ?? '') });
            push(
              Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${interpolate(item.value ?? '')}\r\n`
              )
            );
          }
        }
        push(Buffer.from(`--${boundary}--\r\n`));
        body = Buffer.concat(chunks, size);
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
          bodyFile = file.path;
        } else if (input.body.trim()) {
          throw new ApiRequestError('FILE_ERROR', 'Select the file for the binary body again');
        }
        break;
      }
    }
  }

  throwIfMissing();

  if (body && body.length > MAX_REQUEST_BODY_BYTES) {
    throw new ApiRequestError('BODY_TOO_LARGE', 'Request body exceeds the 50 MB limit');
  }

  if (contentType && !hasHeader(headers, 'Content-Type')) headers['Content-Type'] = contentType;

  return {
    method: input.method,
    urlText,
    query,
    headers,
    body,
    parts,
    bodyFile,
    ...(authHeaderNames && { authHeaderNames }),
    ...(authQueryNames && { authQueryNames }),
  };
}
