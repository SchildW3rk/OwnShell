/**
 * OwnShell API file (`*.ownshell-api.json`): explicit, Git-friendly export/import of one
 * folder. Deterministic (fixed key order, stable ids, sorted like the sidebar, 2-space
 * indentation). Credentials in recognised fields are replaced: secret variables are
 * exported without a value; auth secrets, credential headers, credential-like query
 * params and URL user info become {{placeholders}} or are dropped (see redactUrl) and
 * file parts keep only the file name. Other literal values (bodies, plain variables)
 * are exported as is.
 */

import path from 'node:path';
import type {
  ApiCollectionsTable,
  ApiRequestsTable,
  RequestAuthType,
} from '@ownshell/core';
import { z } from 'zod';
import type { ImportFolder, ImportRequest } from './api-import';
import { MAX_IMPORT_DEPTH, MAX_IMPORT_ITEMS } from './api-import';
import { parseStoredVariables } from './api-variables';
import { ImportError, parseImportJson } from './postman-import';
import { placeholderFor, redactParam, redactUrl, SENSITIVE_HEADER } from './prepare-request';

export const OWNSHELL_API_FORMAT = 'ownshell-api';
/** Major version; a newer major is refused, additions within a major must stay optional. */
export const OWNSHELL_API_VERSION = 1;
export const OWNSHELL_API_EXTENSION = '.ownshell-api.json';

const authTypeSchema = z.enum(['none', 'bearer', 'basic', 'api-key', 'inherit']);
const kvSchema = z.object({ key: z.string(), value: z.string(), enabled: z.boolean() });
const authSchema = z.object({
  type: authTypeSchema,
  config: z.object({
    token: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    key: z.string().optional(),
    value: z.string().optional(),
    addTo: z.enum(['header', 'query']).optional(),
  }),
});
const variableSchema = z.object({
  key: z.string().max(255),
  value: z.string(),
  enabled: z.boolean(),
  secret: z.boolean(),
});
const bodySchema = z.object({
  type: z.enum(['none', 'json', 'form-data', 'form-urlencoded', 'raw', 'binary']),
  rawContentType: z.enum(['text', 'json', 'xml', 'html']),
  content: z.string().nullable(),
  items: z.array(kvSchema.extend({ type: z.enum(['text', 'file']).optional() })).nullable(),
  fileName: z.string().nullable(),
});
const requestSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string().max(4096),
  params: z.array(kvSchema),
  headers: z.array(kvSchema),
  body: bodySchema,
  auth: authSchema,
  variables: z.array(kvSchema),
  settings: z.object({
    timeoutSeconds: z.number().int().min(1).max(600).nullable(),
    followRedirects: z.boolean().nullable(),
    verifyTls: z.boolean().nullable(),
  }),
});
type RequestDoc = z.infer<typeof requestSchema>;

interface FolderDoc {
  id: string;
  name: string;
  description: string | null;
  auth: z.infer<typeof authSchema>;
  variables: Array<z.infer<typeof variableSchema>>;
  folders: FolderDoc[];
  requests: RequestDoc[];
}
const folderSchema: z.ZodType<FolderDoc> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string().min(1).max(255),
    description: z.string().nullable(),
    auth: authSchema,
    variables: z.array(variableSchema),
    folders: z.array(folderSchema),
    requests: z.array(requestSchema),
  })
);

const documentSchema = z.object({
  format: z.literal(OWNSHELL_API_FORMAT),
  version: z.literal(OWNSHELL_API_VERSION),
  folder: folderSchema,
});

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function keyValues(json: string): Array<z.infer<typeof kvSchema>> {
  const items = parseJson(json);
  return Array.isArray(items)
    ? items
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          key: String(item.key ?? ''),
          value: String(item.value ?? ''),
          enabled: item.enabled !== false,
        }))
    : [];
}

/** Fixed key order; auth secrets become placeholders like in "Copy as curl". */
function exportAuth(type: RequestAuthType, configJson: string): FolderDoc['auth'] {
  const raw = (parseJson(configJson) ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : undefined);
  const config: FolderDoc['auth']['config'] = {};
  if (type === 'bearer' && text('token')) config.token = placeholderFor(text('token')!, 'bearerToken');
  if (type === 'basic') {
    if (text('username') !== undefined) config.username = text('username');
    if (text('password')) config.password = placeholderFor(text('password')!, 'basicPassword');
  }
  if (type === 'api-key') {
    if (text('key') !== undefined) config.key = text('key');
    if (text('value')) config.value = placeholderFor(text('value')!, 'apiKey');
    config.addTo = raw.addTo === 'query' ? 'query' : 'header';
  }
  return { type, config };
}

function exportBody(request: ApiRequestsTable): RequestDoc['body'] {
  const body: RequestDoc['body'] = {
    type: request.body_type,
    rawContentType: request.raw_content_type ?? 'text',
    content: null,
    items: null,
    fileName: null,
  };
  const parsed = parseJson(request.body);
  if (request.body_type === 'form-data' && Array.isArray(parsed)) {
    body.items = parsed.map((item) => {
      const file = item?.type === 'file';
      const value = String(item?.value ?? '');
      return {
        key: String(item?.key ?? ''),
        value: file ? path.basename(value.replace(/\\/g, '/')) : value,
        enabled: item?.enabled !== false,
        type: file ? ('file' as const) : ('text' as const),
      };
    });
  } else if (request.body_type === 'form-urlencoded' && Array.isArray(parsed)) {
    body.items = keyValues(request.body);
  } else if (request.body_type === 'binary') {
    const file = (parsed ?? {}) as { name?: unknown; path?: unknown };
    const name = typeof file.name === 'string' ? file.name : typeof file.path === 'string' ? file.path : '';
    body.fileName = name ? path.basename(name.replace(/\\/g, '/')) : null;
  } else {
    body.content = request.body;
  }
  return body;
}

const flag = (value: number | null) => (value === null ? null : value !== 0);

const bySidebarOrder = <T extends { sort_order: number; created_at: number; id: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.created_at - b.created_at || a.id.localeCompare(b.id);

export function buildOwnShellApiDocument(
  rootId: string,
  collections: ApiCollectionsTable[],
  requests: ApiRequestsTable[]
): { format: string; version: number; folder: FolderDoc } {
  const exportFolder = (collection: ApiCollectionsTable, depth: number): FolderDoc => {
    if (depth > MAX_IMPORT_DEPTH) throw new Error('Folder nesting too deep');
    return {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      auth: exportAuth(collection.auth_type, collection.auth_config),
      variables: parseStoredVariables(collection.variables).map((variable) => ({
        key: variable.key,
        value: variable.secret ? '' : variable.value,
        enabled: variable.enabled,
        secret: variable.secret,
      })),
      folders: collections
        .filter((child) => child.parent_id === collection.id)
        .sort(bySidebarOrder)
        .map((child) => exportFolder(child, depth + 1)),
      requests: requests
        .filter((request) => request.collection_id === collection.id)
        .sort(bySidebarOrder)
        .map((request) => ({
          id: request.id,
          name: request.name,
          method: request.method,
          url: redactUrl(request.url),
          params: keyValues(request.params).map((param) => ({ ...param, value: redactParam(param.key, param.value) })),
          headers: keyValues(request.headers).map((header) => ({
            ...header,
            value: SENSITIVE_HEADER.test(header.key.trim())
              ? placeholderFor(header.value, header.key.trim())
              : header.value,
          })),
          body: exportBody(request),
          auth: exportAuth(request.auth_type, request.auth_config),
          variables: keyValues(request.variables),
          settings: {
            timeoutSeconds: request.timeout_seconds,
            followRedirects: flag(request.follow_redirects),
            verifyTls: flag(request.verify_tls),
          },
        })),
    };
  };
  const root = collections.find((collection) => collection.id === rootId);
  if (!root) throw new Error('Folder not found');
  return { format: OWNSHELL_API_FORMAT, version: OWNSHELL_API_VERSION, folder: exportFolder(root, 0) };
}

export function serializeOwnShellApiDocument(document: ReturnType<typeof buildOwnShellApiDocument>): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function importBody(body: RequestDoc['body']): Pick<ImportRequest, 'body' | 'body_type' | 'raw_content_type'> {
  let text = body.content ?? '';
  if (body.items) {
    text = JSON.stringify(
      body.items.map((item) => ({
        key: item.key,
        value: item.value,
        enabled: item.enabled,
        ...(body.type === 'form-data' && { type: item.type ?? 'text' }),
      }))
    );
  } else if (body.type === 'binary') {
    // Name only: the file has to be selected again before sending.
    text = body.fileName ? JSON.stringify({ name: body.fileName }) : '';
  }
  return { body: text, body_type: body.type, raw_content_type: body.rawContentType };
}

const kvJson = (items: Array<z.infer<typeof kvSchema>>) =>
  JSON.stringify(items.map(({ key, value, enabled }) => ({ key, value, enabled })));
const toFlag = (value: boolean | null) => (value === null ? null : value ? 1 : 0);

export function parseOwnShellApiFile(text: string): ImportFolder {
  const json = parseImportJson(text) as { format?: unknown; version?: unknown } | null;
  if (json?.format !== OWNSHELL_API_FORMAT) throw new ImportError('INVALID_FILE');
  if (json.version !== OWNSHELL_API_VERSION) throw new ImportError('UNSUPPORTED_VERSION');
  const parsed = documentSchema.safeParse(json);
  if (!parsed.success) throw new ImportError('INVALID_FILE');

  let items = 0;
  const importFolder = (folder: FolderDoc, depth: number): ImportFolder => {
    if (depth > MAX_IMPORT_DEPTH) throw new ImportError('TOO_MANY_ITEMS');
    items += 1 + folder.requests.length;
    if (items > MAX_IMPORT_ITEMS) throw new ImportError('TOO_MANY_ITEMS');
    return {
      name: folder.name,
      description: folder.description,
      auth_type: folder.auth.type,
      auth_config: JSON.stringify(folder.auth.config),
      variables: folder.variables.map((variable) => ({ ...variable })),
      folders: folder.folders.map((child) => importFolder(child, depth + 1)),
      requests: folder.requests.map((request) => ({
        name: request.name,
        method: request.method,
        url: request.url,
        params: kvJson(request.params),
        headers: kvJson(request.headers),
        ...importBody(request.body),
        auth_type: request.auth.type,
        auth_config: JSON.stringify(request.auth.config),
        variables: kvJson(request.variables),
        timeout_seconds: request.settings.timeoutSeconds,
        follow_redirects: toFlag(request.settings.followRedirects),
        verify_tls: toFlag(request.settings.verifyTls),
      })),
    };
  };
  return importFolder(parsed.data.folder, 0);
}
