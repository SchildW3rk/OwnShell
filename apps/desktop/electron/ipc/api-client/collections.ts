import type { Database, ApiCollectionUpdate, RequestAuthType } from '@ownshell/core';
import type { IpcMainInvokeEvent } from 'electron';
import type { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import {
  collectionSchema,
  collectionUpdateArgsSchema,
  idSchema,
  noPayloadSchema,
} from './schemas';

export function registerApiCollectionHandlers(db: Kysely<Database>): void {
  safeHandle('api:collections:get-all', noPayloadSchema, async () => {
    try {
      return await db
        .selectFrom('api_collections')
        .selectAll()
        .orderBy('sort_order', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
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
}

async function handleGetCollectionById(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  id: string
) {
  try {
    return await db
      .selectFrom('api_collections')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
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

    const collection = {
      id: uuidv4(),
      parent_id: data.parent_id ?? null,
      name: data.name,
      description: data.description ?? null,
      sort_order: sortOrder,
      auth_type: data.auth_type ?? 'inherit',
      auth_config: data.auth_config ?? '{}',
      created_at: now,
      updated_at: now,
    };

    await db.insertInto('api_collections').values(collection).execute();

    logger.info('API collection created', { id: collection.id, name: collection.name });
    return collection;
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

    await db.updateTable('api_collections').set(update).where('id', '=', id).execute();

    const updated = await db
      .selectFrom('api_collections')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    logger.info('API collection updated', { id, name: data.name });
    return updated;
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
    logger.info('API collection deleted', { id });
  } catch (error) {
    logger.error('Failed to delete API collection', { id, error });
    throw error;
  }
}
