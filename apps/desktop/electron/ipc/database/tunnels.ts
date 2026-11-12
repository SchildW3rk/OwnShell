import type { Database, HostTunnelUpdate, NewHostTunnel } from '@ownshell/core';
import type { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import { idSchema, tunnelSchema, tunnelUpdateArgsSchema } from './schemas';

export function registerTunnelHandlers(db: Kysely<Database>): void {
  safeHandle('db:tunnels:get-by-host', idSchema, async (_event, hostId) => {
    try {
      logger.debug('IPC: db:tunnels:get-by-host', { hostId });
      return await db.selectFrom('host_tunnels').where('host_id', '=', hostId).selectAll().execute();
    } catch (error) {
      logger.error('Failed to get tunnels by host', error, { hostId });
      throw error;
    }
  });

  safeHandle('db:tunnels:get-auto-start', idSchema, async (_event, hostId) => {
    try {
      logger.debug('IPC: db:tunnels:get-auto-start', { hostId });
      return await db
        .selectFrom('host_tunnels')
        .where('host_id', '=', hostId)
        .where('auto_start', '=', 1)
        .selectAll()
        .execute();
    } catch (error) {
      logger.error('Failed to get auto-start tunnels', error, { hostId });
      throw error;
    }
  });

  safeHandle('db:tunnels:create', tunnelSchema, async (_event, tunnelData) => {
    try {
      logger.info('IPC: db:tunnels:create', {
        hostId: tunnelData.host_id,
        name: tunnelData.name,
      });

      const newTunnel: NewHostTunnel = {
        id: uuidv4(),
        host_id: tunnelData.host_id,
        local_port: tunnelData.local_port,
        remote_host: tunnelData.remote_host,
        remote_port: tunnelData.remote_port,
        name: tunnelData.name,
        auto_start: tunnelData.auto_start ? 1 : 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      await db.insertInto('host_tunnels').values(newTunnel).execute();

      logger.info('Tunnel config created', { id: newTunnel.id });
      return newTunnel;
    } catch (error) {
      logger.error('Failed to create tunnel config', error);
      throw error;
    }
  });

  safeHandleArgs('db:tunnels:update', tunnelUpdateArgsSchema, async (_event, [id, updateData]) => {
    try {
      logger.info('IPC: db:tunnels:update', { id });

      const update: HostTunnelUpdate = {
        ...updateData,
        auto_start:
          updateData.auto_start !== undefined ? (updateData.auto_start ? 1 : 0) : undefined,
        updated_at: Date.now(),
      };

      await db.updateTable('host_tunnels').set(update).where('id', '=', id).execute();

      logger.info('Tunnel config updated', { id });
      return { success: true };
    } catch (error) {
      logger.error('Failed to update tunnel config', error, { id });
      throw error;
    }
  });

  safeHandle('db:tunnels:delete', idSchema, async (_event, id) => {
    try {
      logger.info('IPC: db:tunnels:delete', { id });
      await db.deleteFrom('host_tunnels').where('id', '=', id).execute();
      logger.info('Tunnel config deleted', { id });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete tunnel config', error, { id });
      throw error;
    }
  });
}
