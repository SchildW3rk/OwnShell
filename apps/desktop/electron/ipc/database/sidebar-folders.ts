import { NewSidebarFolder, SidebarFolderQueries, SidebarFolderUpdate } from '@ownshell/core';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import {
  idSchema,
  sidebarFolderCreateSchema,
  sidebarFolderListSchema,
  sidebarFolderUpdateArgsSchema,
} from './schemas';

export function registerSidebarFolderHandlers(sidebarFolderQueries: SidebarFolderQueries): void {
  safeHandle('db:sidebar-folders:get-all', sidebarFolderListSchema, async (_event, resourceType) => {
    try {
      logger.debug('IPC: db:sidebar-folders:get-all', { resourceType });
      return await sidebarFolderQueries.getAll(resourceType);
    } catch (error) {
      logger.error('Failed to get sidebar folders', error);
      throw error;
    }
  });

  safeHandle('db:sidebar-folders:create', sidebarFolderCreateSchema, async (_event, data) => {
    try {
      logger.info('IPC: db:sidebar-folders:create', {
        resourceType: data.resource_type,
        name: data.name,
      });

      const now = Date.now();
      const newFolder: NewSidebarFolder = {
        id: uuidv4(),
        resource_type: data.resource_type,
        name: data.name,
        sort_order: data.sort_order ?? 0,
        created_at: now,
        updated_at: now,
      };

      await sidebarFolderQueries.create(newFolder);

      return newFolder;
    } catch (error) {
      logger.error('Failed to create sidebar folder', error);
      throw error;
    }
  });

  safeHandleArgs('db:sidebar-folders:update', sidebarFolderUpdateArgsSchema, async (_event, [id, data]) => {
    try {
      logger.info('IPC: db:sidebar-folders:update', { id });

      const update: SidebarFolderUpdate = {
        ...data,
        updated_at: Date.now(),
      };

      await sidebarFolderQueries.update(id, update);

      return { success: true };
    } catch (error) {
      logger.error('Failed to update sidebar folder', error, { id });
      throw error;
    }
  });

  safeHandle('db:sidebar-folders:delete', idSchema, async (_event, id) => {
    try {
      logger.info('IPC: db:sidebar-folders:delete', { id });
      await sidebarFolderQueries.delete(id);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete sidebar folder', error, { id });
      throw error;
    }
  });
}
