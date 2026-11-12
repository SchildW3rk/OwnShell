import { NewProject, ProjectQueries, ProjectUpdate } from '@ownshell/core';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import {
  idSchema,
  noPayloadSchema,
  projectCreateSchema,
  projectUpdateArgsSchema,
} from './schemas';

export function registerProjectHandlers(projectQueries: ProjectQueries): void {
  safeHandle('db:projects:get-all', noPayloadSchema, async () => {
    try {
      return await projectQueries.getAll();
    } catch (error) {
      logger.error('Failed to get projects', error);
      throw error;
    }
  });

  safeHandle('db:projects:get-by-id', idSchema, async (_event, id) => {
    try {
      return (await projectQueries.getById(id)) ?? null;
    } catch (error) {
      logger.error('Failed to get project', error, { id });
      throw error;
    }
  });

  safeHandle('db:projects:create', projectCreateSchema, async (_event, data) => {
    try {
      const now = Date.now();
      const project: NewProject = {
        id: uuidv4(),
        name: data.name.trim(),
        host_id: data.host_id,
        repository_path: data.repository_path.trim(),
        compose_project: data.compose_project?.trim() || null,
        created_at: now,
        updated_at: now,
      };

      logger.info('Creating project', { id: project.id, hostId: project.host_id });
      return await projectQueries.create(project);
    } catch (error) {
      logger.error('Failed to create project', error);
      throw error;
    }
  });

  safeHandleArgs('db:projects:update', projectUpdateArgsSchema, async (_event, [id, data]) => {
    try {
      const update: ProjectUpdate = {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.host_id !== undefined ? { host_id: data.host_id } : {}),
        ...(data.repository_path !== undefined
          ? { repository_path: data.repository_path.trim() }
          : {}),
        ...(data.compose_project !== undefined
          ? { compose_project: data.compose_project?.trim() || null }
          : {}),
        updated_at: Date.now(),
      };

      const project = await projectQueries.update(id, update);
      if (!project) {
        throw new Error('Project not found');
      }
      return project;
    } catch (error) {
      logger.error('Failed to update project', error, { id });
      throw error;
    }
  });

  safeHandle('db:projects:delete', idSchema, async (_event, id) => {
    try {
      await projectQueries.delete(id);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete project', error, { id });
      throw error;
    }
  });
}
