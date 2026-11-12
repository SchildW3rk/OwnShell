import type {
  ApiRequestUpdate,
  Database,
  HttpMethod,
  RawRequestContentType,
  RequestAuthType,
  RequestBodyType,
} from '@ownshell/core';
import type { IpcMainInvokeEvent } from 'electron';
import type { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import {
  collectionIdSchema,
  idSchema,
  noPayloadSchema,
  reorderSchema,
  requestSchema,
  requestUpdateArgsSchema,
} from './schemas';

export function registerApiRequestHandlers(db: Kysely<Database>): void {
  safeHandle('api:requests:get-all', noPayloadSchema, async () => {
    try {
      return await db
        .selectFrom('api_requests')
        .selectAll()
        .orderBy('sort_order', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
    } catch (error) {
      logger.error('Failed to get API requests', error);
      throw error;
    }
  });

  safeHandle('api:requests:get-by-id', idSchema, async (_event, id) =>
    handleGetRequestById(db, _event, id)
  );
  safeHandle('api:requests:get-by-collection', collectionIdSchema, async (_event, collectionId) =>
    handleGetRequestsByCollection(db, _event, collectionId)
  );
  safeHandle('api:requests:create', requestSchema, async (_event, data) =>
    handleCreateRequest(db, _event, data)
  );
  safeHandleArgs('api:requests:update', requestUpdateArgsSchema, (_event, [id, data]) =>
    handleUpdateRequest(db, _event, id, data)
  );
  safeHandle('api:requests:delete', idSchema, async (_event, id) =>
    handleDeleteRequest(db, _event, id)
  );
  safeHandle('api:requests:duplicate', idSchema, async (_event, id) =>
    handleDuplicateRequest(db, _event, id)
  );
  safeHandle('api:items:reorder', reorderSchema, (_event, changes) => saveSortOrders(db, changes));
}

/** All new positions in one transaction: a failure leaves the previous order intact. */
export async function saveSortOrders(
  db: Kysely<Database>,
  changes: {
    collections: Array<{ id: string; sort_order: number }>;
    requests: Array<{ id: string; sort_order: number }>;
  }
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // One reorder moves siblings: every id must exist and share the same parent folder.
    const parents = new Set<string | null>();
    for (const { id } of changes.collections) {
      const row = await trx.selectFrom('api_collections').select('parent_id').where('id', '=', id).executeTakeFirst();
      if (!row) throw new Error('Unknown folder in reorder');
      parents.add(row.parent_id);
    }
    for (const { id } of changes.requests) {
      const row = await trx.selectFrom('api_requests').select('collection_id').where('id', '=', id).executeTakeFirst();
      if (!row) throw new Error('Unknown request in reorder');
      parents.add(row.collection_id);
    }
    if (parents.size > 1) throw new Error('Reorder items must share one parent folder');
    for (const { id, sort_order } of changes.collections) {
      await trx.updateTable('api_collections').set({ sort_order }).where('id', '=', id).execute();
    }
    for (const { id, sort_order } of changes.requests) {
      await trx.updateTable('api_requests').set({ sort_order }).where('id', '=', id).execute();
    }
  });
}

async function handleGetRequestById(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  id: string
) {
  try {
    return await db.selectFrom('api_requests').selectAll().where('id', '=', id).executeTakeFirst();
  } catch (error) {
    logger.error('Failed to get API request', { id, error });
    throw error;
  }
}

async function handleGetRequestsByCollection(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  collectionId: string | null
) {
  try {
    let query = db.selectFrom('api_requests').selectAll();

    if (collectionId === null) {
      query = query.where('collection_id', 'is', null);
    } else {
      query = query.where('collection_id', '=', collectionId);
    }

    return await query.orderBy('sort_order', 'asc').orderBy('created_at', 'asc').execute();
  } catch (error) {
    logger.error('Failed to get API requests by collection', { collectionId, error });
    throw error;
  }
}

async function handleCreateRequest(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  data: RequestInput
) {
  try {
    const now = Date.now();
    const maxSortResult = await db
      .selectFrom('api_requests')
      .select(({ fn }) => fn.max('sort_order').as('max_sort'))
      .where('collection_id', data.collection_id ? '=' : 'is', data.collection_id ?? null)
      .executeTakeFirst();

    const sortOrder = data.sort_order ?? (maxSortResult?.max_sort ?? -1) + 1;

    const request = {
      id: uuidv4(),
      collection_id: data.collection_id ?? null,
      name: data.name,
      method: data.method ?? 'GET',
      url: data.url ?? '',
      params: data.params ?? '[]',
      headers: data.headers ?? '[]',
      body: data.body ?? '',
      body_type: data.body_type ?? 'none',
      raw_content_type: data.raw_content_type ?? 'text',
      auth_type: data.auth_type ?? 'none',
      auth_config: data.auth_config ?? '{}',
      network_host_id: data.network_host_id ?? null,
      environment_id: data.environment_id ?? null,
      sort_order: sortOrder,
      timeout_seconds: data.timeout_seconds ?? null,
      follow_redirects: data.follow_redirects ?? null,
      verify_tls: data.verify_tls ?? null,
      created_at: now,
      updated_at: now,
      last_executed_at: null,
    };

    await db.insertInto('api_requests').values(request).execute();

    logger.info('API request created', {
      id: request.id,
      name: request.name,
      method: request.method,
    });
    return request;
  } catch (error) {
    logger.error('Failed to create API request', error);
    throw error;
  }
}

async function handleUpdateRequest(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  id: string,
  data: RequestUpdateInput
) {
  try {
    const update: ApiRequestUpdate = {
      ...data,
      updated_at: Date.now(),
    };

    await db.updateTable('api_requests').set(update).where('id', '=', id).execute();

    const updated = await db
      .selectFrom('api_requests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    logger.info('API request updated', { id, name: data.name, method: data.method });
    return updated;
  } catch (error) {
    logger.error('Failed to update API request', { id, error });
    throw error;
  }
}

async function handleDeleteRequest(db: Kysely<Database>, _event: IpcMainInvokeEvent, id: string) {
  try {
    await db.deleteFrom('api_requests').where('id', '=', id).execute();
    logger.info('API request deleted', { id });
  } catch (error) {
    logger.error('Failed to delete API request', { id, error });
    throw error;
  }
}

async function handleDuplicateRequest(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  id: string
) {
  try {
    const original = await db
      .selectFrom('api_requests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!original) {
      throw new Error('Request not found');
    }

    const now = Date.now();
    const maxSortResult = await db
      .selectFrom('api_requests')
      .select(({ fn }) => fn.max('sort_order').as('max_sort'))
      .where('collection_id', original.collection_id ? '=' : 'is', original.collection_id)
      .executeTakeFirst();

    const sortOrder = (maxSortResult?.max_sort ?? -1) + 1;

    const duplicate = {
      id: uuidv4(),
      collection_id: original.collection_id,
      name: `${original.name} (Copy)`,
      method: original.method,
      url: original.url,
      params: original.params,
      headers: original.headers,
      body: original.body,
      body_type: original.body_type,
      raw_content_type: original.raw_content_type,
      auth_type: original.auth_type,
      auth_config: original.auth_config,
      network_host_id: original.network_host_id,
      environment_id: original.environment_id,
      sort_order: sortOrder,
      timeout_seconds: original.timeout_seconds,
      follow_redirects: original.follow_redirects,
      verify_tls: original.verify_tls,
      created_at: now,
      updated_at: now,
      last_executed_at: null,
    };

    await db.insertInto('api_requests').values(duplicate).execute();

    logger.info('API request duplicated', {
      originalId: id,
      newId: duplicate.id,
      name: duplicate.name,
    });
    return duplicate;
  } catch (error) {
    logger.error('Failed to duplicate API request', { id, error });
    throw error;
  }
}

interface RequestInput {
  name: string;
  collection_id?: string | null;
  method?: HttpMethod;
  url?: string;
  params?: string;
  headers?: string;
  body?: string;
  body_type?: RequestBodyType;
  raw_content_type?: RawRequestContentType;
  auth_type?: RequestAuthType;
  auth_config?: string;
  network_host_id?: string | null;
  environment_id?: string | null;
  sort_order?: number;
  timeout_seconds?: number | null;
  follow_redirects?: 0 | 1 | null;
  verify_tls?: 0 | 1 | null;
}

interface RequestUpdateInput extends Partial<RequestInput> {
  last_executed_at?: number | null;
}
