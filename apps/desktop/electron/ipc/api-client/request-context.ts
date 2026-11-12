/**
 * What a send needs besides the request itself: the folder chain (auth inheritance,
 * variables), every variable scope in lookup order, and the history entry afterwards.
 */

import { SettingsQueries, type ApiCollectionsTable, type Database } from '@ownshell/core';
import type { Kysely } from 'kysely';
import { recordHistory } from '../../http/api-history';
import { GLOBAL_VARIABLES_SETTING, resolveVariableMap } from '../../http/api-variables';
import { prepareRequestWithPlaceholders, type VariableScope } from '../../http/prepare-request';
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

interface ChainEntry {
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
      .select(['parent_id', 'auth_type', 'auth_config', 'variables'])
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
    const chain = await loadCollectionChain(db, config.collectionId);
    templateUrl = (await prepareRequestWithPlaceholders(config, { authChain: chain })).url;
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
