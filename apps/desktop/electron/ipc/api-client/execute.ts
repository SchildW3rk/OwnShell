import { SettingsQueries, type Database } from '@ownshell/core';
import { BrowserWindow, dialog } from 'electron';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Kysely } from 'kysely';
import { openHostStream } from '../../http/host-stream';
import { sendPreparedRequest, type HttpRequestConfig, type HttpResponse } from '../../http/http-client';
import { toCurlCommand } from '../../http/curl-export';
import {
  ApiRequestError,
  prepareRequest,
  prepareRequestWithPlaceholders,
  type AuthSource,
} from '../../http/prepare-request';
import {
  createPickedFiles,
  guessContentType,
  loadRequestFile,
  type PickedFiles,
} from '../../http/request-files';
import { logger } from '../../logger';
import { cryptoManager } from '../../security/crypto';
import { safeHandle } from '../safe-ipc';
import {
  cancelRequestSchema,
  executeRequestSchema,
  exportCurlSchema,
  noPayloadSchema,
} from './schemas';

export function registerApiExecutionHandlers(db: Kysely<Database>): void {
  const pickedFiles = createPickedFiles(new SettingsQueries(db));
  // Running sends by window + renderer-chosen id, so a window can only cancel its own.
  const running = new Map<string, AbortController>();
  safeHandle('api:requests:execute', executeRequestSchema, async (event, config) => {
    const key = config.executionId && `${event.sender.id}:${config.executionId}`;
    const controller = new AbortController();
    if (key) running.set(key, controller);
    try {
      return await handleExecuteRequest(db, pickedFiles, config, controller.signal);
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
      return { errorCode: error.code, errorDetail: error.detail };
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
}

/** Same preparation as a send; `resolveVariables` puts decrypted values into the command. */
async function exportCurl(
  db: Kysely<Database>,
  config: HttpRequestConfig,
  resolveVariables: boolean
): Promise<string> {
  const authChain =
    config.authType === 'inherit' ? await loadCollectionAuthChain(db, config.collectionId) : [];
  const options = {
    timeoutSeconds: config.timeoutSeconds,
    followRedirects: config.followRedirects,
    verifyTls: config.verifyTls,
  };
  if (!resolveVariables) {
    return toCurlCommand(await prepareRequestWithPlaceholders(config, { authChain }), options);
  }
  const { variables, locked } = config.environmentId
    ? await getDecryptedVariables(db, config.environmentId)
    : { variables: {}, locked: false };
  const prepared = await prepareRequest(config, {
    variables,
    variablesLocked: locked,
    authChain,
    // Exported by path; nothing is read.
    loadFile: async (filePath) => ({
      data: Buffer.alloc(0),
      name: path.basename(filePath),
      contentType: guessContentType(filePath),
    }),
  });
  return toCurlCommand({ ...prepared, url: prepared.url.href }, options);
}

async function getDecryptedVariables(
  db: Kysely<Database>,
  environmentId: string
): Promise<{ variables: Record<string, string>; locked: boolean }> {
  if (!cryptoManager.isUnlocked()) return { variables: {}, locked: true };

  const environment = await db
    .selectFrom('vault_environments')
    .select('variables')
    .where('id', '=', environmentId)
    .executeTakeFirst();
  if (!environment) {
    logger.warn('Environment not found for API request', { environmentId });
    return { variables: {}, locked: false };
  }

  const encryptedVars = JSON.parse(environment.variables) as Array<{
    key: string;
    value_encrypted: string;
  }>;
  const variables: Record<string, string> = {};
  for (const variable of encryptedVars) {
    try {
      variables[variable.key] = cryptoManager.decryptData(variable.value_encrypted);
    } catch {
      // Left unresolved on purpose: prepareRequest reports it as a missing variable.
      logger.error('Failed to decrypt environment variable', { key: variable.key });
    }
  }
  return { variables, locked: false };
}

/** Auth of the collection chain, nearest first, stopping at the first non-inherit entry. */
async function loadCollectionAuthChain(
  db: Kysely<Database>,
  collectionId: string | null | undefined
): Promise<AuthSource[]> {
  const chain: AuthSource[] = [];
  const seen = new Set<string>();
  let id = collectionId ?? null;
  while (id && !seen.has(id)) {
    seen.add(id);
    const row = await db
      .selectFrom('api_collections')
      .select(['parent_id', 'auth_type', 'auth_config'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) break;
    chain.push(row);
    if (row.auth_type !== 'inherit') break;
    id = row.parent_id;
  }
  return chain;
}

async function handleExecuteRequest(
  db: Kysely<Database>,
  pickedFiles: PickedFiles,
  config: HttpRequestConfig,
  signal: AbortSignal
): Promise<HttpResponse> {
  const started = performance.now();
  let host: string | undefined;
  try {
    const { variables, locked } = config.environmentId
      ? await getDecryptedVariables(db, config.environmentId)
      : { variables: {}, locked: false };
    const authChain =
      config.authType === 'inherit' ? await loadCollectionAuthChain(db, config.collectionId) : [];

    const prepared = await prepareRequest(config, {
      variables,
      variablesLocked: locked,
      authChain,
      loadFile: (filePath, maxBytes) => loadRequestFile(filePath, pickedFiles, maxBytes),
    });
    host = prepared.url.host;
    const prepareMs = performance.now() - started;

    const sent = await sendPreparedRequest(prepared, config.networkHostId, {
      openHostStream,
      timeoutMs: (config.timeoutSeconds ?? 30) * 1000,
      followRedirects: config.followRedirects,
      verifyTls: config.verifyTls,
      signal,
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
    };
  }
}
