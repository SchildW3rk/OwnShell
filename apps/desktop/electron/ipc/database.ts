/**
 * Database IPC Handlers
 *
 * Root registration for database operations from the renderer process.
 */

import type { Kysely } from 'kysely';
import {
  Database,
  HostQueries,
  KeyQueries,
  ProjectQueries,
  SettingsQueries,
  SidebarFolderQueries,
} from '@ownshell/core';
import { logger } from '../logger';
import { registerHostHandlers } from './database/hosts';
import { registerKeyHandlers } from './database/keys';
import { registerSettingsHandlers } from './database/settings';
import { registerSidebarFolderHandlers } from './database/sidebar-folders';
import { registerSnippetHandlers } from './database/snippets';
import { registerTunnelHandlers } from './database/tunnels';
import { registerProjectHandlers } from './database/projects';

export function setupDatabaseHandlers(db: Kysely<Database>) {
  const hostQueries = new HostQueries(db);
  const keyQueries = new KeyQueries(db);
  const settingsQueries = new SettingsQueries(db);
  const sidebarFolderQueries = new SidebarFolderQueries(db);
  const projectQueries = new ProjectQueries(db);

  logger.info('Setting up database IPC handlers');

  registerHostHandlers(hostQueries);
  registerKeyHandlers(keyQueries);
  registerSettingsHandlers(settingsQueries);
  registerSidebarFolderHandlers(sidebarFolderQueries);
  registerTunnelHandlers(db);
  registerSnippetHandlers(db);
  registerProjectHandlers(projectQueries);

  logger.info('Database IPC handlers setup complete');
}
