/**
 * Postman Collection v2.0 / v2.1 and Postman environment import.
 *
 * Pure: takes the file text, returns an ImportFolder tree (collection) or plain
 * variables (environment). Scripts, unsupported auth and file contents are not
 * imported; they are counted so the UI can say what was skipped.
 */

import type { HttpMethod, RawRequestContentType, RequestAuthType, RequestBodyType } from '@ownshell/core';
import { z } from 'zod';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_DEPTH,
  MAX_IMPORT_ITEMS,
  type ImportFolder,
  type ImportRequest,
} from './api-import';
import type { PlainVariable } from './api-variables';

export type ImportErrorCode =
  | 'TOO_LARGE'
  | 'INVALID_JSON'
  | 'NOT_POSTMAN'
  | 'UNSUPPORTED_VERSION'
  | 'TOO_MANY_ITEMS'
  | 'INVALID_FILE';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code);
    this.name = 'ImportError';
  }
}

/** Skipped or changed features, counted for the summary dialog. */
export type ImportWarningCode =
  | 'SCRIPTS'
  | 'AUTH_UNSUPPORTED'
  | 'FILE_PARTS'
  | 'BINARY_FILE'
  | 'METHOD_UNSUPPORTED'
  | 'BODY_UNSUPPORTED';

export interface PostmanCollectionImport {
  kind: 'collection';
  tree: ImportFolder;
  warnings: Partial<Record<ImportWarningCode, number>>;
}

export interface PostmanEnvironmentImport {
  kind: 'environment';
  name: string;
  variables: Array<{ key: string; value: string }>;
  /** Keys that a vault environment cannot hold (invalid name, disabled, duplicate). */
  skipped: string[];
}

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

const kvSchema = z.object({
  key: z.string().nullable().optional(),
  value: z.unknown().optional(),
  disabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
  type: z.string().optional(),
  src: z.unknown().optional(),
});
type PostmanKv = z.infer<typeof kvSchema>;

const authSchema = z
  .object({ type: z.string() })
  .catchall(z.unknown());
type PostmanAuth = z.infer<typeof authSchema>;

const pathSegment = z.union([z.string(), z.object({ value: z.string().optional() }).passthrough()]);
const urlSchema = z.union([
  z.string(),
  z.object({
    raw: z.string().optional(),
    protocol: z.string().optional(),
    host: z.union([z.string(), z.array(z.string())]).optional(),
    port: z.string().optional(),
    path: z.union([z.string(), z.array(pathSegment)]).optional(),
    query: z.array(kvSchema).nullable().optional(),
  }),
]);

const bodySchema = z.object({
  mode: z.string().optional(),
  raw: z.string().optional(),
  urlencoded: z.array(kvSchema).optional(),
  formdata: z.array(kvSchema).optional(),
  graphql: z.object({ query: z.string().optional(), variables: z.unknown().optional() }).optional(),
  options: z.object({ raw: z.object({ language: z.string().optional() }).optional() }).optional(),
});

const requestSchema = z.union([
  z.string(),
  z.object({
    method: z.string().optional(),
    url: urlSchema.optional(),
    header: z.union([z.array(kvSchema), z.string()]).optional(),
    body: bodySchema.nullable().optional(),
    auth: authSchema.nullable().optional(),
  }),
]);

const eventSchema = z
  .array(
    z.object({
      listen: z.string().optional(),
      script: z.object({ exec: z.union([z.array(z.string()), z.string()]).optional() }).optional(),
    })
  )
  .optional();

const descriptionSchema = z
  .union([z.string(), z.object({ content: z.string().optional() }).passthrough()])
  .nullable()
  .optional();

interface PostmanItem {
  name?: string;
  description?: z.infer<typeof descriptionSchema>;
  item?: PostmanItem[];
  request?: z.infer<typeof requestSchema>;
  auth?: PostmanAuth | null;
  event?: z.infer<typeof eventSchema>;
  variable?: PostmanKv[];
}

const itemSchema: z.ZodType<PostmanItem> = z.lazy(() =>
  z.object({
    name: z.string().optional(),
    description: descriptionSchema,
    item: z.array(itemSchema).optional(),
    request: requestSchema.optional(),
    auth: authSchema.nullable().optional(),
    event: eventSchema,
    variable: z.array(kvSchema).optional(),
  })
);

const collectionSchema = z.object({
  info: z.object({
    name: z.string(),
    schema: z.string().optional(),
    description: descriptionSchema,
  }),
  item: z.array(itemSchema),
  auth: authSchema.nullable().optional(),
  event: eventSchema,
  variable: z.array(kvSchema).optional(),
});

const environmentSchema = z.object({
  name: z.string().optional(),
  values: z.array(kvSchema),
});

const str = (value: unknown): string =>
  value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);

// Postman's dynamic variables that have an OwnShell equivalent.
const fixDynamic = (text: string): string => text.replace(/\{\{\s*\$(guid|randomUUID)\s*\}\}/g, '{{$uuid}}');

const description = (value: z.infer<typeof descriptionSchema>): string | null =>
  !value ? null : typeof value === 'string' ? value : value.content ?? null;

function keyValues(items: PostmanKv[] | null | undefined): string {
  return JSON.stringify(
    (items ?? [])
      .filter((item) => item.key)
      .map((item) => ({
        key: fixDynamic(item.key ?? ''),
        value: fixDynamic(str(item.value)),
        enabled: item.disabled !== true && item.enabled !== false,
      }))
  );
}

/** v2.1 stores auth parameters as [{ key, value }], v2.0 as an object. */
function authParams(auth: PostmanAuth): Record<string, string> {
  const raw = auth[auth.type];
  const params: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const entry of raw as Array<{ key?: unknown; value?: unknown }>) {
      if (typeof entry?.key === 'string') params[entry.key] = fixDynamic(str(entry.value));
    }
  } else if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) params[key] = fixDynamic(str(value));
  }
  return params;
}

function parseHeaders(header: PostmanKv[] | string | undefined): string {
  if (typeof header !== 'string') return keyValues(header);
  const items = header
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(':');
      return separator < 0
        ? { key: line, value: '' }
        : { key: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
    });
  return keyValues(items);
}

const RAW_LANGUAGES: Record<string, RawRequestContentType> = { xml: 'xml', html: 'html', text: 'text' };

function fileName(src: unknown): string {
  const first = Array.isArray(src) ? src[0] : src;
  return typeof first === 'string' ? first.split(/[\\/]/).pop() ?? '' : '';
}

class PostmanMapper {
  readonly warnings: Partial<Record<ImportWarningCode, number>> = {};
  private items = 0;

  warn(code: ImportWarningCode, count = 1): void {
    if (count > 0) this.warnings[code] = (this.warnings[code] ?? 0) + count;
  }

  countScripts(events: z.infer<typeof eventSchema>): void {
    const scripts = (events ?? []).filter((event) => {
      const exec = event.script?.exec;
      return (Array.isArray(exec) ? exec.join('\n') : exec ?? '').trim() !== '';
    });
    this.warn('SCRIPTS', scripts.length);
  }

  /** Absent auth means "inherit from parent" in Postman. */
  auth(auth: PostmanAuth | null | undefined): { auth_type: RequestAuthType; auth_config: string } {
    if (!auth) return { auth_type: 'inherit', auth_config: '{}' };
    const params = authParams(auth);
    switch (auth.type) {
      case 'noauth':
        return { auth_type: 'none', auth_config: '{}' };
      case 'inherit':
        return { auth_type: 'inherit', auth_config: '{}' };
      case 'bearer':
        return { auth_type: 'bearer', auth_config: JSON.stringify({ token: params.token ?? '' }) };
      case 'basic':
        return {
          auth_type: 'basic',
          auth_config: JSON.stringify({ username: params.username ?? '', password: params.password ?? '' }),
        };
      case 'apikey':
        return {
          auth_type: 'api-key',
          auth_config: JSON.stringify({
            key: params.key ?? '',
            value: params.value ?? '',
            addTo: params.in === 'query' ? 'query' : 'header',
          }),
        };
      default:
        this.warn('AUTH_UNSUPPORTED');
        return { auth_type: 'none', auth_config: '{}' };
    }
  }

  variables(items: PostmanKv[] | undefined): PlainVariable[] {
    return (items ?? [])
      .filter((item) => item.key)
      .map((item) => ({
        key: item.key ?? '',
        value: fixDynamic(str(item.value)),
        enabled: item.disabled !== true,
        secret: item.type === 'secret',
      }));
  }

  folder(
    name: string,
    source: { description?: z.infer<typeof descriptionSchema>; item?: PostmanItem[]; auth?: PostmanAuth | null; event?: z.infer<typeof eventSchema>; variable?: PostmanKv[] },
    depth: number
  ): ImportFolder {
    if (depth > MAX_IMPORT_DEPTH) throw new ImportError('TOO_MANY_ITEMS');
    this.countScripts(source.event);
    const folder: ImportFolder = {
      name,
      description: description(source.description),
      ...this.auth(source.auth),
      variables: this.variables(source.variable),
      folders: [],
      requests: [],
    };
    for (const item of source.item ?? []) {
      if (++this.items > MAX_IMPORT_ITEMS) throw new ImportError('TOO_MANY_ITEMS');
      if (item.item) {
        folder.folders.push(this.folder(item.name || 'Folder', item, depth + 1));
      } else if (item.request !== undefined) {
        this.countScripts(item.event);
        const request = this.request(item.name, item.request);
        if (request) folder.requests.push(request);
      }
    }
    return folder;
  }

  request(name: string | undefined, source: z.infer<typeof requestSchema>): ImportRequest | null {
    const request = typeof source === 'string' ? { url: source } : source;
    const method = (('method' in request && request.method) || 'GET').toUpperCase() as HttpMethod;
    if (!METHODS.includes(method)) {
      this.warn('METHOD_UNSUPPORTED');
      return null;
    }
    const { url, params } = this.url(request.url);
    const body = this.body('body' in request ? request.body : undefined);
    return {
      name: name || `${method} ${url}`,
      method,
      url,
      params,
      headers: parseHeaders('header' in request ? request.header : undefined),
      ...body,
      ...this.auth('auth' in request ? request.auth : undefined),
      variables: '[]',
      timeout_seconds: null,
      follow_redirects: null,
      verify_tls: null,
    };
  }

  /** The query goes to the params table (disabled entries stay disabled), the rest to the URL. */
  url(source: z.infer<typeof urlSchema> | undefined): { url: string; params: string } {
    if (!source) return { url: '', params: '[]' };
    if (typeof source === 'string') return { url: fixDynamic(source), params: '[]' };
    let base = source.raw;
    if (base === undefined) {
      const host = Array.isArray(source.host) ? source.host.join('.') : source.host ?? '';
      const segments = Array.isArray(source.path)
        ? source.path.map((segment) => (typeof segment === 'string' ? segment : segment.value ?? ''))
        : source.path ? [source.path] : [];
      base = `${source.protocol ? `${source.protocol}://` : ''}${host}${source.port ? `:${source.port}` : ''}${
        segments.length ? `/${segments.join('/')}` : ''
      }`;
    }
    if (source.query?.length) base = base.split('?')[0];
    return { url: fixDynamic(base), params: keyValues(source.query) };
  }

  body(
    source: z.infer<typeof bodySchema> | null | undefined
  ): Pick<ImportRequest, 'body' | 'body_type' | 'raw_content_type'> {
    const none = { body: '', body_type: 'none' as RequestBodyType, raw_content_type: 'text' as RawRequestContentType };
    if (!source?.mode) return none;
    switch (source.mode) {
      case 'raw': {
        const language = source.options?.raw?.language ?? 'text';
        const body = fixDynamic(source.raw ?? '');
        if (language === 'json') return { body, body_type: 'json', raw_content_type: 'json' };
        return { body, body_type: 'raw', raw_content_type: RAW_LANGUAGES[language] ?? 'text' };
      }
      case 'urlencoded':
        return { ...none, body: keyValues(source.urlencoded), body_type: 'form-urlencoded' };
      case 'formdata': {
        const items = (source.formdata ?? []).filter((item) => item.key);
        const files = items.filter((item) => item.type === 'file');
        this.warn('FILE_PARTS', files.length);
        return {
          ...none,
          body_type: 'form-data',
          // File parts keep only the name; the file must be selected again before sending.
          body: JSON.stringify(
            items.map((item) => ({
              key: fixDynamic(item.key ?? ''),
              value: item.type === 'file' ? fileName(item.src) : fixDynamic(str(item.value)),
              enabled: item.disabled !== true,
              type: item.type === 'file' ? 'file' : 'text',
            }))
          ),
        };
      }
      case 'file':
        this.warn('BINARY_FILE');
        return { ...none, body_type: 'binary' };
      case 'graphql': {
        const raw = source.graphql?.variables;
        // Variables stay text, so unquoted {{placeholders}} in them survive the import.
        const variables = typeof raw === 'string' ? raw : raw === undefined ? '' : JSON.stringify(raw, null, 2);
        return {
          body: fixDynamic(JSON.stringify({ query: source.graphql?.query ?? '', variables })),
          body_type: 'graphql',
          raw_content_type: 'json',
        };
      }
      case 'none':
        return none;
      default:
        this.warn('BODY_UNSUPPORTED');
        return none;
    }
  }
}

/** JSON nesting allowed: two levels per folder (`item: [{…}]`) plus room inside a request. */
const MAX_JSON_DEPTH = 2 * MAX_IMPORT_DEPTH + 16;
const MAX_JSON_NODES = 1_000_000;
const MAX_JSON_STRING = 1024 * 1024;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Iterative (explicit stack) bounds check, run before the recursive zod schemas so a
 * deeply nested file is refused instead of overflowing the main-process stack.
 */
export function assertImportShape(json: unknown): void {
  const stack: Array<[unknown, number]> = [[json, 0]];
  let nodes = 0;
  while (stack.length > 0) {
    const [value, depth] = stack.pop()!;
    if (++nodes > MAX_JSON_NODES) throw new ImportError('TOO_MANY_ITEMS');
    if (typeof value === 'string') {
      if (value.length > MAX_JSON_STRING) throw new ImportError('TOO_LARGE');
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    if (depth >= MAX_JSON_DEPTH) throw new ImportError('TOO_MANY_ITEMS');
    if (Array.isArray(value)) {
      for (const child of value) stack.push([child, depth + 1]);
      continue;
    }
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key) || key.length > MAX_JSON_STRING) throw new ImportError('INVALID_FILE');
      stack.push([child, depth + 1]);
    }
  }
}

/** Size limit, JSON.parse and the bounds check shared by the Postman and OwnShell imports. */
export function parseImportJson(text: string): unknown {
  if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) throw new ImportError('TOO_LARGE');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError('INVALID_JSON');
  }
  assertImportShape(json);
  return json;
}

export function parsePostmanFile(text: string): PostmanCollectionImport | PostmanEnvironmentImport {
  const json = parseImportJson(text);
  if (json && typeof json === 'object' && 'values' in json && !('item' in json)) {
    return parsePostmanEnvironment(json);
  }
  const info = (json as { info?: { schema?: unknown } } | null)?.info;
  if (!info) throw new ImportError('NOT_POSTMAN');
  if (typeof info.schema === 'string' && !/\/v2\.[01]\.\d+\//.test(info.schema)) {
    throw new ImportError('UNSUPPORTED_VERSION');
  }
  const parsed = collectionSchema.safeParse(json);
  if (!parsed.success) throw new ImportError('INVALID_FILE');
  const mapper = new PostmanMapper();
  const tree = mapper.folder(parsed.data.info.name || 'Postman', {
    ...parsed.data,
    description: parsed.data.info.description,
  }, 0);
  return { kind: 'collection', tree, warnings: mapper.warnings };
}

function parsePostmanEnvironment(json: unknown): PostmanEnvironmentImport {
  const parsed = environmentSchema.safeParse(json);
  if (!parsed.success) throw new ImportError('INVALID_FILE');
  if (parsed.data.values.length > 1000) throw new ImportError('TOO_MANY_ITEMS');
  const variables: Array<{ key: string; value: string }> = [];
  const skipped: string[] = [];
  for (const item of parsed.data.values) {
    const key = item.key ?? '';
    if (!ENV_KEY.test(key) || item.enabled === false || item.disabled === true || variables.some((v) => v.key === key)) {
      if (key) skipped.push(key);
      continue;
    }
    variables.push({ key, value: str(item.value) });
  }
  return { kind: 'environment', name: parsed.data.name || 'Postman', variables, skipped };
}
