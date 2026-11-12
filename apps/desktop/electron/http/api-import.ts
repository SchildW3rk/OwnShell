/**
 * Shared target of the Postman and OwnShell-file imports: a folder tree inserted as a
 * new top-level folder with new ids. Nothing existing is overwritten.
 */

import type {
  ApiRequestKind,
  Database,
  HttpMethod,
  RawRequestContentType,
  RequestAuthType,
  RequestBodyType,
} from '@ownshell/core';
import type { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { encryptVariables, type PlainVariable } from './api-variables';

export interface ImportRequest {
  name: string;
  method: HttpMethod;
  url: string;
  params: string;
  headers: string;
  body: string;
  body_type: RequestBodyType;
  raw_content_type: RawRequestContentType;
  auth_type: RequestAuthType;
  auth_config: string;
  variables: string;
  timeout_seconds: number | null;
  follow_redirects: number | null;
  verify_tls: number | null;
  kind?: ApiRequestKind;
  assertions?: string;
  captures?: string;
}

export interface ImportFolder {
  name: string;
  description: string | null;
  auth_type: RequestAuthType;
  auth_config: string;
  variables: PlainVariable[];
  folders: ImportFolder[];
  requests: ImportRequest[];
}

export interface ImportCounts {
  folderId: string;
  folders: number;
  requests: number;
  variables: number;
}

/** Hard limits for any import, checked before anything is written. */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ITEMS = 10_000;
export const MAX_IMPORT_DEPTH = 32;

/** Inserts `root` (and everything below it) as a new top-level folder in one transaction. */
export async function insertImportTree(
  db: Kysely<Database>,
  root: ImportFolder,
  encrypt: (value: string) => string
): Promise<ImportCounts> {
  const counts: ImportCounts = { folderId: '', folders: 0, requests: 0, variables: 0 };
  await db.transaction().execute(async (trx) => {
    const now = Date.now();
    const maxRoot = await trx
      .selectFrom('api_collections')
      .select(({ fn }) => fn.max('sort_order').as('max_sort'))
      .where('parent_id', 'is', null)
      .executeTakeFirst();

    const insertFolder = async (folder: ImportFolder, parentId: string | null, sortOrder: number) => {
      const id = uuidv4();
      await trx
        .insertInto('api_collections')
        .values({
          id,
          parent_id: parentId,
          name: folder.name.slice(0, 255) || 'Imported',
          description: folder.description,
          sort_order: sortOrder,
          auth_type: folder.auth_type,
          auth_config: folder.auth_config,
          variables: encryptVariables(folder.variables, encrypt, uuidv4),
          created_at: now,
          updated_at: now,
        })
        .execute();
      counts.folders += 1;
      counts.variables += folder.variables.length;
      for (const [index, child] of folder.folders.entries()) await insertFolder(child, id, index);
      for (const [index, request] of folder.requests.entries()) {
        await trx
          .insertInto('api_requests')
          .values({
            ...request,
            kind: request.kind ?? 'http',
            assertions: request.assertions ?? '[]',
            captures: request.captures ?? '[]',
            id: uuidv4(),
            name: request.name.slice(0, 255) || request.method,
            collection_id: id,
            network_host_id: null,
            environment_id: null,
            sort_order: index,
            created_at: now,
            updated_at: now,
            last_executed_at: null,
          })
          .execute();
        counts.requests += 1;
      }
      return id;
    };

    counts.folderId = await insertFolder(root, null, (maxRoot?.max_sort ?? -1) + 1);
  });
  return counts;
}
