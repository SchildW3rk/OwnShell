import type { Database } from '@ownshell/core';
import type { IpcMainInvokeEvent } from 'electron';
import type { Kysely } from 'kysely';
import { httpClient, type HttpRequestConfig, type HttpResponse } from '../../http/http-client';
import { logger } from '../../logger';
import { cryptoManager } from '../../security/crypto';
import { tunnelManager } from '../../ssh/tunnel-manager';
import { safeHandle } from '../safe-ipc';
import { executeRequestSchema } from './schemas';

export function registerApiExecutionHandlers(db: Kysely<Database>): void {
  safeHandle('api:requests:execute', executeRequestSchema, (_event, config) =>
    handleExecuteRequest(db, _event, config)
  );
}

async function getDecryptedVariables(
  db: Kysely<Database>,
  environmentId: string
): Promise<Record<string, string>> {
  if (!cryptoManager.isUnlocked()) {
    logger.warn('App is locked, cannot decrypt environment variables');
    return {};
  }

  try {
    const environment = await db
      .selectFrom('vault_environments')
      .select('variables')
      .where('id', '=', environmentId)
      .executeTakeFirst();

    if (!environment) {
      logger.warn('Environment not found', { environmentId });
      return {};
    }

    const encryptedVars = JSON.parse(environment.variables) as Array<{
      key: string;
      value_encrypted: string;
    }>;

    const decrypted: Record<string, string> = {};
    for (const variable of encryptedVars) {
      try {
        decrypted[variable.key] = cryptoManager.decryptData(variable.value_encrypted);
      } catch (error) {
        logger.error('Failed to decrypt variable', { key: variable.key, error });
      }
    }

    logger.info('Decrypted environment variables', {
      environmentId,
      count: Object.keys(decrypted).length,
    });

    return decrypted;
  } catch (error) {
    logger.error('Failed to get decrypted variables', { environmentId, error });
    return {};
  }
}

async function handleExecuteRequest(
  db: Kysely<Database>,
  _event: IpcMainInvokeEvent,
  config: HttpRequestConfig
): Promise<HttpResponse> {
  try {
    logger.info('Executing API request', {
      method: config.method,
      url: config.url?.substring(0, 50) + (config.url?.length > 50 ? '...' : ''),
      bodyType: config.bodyType,
      authType: config.authType,
      hasNetworkHost: !!config.networkHostId,
      hasEnvironment: !!config.environmentId,
    });

    let decryptedVariables: Record<string, string> = {};
    if (config.environmentId) {
      decryptedVariables = await getDecryptedVariables(db, config.environmentId);
    }

    if (config.networkHostId) {
      const activeTunnels = tunnelManager.getAllTunnels();
      const matchingTunnel = activeTunnels.find((tunnel) => tunnel.status === 'active');

      if (matchingTunnel) {
        logger.info('Using existing tunnel for HTTP request', {
          tunnelId: matchingTunnel.id,
          localPort: matchingTunnel.config.localPort,
        });

        return await httpClient.executeViaTunnel(
          config,
          matchingTunnel.config.localPort,
          null,
          decryptedVariables
        );
      }

      logger.warn('No active SSH tunnel found for HTTP proxy. Making direct request instead.', {
        networkHostId: config.networkHostId,
      });
    }

    return await httpClient.execute(config, null, decryptedVariables);
  } catch (error) {
    logger.error('Failed to execute API request', { error });
    throw error;
  }
}
