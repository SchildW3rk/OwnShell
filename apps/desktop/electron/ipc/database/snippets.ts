import type { Database, NewSnippet, SnippetUpdate } from '@ownshell/core';
import type { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import {
  idSchema,
  noPayloadSchema,
  snippetCategorySchema,
  snippetCreateSchema,
  snippetUpdateArgsSchema,
} from './schemas';

export function registerSnippetHandlers(db: Kysely<Database>): void {
  safeHandle('db:snippets:list', snippetCategorySchema, async (_event, category) => {
    try {
      logger.debug('IPC: db:snippets:list', { category });

      let query = db.selectFrom('snippets').selectAll();

      if (category !== undefined) {
        if (category === null) {
          query = query.where('category', 'is', null);
        } else {
          query = query.where('category', '=', category);
        }
      }

      return await query.orderBy('category', 'asc').orderBy('label', 'asc').execute();
    } catch (error) {
      logger.error('Failed to list snippets', error);
      throw error;
    }
  });

  safeHandle('db:snippets:create', snippetCreateSchema, async (_event, data) => {
    try {
      logger.info('IPC: db:snippets:create', { label: data.label, category: data.category });

      const newSnippet: NewSnippet = {
        id: uuidv4(),
        label: data.label,
        command: data.command,
        category: data.category || null,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      await db.insertInto('snippets').values(newSnippet).execute();

      logger.info('Snippet created', { id: newSnippet.id, label: newSnippet.label });
      return newSnippet;
    } catch (error) {
      logger.error('Failed to create snippet', error);
      throw error;
    }
  });

  safeHandleArgs('db:snippets:update', snippetUpdateArgsSchema, async (_event, [id, updateData]) => {
    try {
      logger.info('IPC: db:snippets:update', { id });

      const update: SnippetUpdate = {
        ...updateData,
        updated_at: Date.now(),
      };

      await db.updateTable('snippets').set(update).where('id', '=', id).execute();

      logger.info('Snippet updated', { id });
      return { success: true };
    } catch (error) {
      logger.error('Failed to update snippet', error, { id });
      throw error;
    }
  });

  safeHandle('db:snippets:delete', idSchema, async (_event, id) => {
    try {
      logger.info('IPC: db:snippets:delete', { id });
      await db.deleteFrom('snippets').where('id', '=', id).execute();
      logger.info('Snippet deleted', { id });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete snippet', error, { id });
      throw error;
    }
  });

  safeHandle('db:snippets:get-categories', noPayloadSchema, async () => {
    try {
      logger.debug('IPC: db:snippets:get-categories');

      const results = await db
        .selectFrom('snippets')
        .select('category')
        .distinct()
        .where('category', 'is not', null)
        .orderBy('category', 'asc')
        .execute();

      return results.map((result) => result.category).filter(Boolean) as string[];
    } catch (error) {
      logger.error('Failed to get snippet categories', error);
      throw error;
    }
  });
}
