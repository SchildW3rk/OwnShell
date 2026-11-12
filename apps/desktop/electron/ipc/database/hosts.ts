import { HostQueries, HostUpdate, NewHost } from '@ownshell/core';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';
import { cryptoManager } from '../../security/crypto';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import {
  hostSchema,
  hostUpdateArgsSchema,
  idSchema,
  jumpChainSchema,
  noPayloadSchema,
} from './schemas';

export function registerHostHandlers(hostQueries: HostQueries): void {
  safeHandle('db:hosts:get-all', noPayloadSchema, async () => {
    try {
      logger.debug('IPC: db:hosts:get-all');
      const hosts = await hostQueries.getAll();

      if (cryptoManager.isUnlocked()) {
        return hosts.map((host) => ({
          ...host,
          password_decrypted: host.password_encrypted
            ? cryptoManager.decryptData(host.password_encrypted)
            : null,
        }));
      }

      return hosts;
    } catch (error) {
      logger.error('Failed to get all hosts', error);
      throw error;
    }
  });

  safeHandle('db:hosts:get-by-id', idSchema, async (_event, id) => {
    try {
      logger.debug('IPC: db:hosts:get-by-id', { id });
      const host = await hostQueries.getById(id);

      if (!host) return null;

      if (cryptoManager.isUnlocked() && host.password_encrypted) {
        return {
          ...host,
          password_decrypted: cryptoManager.decryptData(host.password_encrypted),
        };
      }

      return host;
    } catch (error) {
      logger.error('Failed to get host by id', error, { id });
      throw error;
    }
  });

  safeHandle('db:hosts:create', hostSchema, async (_event, hostData) => {
    try {
      logger.info('IPC: db:hosts:create', { label: hostData.label, hostname: hostData.hostname });

      if (!cryptoManager.isUnlocked()) {
        throw new Error('App is locked - cannot create host');
      }

      let passwordEncrypted: string | null = null;
      if (hostData.password_encrypted) {
        passwordEncrypted = hostData.password_encrypted;
        logger.debug('Using pre-encrypted password from frontend');
      } else if (hostData.password) {
        passwordEncrypted = cryptoManager.encryptData(hostData.password);
        logger.debug('Encrypted plaintext password');
      }

      const newHost: NewHost = {
        id: uuidv4(),
        label: hostData.label,
        hostname: hostData.hostname,
        port: hostData.port || 22,
        username: hostData.username,
        auth_type: hostData.auth_type,
        password_encrypted: passwordEncrypted,
        key_id: hostData.key_id || null,
        jump_host_id: hostData.jump_host_id || null,
        connection_type: hostData.connection_type || 'ssh',
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      logger.info('Creating host', {
        label: hostData.label,
        connection_type_received: hostData.connection_type,
        connection_type_saved: newHost.connection_type,
        hasPasswordEncrypted: !!passwordEncrypted,
      });

      await hostQueries.create(newHost);

      logger.info('Host created successfully', { id: newHost.id, label: newHost.label });
      return newHost;
    } catch (error) {
      logger.error('Failed to create host', error);
      throw error;
    }
  });

  safeHandleArgs('db:hosts:update', hostUpdateArgsSchema, async (_event, [id, updateData]) => {
    try {
      logger.info('IPC: db:hosts:update', { id });

      if (!cryptoManager.isUnlocked()) {
        throw new Error('App is locked - cannot update host');
      }

      const { password, ...hostUpdateData } = updateData;
      const update: HostUpdate = {
        ...hostUpdateData,
        updated_at: Date.now(),
      };

      if (updateData.password_encrypted) {
        update.password_encrypted = updateData.password_encrypted;
        logger.debug('Using pre-encrypted password from frontend for update');
      } else if (password) {
        update.password_encrypted = cryptoManager.encryptData(password);
        logger.debug('Encrypted plaintext password for update');
      }

      // A different server address means a different host key: forget the stored one.
      const existing = await hostQueries.getById(id);
      if (
        existing &&
        ((update.hostname ?? existing.hostname) !== existing.hostname ||
          (update.port ?? existing.port) !== existing.port)
      ) {
        update.host_key_fingerprint = null;
      }

      await hostQueries.update(id, update);

      logger.info('Host updated successfully', { id });
      return { success: true };
    } catch (error) {
      logger.error('Failed to update host', error, { id });
      throw error;
    }
  });

  safeHandle('db:hosts:delete', idSchema, async (_event, id) => {
    try {
      logger.info('IPC: db:hosts:delete', { id });
      await hostQueries.delete(id);
      logger.info('Host deleted successfully', { id });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete host', error, { id });
      throw error;
    }
  });

  safeHandle('db:hosts:reset-host-key', idSchema, async (_event, id) => {
    logger.info('IPC: db:hosts:reset-host-key', { id });
    await hostQueries.update(id, { host_key_fingerprint: null, updated_at: Date.now() });
    return { success: true };
  });

  safeHandle('db:hosts:validate-jump-chain', jumpChainSchema, async (_event, params) => {
    try {
      logger.debug('IPC: db:hosts:validate-jump-chain', params);
      return await validateJumpChain(hostQueries, params.hostId, params.jumpHostId);
    } catch (error) {
      logger.error('Failed to validate jump chain', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}

async function validateJumpChain(
  hostQueries: HostQueries,
  hostId: string | null,
  jumpHostId: string
): Promise<{ valid: boolean; error?: string; chain?: string[] }> {
  if (!jumpHostId) {
    return { valid: true };
  }

  if (hostId && hostId === jumpHostId) {
    return {
      valid: false,
      error: 'A host cannot use itself as a jump host',
    };
  }

  const visited = new Set<string>();
  if (hostId) {
    visited.add(hostId);
  }

  const chain: string[] = [];
  let currentId: string | null = jumpHostId;

  while (currentId) {
    if (visited.has(currentId)) {
      const chainStr = chain.join(' -> ');
      return {
        valid: false,
        error: `Circular reference detected: ${chainStr} -> ${currentId}`,
        chain,
      };
    }

    visited.add(currentId);
    chain.push(currentId);

    const host = await hostQueries.getById(currentId);
    if (!host) {
      return {
        valid: false,
        error: `Jump host not found: ${currentId}`,
      };
    }

    currentId = host.jump_host_id || null;
  }

  return {
    valid: true,
    chain,
  };
}
