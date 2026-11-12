/**
 * Request history and explicit file import/export (Postman, OwnShell API file).
 * Files are picked with a main-process dialog and parsed here; the renderer only gets
 * summaries (and, for a Postman environment, the variables to create a vault environment).
 */

import type { Database } from '@ownshell/core';
import { BrowserWindow, dialog, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import type { Kysely } from 'kysely';
import { insertImportTree, MAX_IMPORT_BYTES } from '../../http/api-import';
import {
  buildOwnShellApiDocument,
  OWNSHELL_API_EXTENSION,
  parseOwnShellApiFile,
  serializeOwnShellApiDocument,
} from '../../http/ownshell-api-format';
import { ImportError, parsePostmanFile } from '../../http/postman-import';
import { logger } from '../../logger';
import { cryptoManager } from '../../security/crypto';
import { safeHandle } from '../safe-ipc';
import { idSchema, noPayloadSchema } from './schemas';

function encrypt(value: string): string {
  if (!cryptoManager.isUnlocked()) throw new Error('App is locked - cannot encrypt variables');
  return cryptoManager.encryptData(value);
}

async function pickFile(event: IpcMainInvokeEvent, filters: OpenDialogOptions['filters']): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = { properties: ['openFile'], filters };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
}

/** Bounded read: the size is checked before the file is loaded. */
async function readImportFile(filePath: string): Promise<string> {
  if ((await stat(filePath)).size > MAX_IMPORT_BYTES) throw new ImportError('TOO_LARGE');
  return readFile(filePath, 'utf8');
}

/** Import failures the UI can translate; anything else is rethrown. */
function importErrorResult(error: unknown) {
  if (error instanceof ImportError) return { errorCode: error.code };
  throw error;
}

export function registerApiTransferHandlers(db: Kysely<Database>): void {
  safeHandle('api:history:list', noPayloadSchema, () =>
    db.selectFrom('api_request_history').selectAll().orderBy('created_at', 'desc').orderBy('id', 'desc').execute()
  );
  safeHandle('api:history:clear', noPayloadSchema, async () => {
    await db.deleteFrom('api_request_history').execute();
    logger.info('API request history cleared');
  });

  safeHandle('api:import:postman', noPayloadSchema, async (event) => {
    const filePath = await pickFile(event, [{ name: 'Postman JSON', extensions: ['json'] }]);
    if (!filePath) return null;
    try {
      const parsed = parsePostmanFile(await readImportFile(filePath));
      if (parsed.kind === 'environment') return parsed;
      const counts = await insertImportTree(db, parsed.tree, encrypt);
      logger.info('Postman collection imported', { folders: counts.folders, requests: counts.requests });
      return { kind: 'collection' as const, ...counts, warnings: parsed.warnings };
    } catch (error) {
      return importErrorResult(error);
    }
  });

  safeHandle('api:import:ownshell', noPayloadSchema, async (event) => {
    const filePath = await pickFile(event, [{ name: 'OwnShell API', extensions: ['json'] }]);
    if (!filePath) return null;
    try {
      const counts = await insertImportTree(db, parseOwnShellApiFile(await readImportFile(filePath)), encrypt);
      logger.info('OwnShell API file imported', { folders: counts.folders, requests: counts.requests });
      return { kind: 'collection' as const, ...counts, warnings: {} };
    } catch (error) {
      return importErrorResult(error);
    }
  });

  safeHandle('api:export:ownshell', idSchema, async (event, collectionId) => {
    const [collections, requests] = await Promise.all([
      db.selectFrom('api_collections').selectAll().execute(),
      db.selectFrom('api_requests').selectAll().execute(),
    ]);
    const document = buildOwnShellApiDocument(collectionId, collections, requests);
    const safeName = document.folder.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'collection';
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: SaveDialogOptions = {
      defaultPath: `${safeName}${OWNSHELL_API_EXTENSION}`,
      filters: [{ name: 'OwnShell API', extensions: ['json'] }],
    };
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, serializeOwnShellApiDocument(document), 'utf8');
    logger.info('OwnShell API file exported', { collectionId });
    return { filePath: result.filePath };
  });
}
