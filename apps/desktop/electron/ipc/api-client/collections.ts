import {
  SettingsQueries,
  type ApiCollectionsTable,
  type ApiCollectionUpdate,
  type Database,
  type RequestAuthType,
} from '@ownshell/core';
import type { IpcMainInvokeEvent } from 'electron';
import type { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import {
  buildStoredVariables,
  GLOBAL_VARIABLES_SETTING,
  toPublicVariables,
  type VariableInput,
} from '../../http/api-variables';
import { assertSecureOAuthUrls, publicAuthConfig, storedAuthConfig } from '../../http/oauth';
import { logger } from '../../logger';
import { cryptoManager } from '../../security/crypto';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import { encryptLegacyAuthSecrets, encryptSecret } from './oauth';
import {
  collectionSchema,
  collectionUpdateArgsSchema,
  idSchema,
  noPayloadSchema,
  setVariablesSchema,
} from './schemas';

/** The renderer never gets encrypted secret values, only whether a secret is set. */
function publicCollection<
  T extends Pick<ApiCollectionsTable, 'variables' | 'auth_type' | 'auth_config'> | undefined,
>(row: T): T {
  return (
    row && {
      ...row,
      variables: JSON.stringify(toPublicVariables(row.variables)),
      auth_config: publicAuthConfig(row.auth_type, row.auth_config),
    }
  );
}

/** Replaces the variables of a folder (collectionId) or the global variables (null). */
export async function saveVariables(
  db: Kysely<Database>,
  collectionId: string | null,
  variables: VariableInput[]
): Promise<void> {
  const encrypt = (value: string) => {
    if (!cryptoManager.isUnlocked()) throw new Error('App is locked - cannot encrypt variables');
    return cryptoManager.encryptData(value);
  };
  if (collectionId) {
    const row = await db
      .selectFrom('api_collections')
      .select('variables')
      .where('id', '=', collectionId)
      .executeTakeFirst();
    if (!row) throw new Error('Folder not found');
    await db
      .updateTable('api_collections')
      .set({ variables: buildStoredVariables(variables, row.variables, encrypt, uuidv4), updated_at: Date.now() })
      .where('id', '=', collectionId)
      .execute();
    return;
  }
  const settings = new SettingsQueries(db);
  const existing = await settings.get(GLOBAL_VARIABLES_SETTING);
  await settings.set({
    key: GLOBAL_VARIABLES_SETTING,
    value: buildStoredVariables(variables, existing, encrypt, uuidv4),
    updated_at: Date.now(),
  });
}

export function registerApiCollectionHandlers(db: Kysely<Database>): void {
  safeHandle('api:collections:get-all', noPayloadSchema, async () => {
    try {
      await encryptLegacyAuthSecrets(db).catch((error) =>
        logger.warn('Failed to encrypt legacy API auth secrets', error)
      );
      const rows = await db
        .selectFrom('api_collections')
        .selectAll()
        .orderBy('sort_order', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      return rows.map(publicCollection);
    } catch (error) {
      logger.error('Failed to get API collections', error);
      throw error;
    }
  });

  safeHandle('api:collections:get-by-id', idSchema, async (_event, id) =>
    handleGetCollectionById(db, _event, id)
  );
  safeHandle('api:collections:create', collectionSchema, async (_event, data) =>
    handleCreateCollection(db, _event, data)
  );
  safeHandleArgs('api:collections:update', collectionUpdateArgsSchema, (_event, [id, data]) =>
    handleUpdateCollection(db, _event, id, data)
  );
  safeHandle('api:collections:delete', idSchema, async (_event, id) =>
    handleDeleteCollection(db, _event, id)
  );
  safeHandle('api:variables:get-global', noPayloadSchema, async () =>
    toPublicVariables(await new SettingsQueries(db).get(GLOBAL_VARIABLES_SETTING))
  );
  safeHandle('api:variables:set', setVariablesSchema, async (_event, { collectionId, variables }) => {
    await saveVariables(db, collectionId, variables);
    logger.info('API variables saved', { scope: collectionId ? 'folder' : 'global', count: variables.length });
  });
}

async function handleGetCollectionById(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  id: string
) {
  try {
    return publicCollection(
      await db.selectFrom('api_collections').selectAll().where('id', '=', id).executeTakeFirst()
    );
  } catch (error) {
    logger.error('Failed to get API collection', { id, error });
    throw error;
  }
}

async function handleCreateCollection(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  data: {
    name: string;
    parent_id?: string | null;
    description?: string | null;
    sort_order?: number;
    auth_type?: RequestAuthType;
    auth_config?: string;
  }
) {
  try {
    const now = Date.now();
    const maxSortResult = await db
      .selectFrom('api_collections')
      .select(({ fn }) => fn.max('sort_order').as('max_sort'))
      .where('parent_id', data.parent_id ? '=' : 'is', data.parent_id ?? null)
      .executeTakeFirst();

    const sortOrder = data.sort_order ?? (maxSortResult?.max_sort ?? -1) + 1;

    assertSecureOAuthUrls(data.auth_type ?? 'inherit', data.auth_config ?? '{}');
    const collection = {
      id: uuidv4(),
      parent_id: data.parent_id ?? null,
      name: data.name,
      description: data.description ?? null,
      sort_order: sortOrder,
      auth_type: data.auth_type ?? 'inherit',
      auth_config: storedAuthConfig(data.auth_type ?? 'inherit', data.auth_config ?? '{}', undefined, encryptSecret),
      variables: '[]',
      created_at: now,
      updated_at: now,
    };

    await db.insertInto('api_collections').values(collection).execute();

    logger.info('API collection created', { id: collection.id, name: collection.name });
    return publicCollection(collection);
  } catch (error) {
    logger.error('Failed to create API collection', error);
    throw error;
  }
}

async function handleUpdateCollection(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  id: string,
  data: {
    name?: string;
    parent_id?: string | null;
    description?: string | null;
    sort_order?: number;
    auth_type?: RequestAuthType;
    auth_config?: string;
  }
) {
  try {
    const update: ApiCollectionUpdate = {
      ...data,
      updated_at: Date.now(),
    };
    if (data.auth_config !== undefined || data.auth_type !== undefined) {
      const existing = await db
        .selectFrom('api_collections')
        .select(['auth_type', 'auth_config'])
        .where('id', '=', id)
        .executeTakeFirst();
      const authType = data.auth_type ?? existing?.auth_type ?? 'inherit';
      // Check the config that will be in effect, also when only the type changes.
      assertSecureOAuthUrls(authType, data.auth_config ?? existing?.auth_config ?? '{}');
      if (data.auth_config !== undefined) {
        update.auth_config = storedAuthConfig(authType, data.auth_config, existing?.auth_config, encryptSecret);
      }
    }

    await db.updateTable('api_collections').set(update).where('id', '=', id).execute();

    const updated = await db
      .selectFrom('api_collections')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    logger.info('API collection updated', { id, name: data.name });
    return publicCollection(updated);
  } catch (error) {
    logger.error('Failed to update API collection', { id, error });
    throw error;
  }
}

async function handleDeleteCollection(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  id: string
) {
  try {
    await db.deleteFrom('api_collections').where('id', '=', id).execute();
    await db.deleteFrom('api_oauth_tokens').where('owner_key', '=', `collection:${id}`).execute();
    logger.info('API collection deleted', { id });
  } catch (error) {
    logger.error('Failed to delete API collection', { id, error });
    throw error;
  }
}
