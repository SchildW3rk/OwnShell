import type { DBConnectionConfig } from '@ownshell/core';
import { logger } from '../../logger';
import { sshSessionManager } from '../../ssh/session-manager';
import { createTestAdapter } from './adapter-factory';
import { formatConnectionError } from './errors';
import { setupDatabaseTunnel, stopDatabaseTunnel } from './tunnel';
import type { AnyAdapter, TestConnectionConfig } from './types';

/**
 * Test a database connection without saving it.
 */
export async function testDatabaseConnection(
  config: TestConnectionConfig
): Promise<{ success: boolean; error?: string }> {
  let adapter: AnyAdapter | null = null;
  let tunnelResult:
    | { tunnelId: string; sshSessionId: string; autoCreatedSshSession: boolean; localPort: number }
    | null = null;

  try {
    logger.info('Testing database connection', {
      type: config.type,
      host: config.host,
      port: config.port,
      connectionMode: config.connectionMode || 'local',
      executionMode: config.executionMode || 'direct',
    });

    const adapterConfig = { ...config };

    if (shouldUseSshTunnel(config)) {
      const connectionId = `test-${Date.now()}`;
      const tunnelConfig: DBConnectionConfig = {
        id: connectionId,
        name: config.name || 'Test connection',
        type: config.type,
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: config.password,
        connectionMode: 'ssh',
        sshHostId: config.sshHostId,
        sshTunnelEnabled: true,
        ssl: config.sslEnabled,
        executionMode: config.executionMode || 'direct',
        dockerContainer: config.dockerContainer,
      };

      tunnelResult = await setupDatabaseTunnel(tunnelConfig, undefined, connectionId);
      adapterConfig.host = '127.0.0.1';
      adapterConfig.port = tunnelResult.localPort;
    }

    adapter = createTestAdapter(adapterConfig);
    await adapter.connect();

    logger.info('Database connection test successful');
    return { success: true };
  } catch (error) {
    const errorMessage = formatConnectionError(error);
    logger.error('Database connection test failed', { error: errorMessage });
    return { success: false, error: errorMessage };
  } finally {
    if (adapter) {
      try {
        await adapter.disconnect();
      } catch {
        // Ignore disconnect errors during cleanup.
      }
    }

    if (tunnelResult) {
      try {
        await stopDatabaseTunnel(tunnelResult.tunnelId);
      } catch {
        // Ignore tunnel cleanup errors during test cleanup.
      }

      if (tunnelResult.autoCreatedSshSession) {
        sshSessionManager.disconnect(tunnelResult.sshSessionId, 'db-test-complete');
      }
    }
  }
}

function shouldUseSshTunnel(config: TestConnectionConfig): boolean {
  return config.connectionMode === 'ssh' || config.sshTunnelEnabled === true;
}
