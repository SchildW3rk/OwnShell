import { Client, type ClientChannel } from 'ssh2';
import type { SSHConnectionConfig } from '@ownshell/core';
import { SSHAuthenticationError, SSHConnectionError, SSHTimeoutError } from '@ownshell/core';
import { logger } from '../logger';
import { toConnectOptions } from './ssh2-compat';
import type { HostKeyCheck } from './host-key';
import { hostKeyMismatchMessage } from './host-key';

/**
 * Jump Host Configuration
 * Used for multi-hop SSH connections through bastion/gateway hosts.
 */
export interface JumpHostConfig {
  label: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  hostKey: HostKeyCheck;
}

export type ConnectConfig = JumpHostConfig | (SSHConnectionConfig & { hostKey: HostKeyCheck });

export async function connectWithJumpChain(
  targetClient: Client,
  config: SSHConnectionConfig & { hostKey: HostKeyCheck },
  jumpChain: JumpHostConfig[]
): Promise<Client[]> {
  logger.info('Connecting through jump host chain', {
    target: config.host,
    hops: jumpChain.map((jumpHost) => jumpHost.label).join(' -> '),
    chainLength: jumpChain.length,
  });

  const clients: Client[] = [];
  let currentStream: ClientChannel | undefined;

  try {
    for (let i = 0; i < jumpChain.length; i++) {
      const jumpConfig = jumpChain[i];
      const client = new Client();
      clients.push(client);

      logger.info(`Connecting to jump host ${i + 1}/${jumpChain.length}`, {
        label: jumpConfig.label,
        host: jumpConfig.host,
        port: jumpConfig.port,
      });

      if (i === 0) {
        await connectClientDirect(client, jumpConfig);
      } else {
        await connectClientViaStream(client, jumpConfig, currentStream!);
      }

      const nextHost = i < jumpChain.length - 1 ? jumpChain[i + 1] : config;

      logger.info(`Creating tunnel to ${nextHost.host}:${nextHost.port}`, {
        throughHost: jumpConfig.label,
      });

      currentStream = await forwardOut(client, jumpConfig.label, nextHost.host, nextHost.port);
    }

    logger.info('Connecting to target host through tunnel', {
      host: config.host,
      port: config.port,
    });

    await connectClientViaStream(targetClient, config, currentStream!);

    logger.info('Multi-hop connection established successfully', {
      target: config.host,
      hops: jumpChain.length,
    });

    return clients;
  } catch (error) {
    logger.error('Multi-hop connection failed, cleaning up', {
      error: error instanceof Error ? error.message : String(error),
    });

    clients.forEach((client) => {
      try {
        client.end();
      } catch {
        // Ignore cleanup errors.
      }
    });

    throw error;
  }
}

export function connectClientDirect(client: Client, config: ConnectConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const label = hostLabel(config);
    const timeout = setTimeout(() => {
      client.end();
      reject(new SSHTimeoutError(`Connection timeout to ${label}`));
    }, 30000);

    client.once('ready', () => {
      clearTimeout(timeout);
      logger.info(`Connected to ${label}`);
      resolve();
    });

    client.once('error', (err: Error) => {
      clearTimeout(timeout);
      reject(hostKeyError(config) ?? mapSSHError(err, label));
    });

    logger.info('Connecting SSH client directly', {
      host: config.host,
      port: config.port,
      username: config.username,
      authMethod: config.privateKey ? 'privateKey' : 'password',
    });

    client.connect(toConnectOptions(config, false));
  });
}

export function connectClientViaStream(
  client: Client,
  config: ConnectConfig,
  stream: ClientChannel
): Promise<void> {
  return new Promise((resolve, reject) => {
    const label = hostLabel(config);
    const timeout = setTimeout(() => {
      client.end();
      reject(new SSHTimeoutError(`Connection timeout to ${label} (via tunnel)`));
    }, 30000);

    client.once('ready', () => {
      clearTimeout(timeout);
      logger.info(`Connected to ${label} via tunnel`);
      resolve();
    });

    client.once('error', (err: Error) => {
      clearTimeout(timeout);
      reject(hostKeyError(config) ?? mapSSHError(err, label));
    });

    logger.info('Connecting SSH client via tunnel', {
      label,
      username: config.username,
      authMethod: config.privateKey ? 'privateKey' : 'password',
    });

    client.connect(toConnectOptions(config, true, stream));
  });
}

export function mapSSHError(
  err: Error,
  hostLabel: string,
  messages?: {
    authentication?: string;
    refused?: string;
    timeout?: string;
    notFound?: string;
    fallback?: string;
  }
): Error {
  if (err.message.includes('Authentication')) {
    return new SSHAuthenticationError(
      messages?.authentication || `Authentication failed on ${hostLabel}`
    );
  }
  if (err.message.includes('ECONNREFUSED')) {
    return new SSHConnectionError(
      messages?.refused || `Connection refused by ${hostLabel}`,
      'ECONNREFUSED'
    );
  }
  if (err.message.includes('ETIMEDOUT')) {
    return new SSHTimeoutError(messages?.timeout || `Connection timeout to ${hostLabel}`);
  }
  if (err.message.includes('ENOTFOUND')) {
    return new SSHConnectionError(messages?.notFound || `Host not found: ${hostLabel}`, 'ENOTFOUND');
  }

  return new SSHConnectionError(
    messages?.fallback || `Connection to ${hostLabel} failed: ${err.message}`
  );
}

function forwardOut(
  client: Client,
  clientLabel: string,
  destHost: string,
  destPort: number
): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, destHost, destPort, (err, stream) => {
      if (err) {
        reject(
          new SSHConnectionError(
            `Failed to create tunnel through ${clientLabel} to ${destHost}:${destPort}: ${err.message}`
          )
        );
        return;
      }

      logger.info(`Tunnel created through ${clientLabel} to ${destHost}:${destPort}`);
      resolve(stream);
    });
  });
}

/** Changed host key error for a refused handshake, or null if the key was not the cause. */
export function hostKeyError(config: ConnectConfig): SSHConnectionError | null {
  const message = hostKeyMismatchMessage(config.hostKey, hostLabel(config));
  return message ? new SSHConnectionError(message, 'HOST_KEY_CHANGED') : null;
}

function hostLabel(config: ConnectConfig): string {
  return 'label' in config ? config.label : config.host;
}
