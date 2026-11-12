import { IpcMainInvokeEvent } from 'electron';
import { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { Database, NewVaultEnvironment, VaultEnvironmentUpdate } from '@ownshell/core';
import { cryptoManager } from '../../security/crypto';
import { logger } from '../../logger';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import {
  createEnvironmentSchema,
  deployToSftpArgsSchema,
  environmentUpdateArgsSchema,
  favoriteArgsSchema,
  idSchema,
  noPayloadSchema,
  projectSchema,
} from '../schemas/vault';
import { sftpConnectionManager } from '../../sftp/sftp-connection-manager';
import { serializeDotenv } from './dotenv';

let db: Kysely<Database>;

export function setupVaultEnvironmentHandlers(_db: Kysely<Database>) {
  db = _db;

  // ==================== ENVIRONMENTS ====================
  safeHandle('vault:environments:get-all', noPayloadSchema, handleGetAllEnvironments);
  safeHandle('vault:environments:get-by-id', idSchema, handleGetEnvironmentById);
  safeHandle('vault:environments:get-by-project', projectSchema, handleGetEnvironmentsByProject);
  safeHandle('vault:environments:create', createEnvironmentSchema, handleCreateEnvironment);
  safeHandleArgs('vault:environments:update', environmentUpdateArgsSchema, (_event, [id, data]) =>
    handleUpdateEnvironment(_event, id, data)
  );
  safeHandle('vault:environments:delete', idSchema, handleDeleteEnvironment);
  safeHandle('vault:environments:decrypt-variables', idSchema, handleDecryptVariables);
  safeHandleArgs('vault:environments:deploy-to-sftp', deployToSftpArgsSchema, (_event, [id, params]) =>
    handleDeployToSFTP(_event, id, params)
  );
  safeHandle('vault:environments:get-projects', noPayloadSchema, handleGetProjects);
  safeHandleArgs('vault:environments:toggle-favorite', favoriteArgsSchema, (_event, [id, favorite]) =>
    handleToggleEnvFavorite(_event, id, favorite)
  );
}

// ==================== ENVIRONMENTS HANDLERS ====================

async function handleGetAllEnvironments() {
  try {
    return await db
      .selectFrom('vault_environments')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  } catch (error) {
    logger.error('Failed to get vault environments', error);
    throw error;
  }
}

async function handleGetEnvironmentById(_event: IpcMainInvokeEvent, id: string) {
  try {
    return await db
      .selectFrom('vault_environments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  } catch (error) {
    logger.error('Failed to get vault environment', { id, error });
    throw error;
  }
}

async function handleGetEnvironmentsByProject(_event: IpcMainInvokeEvent, project: string) {
  try {
    return await db
      .selectFrom('vault_environments')
      .selectAll()
      .where('project', '=', project)
      .orderBy('created_at', 'desc')
      .execute();
  } catch (error) {
    logger.error('Failed to get environments by project', { project, error });
    throw error;
  }
}

async function handleCreateEnvironment(
  _event: IpcMainInvokeEvent,
  data: {
    name: string;
    project: string;
    description: string | null;
    variables: Array<{ key: string; value: string }>;
    host_id: string | null;
    default_remote_path: string | null;
  }
) {
  try {
    if (!cryptoManager.isUnlocked()) {
      throw new Error('App is locked - cannot encrypt variables');
    }

    // Encrypt all variable values
    const encryptedVariables = data.variables.map((v) => ({
      key: v.key,
      value_encrypted: cryptoManager.encryptData(v.value),
    }));

    const now = Date.now();
    const environment: NewVaultEnvironment = {
      id: uuidv4(),
      name: data.name,
      project: data.project,
      description: data.description,
      variables: JSON.stringify(encryptedVariables),
      host_id: data.host_id,
      default_remote_path: data.default_remote_path,
      favorite: 0,
      created_at: now,
      updated_at: now,
      last_deployed_at: null,
    };

    await db.insertInto('vault_environments').values(environment).execute();

    logger.info('Vault environment created', {
      id: environment.id,
      name: environment.name,
      project: environment.project,
      variableCount: data.variables.length,
    });

    return environment;
  } catch (error) {
    logger.error('Failed to create vault environment', error);
    throw error;
  }
}

async function handleUpdateEnvironment(
  _event: IpcMainInvokeEvent,
  id: string,
  data: {
    name?: string;
    project?: string;
    description?: string | null;
    variables?: Array<{ key: string; value: string }>;
    host_id?: string | null;
    default_remote_path?: string | null;
    favorite?: number;
  }
) {
  try {
    // Extract variables for separate handling
    const { variables, ...restData } = data;

    const update: VaultEnvironmentUpdate = {
      ...restData,
      updated_at: Date.now(),
    };

    // Encrypt variables if provided
    if (variables !== undefined) {
      if (!cryptoManager.isUnlocked()) {
        throw new Error('App is locked - cannot encrypt variables');
      }
      const encryptedVariables = variables.map((v) => ({
        key: v.key,
        value_encrypted: cryptoManager.encryptData(v.value),
      }));
      update.variables = JSON.stringify(encryptedVariables);
    }

    await db.updateTable('vault_environments').set(update).where('id', '=', id).execute();

    const updated = await db
      .selectFrom('vault_environments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    logger.info('Vault environment updated', { id, name: data.name });
    return updated;
  } catch (error) {
    logger.error('Failed to update vault environment', { id, error });
    throw error;
  }
}

async function handleDeleteEnvironment(_event: IpcMainInvokeEvent, id: string) {
  try {
    await db.deleteFrom('vault_environments').where('id', '=', id).execute();
    logger.info('Vault environment deleted', { id });
  } catch (error) {
    logger.error('Failed to delete vault environment', { id, error });
    throw error;
  }
}

async function handleDecryptVariables(_event: IpcMainInvokeEvent, id: string) {
  try {
    if (!cryptoManager.isUnlocked()) {
      throw new Error('App is locked - cannot decrypt variables');
    }

    const environment = await db
      .selectFrom('vault_environments')
      .select('variables')
      .where('id', '=', id)
      .executeTakeFirst();

    if (!environment) {
      throw new Error('Environment not found');
    }

    const encryptedVars = JSON.parse(environment.variables) as Array<{
      key: string;
      value_encrypted: string;
    }>;

    const decryptedVars = encryptedVars.map((v) => ({
      key: v.key,
      value: cryptoManager.decryptData(v.value_encrypted),
    }));

    logger.info('Environment variables decrypted', { id, count: decryptedVars.length });
    return decryptedVars;
  } catch (error) {
    logger.error('Failed to decrypt environment variables', { id, error });
    throw error;
  }
}

async function handleDeployToSFTP(
  _event: IpcMainInvokeEvent,
  envId: string,
  params: {
    connectionId: string; // SFTP standalone connection ID (from sftpConnectionManager)
    remotePath: string; // Target path on server, e.g., "/var/www/.env"
  }
) {
  try {
    if (!cryptoManager.isUnlocked()) {
      throw new Error('App is locked - cannot decrypt variables');
    }

    logger.info('Deploying ENV to SFTP', { envId, ...params });

    // 1. Get environment
    const environment = await db
      .selectFrom('vault_environments')
      .select(['variables', 'name'])
      .where('id', '=', envId)
      .executeTakeFirst();

    if (!environment) {
      throw new Error('Environment not found');
    }

    // 2. Decrypt variables
    const encryptedVars = JSON.parse(environment.variables) as Array<{
      key: string;
      value_encrypted: string;
    }>;

    const decryptedVars = encryptedVars.map((v) => ({
      key: v.key,
      value: cryptoManager.decryptData(v.value_encrypted),
    }));

    // 3. Generate .env file content
    const envFileContent = serializeDotenv(decryptedVars);

    // 4. Write to SFTP server (delegate to sftp-connection-manager)
    let sftp = sftpConnectionManager.getSFTPClient(params.connectionId);

    // If not connected, try to establish connection
    if (!sftp) {
      logger.info('SFTP not connected, attempting to connect', {
        connectionId: params.connectionId,
      });

      // Get host config from database
      const host = await db
        .selectFrom('hosts')
        .selectAll()
        .where('id', '=', params.connectionId)
        .executeTakeFirst();

      if (!host) {
        throw new Error('Host not found in database');
      }

      // Get SSH key if auth_type is 'key'
      let privateKeyEncrypted: string | null = null;
      let passphraseEncrypted: string | null = null;

      if (host.auth_type === 'key' && host.key_id) {
        const sshKey = await db
          .selectFrom('keys')
          .select(['private_key_encrypted', 'passphrase_encrypted'])
          .where('id', '=', host.key_id)
          .executeTakeFirst();

        if (sshKey) {
          privateKeyEncrypted = sshKey.private_key_encrypted;
          passphraseEncrypted = sshKey.passphrase_encrypted;
        } else {
          throw new Error('SSH key not found in database');
        }
      }

      // Establish SFTP connection
      try {
        const newConnectionId = await sftpConnectionManager.connect({
          hostId: host.id,
          hostname: host.hostname,
          port: host.port,
          username: host.username,
          authType: host.auth_type,
          passwordEncrypted: host.password_encrypted,
          privateKeyEncrypted,
          passphraseEncrypted,
          jumpHostId: host.jump_host_id,
        });

        logger.info('SFTP connection established, getting SFTP client', { newConnectionId });

        sftp = sftpConnectionManager.getSFTPClient(newConnectionId);
        if (!sftp) {
          throw new Error('Failed to get SFTP client after connection');
        }
        logger.info('SFTP connection established successfully');
      } catch (error: any) {
        logger.error('Failed to connect to SFTP host', {
          errorMessage: error.message,
          errorStack: error.stack,
        });
        throw new Error(
          'Could not connect to SFTP host. Please check if the host is reachable and credentials are correct.'
        );
      }
    }

    // Ensure parent directory exists
    const remoteDir = path.posix.dirname(params.remotePath);
    if (remoteDir && remoteDir !== '.' && remoteDir !== '/') {
      try {
        await sftp.mkdir(remoteDir);
      } catch (dirError: any) {
        // Directory might already exist, only log if it's not an exists error
        logger.debug('Directory creation attempt', {
          remoteDir,
          error: dirError.message,
        });
      }
    }

    // Write file
    try {
      logger.info('Writing ENV file to SFTP', {
        remotePath: params.remotePath,
        fileSize: envFileContent.length,
      });
      await sftp.writeFile(params.remotePath, Buffer.from(envFileContent, 'utf-8'), { mode: 0o600 });
      logger.info('ENV file written successfully');
    } catch (writeError: any) {
      logger.error('Failed to write ENV file', {
        remotePath: params.remotePath,
        errorMessage: writeError.message,
        errorCode: writeError.code,
        errorStack: writeError.stack,
      });
      throw new Error(`Failed to write file to ${params.remotePath}: ${writeError.message}`);
    }

    // 5. Update last_deployed_at
    await db
      .updateTable('vault_environments')
      .set({ last_deployed_at: Date.now() })
      .where('id', '=', envId)
      .execute();

    logger.info('ENV deployed successfully', {
      envId,
      envName: environment.name,
      remotePath: params.remotePath,
      variableCount: decryptedVars.length,
    });

    return {
      success: true,
      remotePath: params.remotePath,
      variableCount: decryptedVars.length,
    };
  } catch (error: any) {
    logger.error('Failed to deploy ENV to SFTP', {
      envId,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    throw error;
  }
}

async function handleGetProjects() {
  try {
    const result = await db
      .selectFrom('vault_environments')
      .select('project')
      .distinct()
      .orderBy('project', 'asc')
      .execute();

    return result.map((r) => r.project);
  } catch (error) {
    logger.error('Failed to get projects', error);
    throw error;
  }
}

async function handleToggleEnvFavorite(_event: IpcMainInvokeEvent, id: string, favorite: number) {
  try {
    await db
      .updateTable('vault_environments')
      .set({ favorite, updated_at: Date.now() })
      .where('id', '=', id)
      .execute();

    logger.info('Environment favorite toggled', { id, favorite });
  } catch (error) {
    logger.error('Failed to toggle environment favorite', { id, error });
    throw error;
  }
}
