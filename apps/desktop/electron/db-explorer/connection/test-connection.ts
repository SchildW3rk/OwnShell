import { logger } from '../../logger';
import { sshSessionManager } from '../../ssh/session-manager';
import { createNetworkAdapter, type NetworkAdapterConfig } from './adapter-factory';
import { describeConnectionError } from './errors';
import { setupDatabaseTunnel, stopDatabaseTunnel } from './tunnel';
import type { AnyAdapter, TestConnectionConfig } from './types';

/**
 * Test a database connection without saving it.
 */
export async function testDatabaseConnection(
  config: TestConnectionConfig
): Promise<{ success: boolean; error?: string; code?: string }> {
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

    const connectionId = `test-${Date.now()}`;
    const adapterConfig: NetworkAdapterConfig = {
      ...config,
      id: connectionId,
      name: config.name || 'Test connection',
      connectionMode: shouldUseSshTunnel(config) ? 'ssh' : 'local',
      sshTunnelEnabled: shouldUseSshTunnel(config),
      executionMode: config.executionMode || 'direct',
      readPreference: config.readPreference as NetworkAdapterConfig['readPreference'],
    };
    let host = config.host;
    let port = config.port;

    if (shouldUseSshTunnel(config)) {
      tunnelResult = await setupDatabaseTunnel(adapterConfig, undefined, connectionId);
      host = '127.0.0.1';
      port = tunnelResult.localPort;
    }

    adapter = createNetworkAdapter(adapterConfig, host, port);
    await adapter.connect();

    logger.info('Database connection test successful');
    return { success: true };
  } catch (error) {
    const { message, code } = describeConnectionError(error);
    logger.error('Database connection test failed', { error: message });
    return { success: false, error: message, code };
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
