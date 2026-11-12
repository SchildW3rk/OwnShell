/**
 * What a send needs besides the request itself: the folder chain (auth inheritance,
 * variables), every variable scope in lookup order, and the history entry afterwards.
 */

import { SettingsQueries, type ApiCollectionsTable, type Database } from '@ownshell/core';
import type { Kysely } from 'kysely';
import path from 'node:path';
import { recordHistory } from '../../http/api-history';
import { GLOBAL_VARIABLES_SETTING, resolveVariableMap } from '../../http/api-variables';
import { toCurlCommand } from '../../http/curl-export';
import { AUTH_SECRET_FIELDS, revealAuthSecrets } from '../../http/oauth';
import {
  ApiRequestError,
  prepareRequest,
  prepareRequestWithPlaceholders,
  resolveAuth,
  type VariableScope,
} from '../../http/prepare-request';
import { guessContentType } from '../../http/request-files';
import type { HttpRequestConfig, HttpResponse } from '../../http/types';
import { logger } from '../../logger';
import { cryptoManager } from '../../security/crypto';

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

export interface ChainEntry {
  id: string;
  parent_id: string | null;
  auth_type: ApiCollectionsTable['auth_type'];
  auth_config: string;
  variables: string;
}

/** The folder chain up to the top-level folder, nearest first (auth inheritance and variables). */
export async function loadCollectionChain(
  db: Kysely<Database>,
  collectionId: string | null | undefined
): Promise<ChainEntry[]> {
  const chain: ChainEntry[] = [];
  const seen = new Set<string>();
  let id = collectionId ?? null;
  while (id && !seen.has(id)) {
    seen.add(id);
    const row = await db
      .selectFrom('api_collections')
      .select(['id', 'parent_id', 'auth_type', 'auth_config', 'variables'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) break;
    chain.push(row);
    id = row.parent_id;
  }
  return chain;
}

function requestVariables(json: string | undefined): Record<string, string> {
  const variables: Record<string, string> = Object.create(null);
  try {
    const items = JSON.parse(json || '[]') as Array<{ key?: unknown; value?: unknown; enabled?: unknown }>;
    for (const item of Array.isArray(items) ? items : []) {
      if (item?.enabled === false || typeof item?.key !== 'string' || !item.key.trim()) continue;
      variables[item.key.trim()] = typeof item.value === 'string' ? item.value : '';
    }
  } catch {
    // Invalid JSON: no request variables.
  }
  return variables;
}

/** Owner of a request-level auth config: the request, or a folder edited in its auth dialog. */
export interface AuthOwner {
  type: 'request' | 'collection';
  id: string;
}

export const ownerKey = (owner: AuthOwner) => `${owner.type}:${owner.id}`;

/**
 * Puts the decrypted auth secret (OAuth client secret, bearer token, basic password, API key)
 * into the auth config that a send will use (the request's own, or the folder it inherits from).
 * Main process only.
 */
export async function revealAuthSecret(
  db: Kysely<Database>,
  config: Pick<HttpRequestConfig, 'authType' | 'authConfig'>,
  chain: ChainEntry[],
  owner: AuthOwner | null,
  /** Placeholder export: no decryption, any literal becomes `{{name}}` there. */
  placeholdersOnly = false
): Promise<{ authConfig: string; chain: ChainEntry[] }> {
  const auth = resolveAuth(config.authType, config.authConfig, chain);
  const field = AUTH_SECRET_FIELDS[auth.type as keyof typeof AUTH_SECRET_FIELDS];
  if (!field) return { authConfig: config.authConfig, chain };
  const decrypt = (value: string) => {
    if (placeholdersOnly) return 'stored-secret';
    if (!cryptoManager.isUnlocked()) {
      throw new ApiRequestError('VAULT_LOCKED', 'Unlock OwnShell to use the stored auth secret', field);
    }
    return cryptoManager.decryptData(value);
  };
  if (auth.sourceId) {
    return {
      authConfig: config.authConfig,
      chain: chain.map((entry) =>
        entry.id === auth.sourceId
          ? { ...entry, auth_config: revealAuthSecrets(entry.auth_config, entry.auth_config, decrypt, [field]) }
          : entry
      ),
    };
  }
  const stored = !owner
    ? undefined
    : owner.type === 'request'
      ? await db.selectFrom('api_requests').select('auth_config').where('id', '=', owner.id).executeTakeFirst()
      : await db.selectFrom('api_collections').select('auth_config').where('id', '=', owner.id).executeTakeFirst();
  return { authConfig: revealAuthSecrets(config.authConfig, stored?.auth_config, decrypt, [field]), chain };
}

/** Every variable scope in lookup order (see VariableScopeName for the precedence). */
export async function loadVariableScopes(
  db: Kysely<Database>,
  config: HttpRequestConfig,
  chain: ChainEntry[]
): Promise<{ scopes: VariableScope[]; locked: boolean }> {
  const decrypt = cryptoManager.isUnlocked() ? (value: string) => cryptoManager.decryptData(value) : null;
  let locked = false;
  const fromJson = (json: string | null | undefined) => {
    const result = resolveVariableMap(json, decrypt);
    locked ||= result.locked;
    return result.variables;
  };
  const scopes: VariableScope[] = [{ scope: 'request', variables: requestVariables(config.variables) }];
  chain.forEach((entry, index) =>
    scopes.push({ scope: index === chain.length - 1 ? 'collection' : 'folder', variables: fromJson(entry.variables) })
  );
  if (config.environmentId) {
    const environment = await getDecryptedVariables(db, config.environmentId);
    locked ||= environment.locked;
    scopes.push({ scope: 'environment', variables: environment.variables });
  }
  const globals = await new SettingsQueries(db).get(GLOBAL_VARIABLES_SETTING);
  scopes.push({ scope: 'global', variables: fromJson(globals) });
  return { scopes, locked };
}

/** Records the send with the {{placeholder}} URL template (never resolved values). */
export async function saveHistory(db: Kysely<Database>, config: HttpRequestConfig, response: HttpResponse) {
  let templateUrl = config.url;
  try {
    const revealed = await revealForExport(db, config, true);
    templateUrl = (await prepareRequestWithPlaceholders(revealed.config, { authChain: revealed.chain })).url;
  } catch {
    // Keep the URL as typed; redactUrl still drops user info and hides credential-like query values.
  }
  await recordHistory(db, {
    requestId: config.requestId ?? null,
    method: config.method,
    templateUrl,
    status: response.status,
    durationMs: response.time,
    responseSize: response.size,
  });
}

async function revealForExport(db: Kysely<Database>, config: HttpRequestConfig, placeholdersOnly: boolean) {
  const owner = config.requestId ? ({ type: 'request', id: config.requestId } as const) : null;
  const chain = await loadCollectionChain(db, config.collectionId);
  const revealed = await revealAuthSecret(db, config, chain, owner, placeholdersOnly);
  return { config: { ...config, authConfig: revealed.authConfig }, chain: revealed.chain };
}

/**
 * Same preparation as a send; `resolveVariables` puts decrypted values (and the stored auth
 * secret) into the command, otherwise the auth secret is `{{bearerToken}}` etc.
 * OAuth always stays `{{oauthAccessToken}}`: no cached token ever leaves through an export.
 */
export async function exportCurl(
  db: Kysely<Database>,
  config: HttpRequestConfig,
  resolveVariables: boolean
): Promise<string> {
  const { config: revealed, chain } = await revealForExport(db, config, !resolveVariables);
  const options = {
    timeoutSeconds: config.timeoutSeconds,
    followRedirects: config.followRedirects,
    verifyTls: config.verifyTls,
  };
  if (!resolveVariables) {
    return toCurlCommand(await prepareRequestWithPlaceholders(revealed, { authChain: chain }), options);
  }
  const { scopes, locked } = await loadVariableScopes(db, config, chain);
  const prepared = await prepareRequest(revealed, {
    scopes,
    variablesLocked: locked,
    authChain: chain,
    // Exported by path; nothing is read.
    loadFile: async (filePath) => ({
      data: Buffer.alloc(0),
      name: path.basename(filePath),
      contentType: guessContentType(filePath),
    }),
  });
  return toCurlCommand({ ...prepared, url: prepared.url.href }, options);
}
