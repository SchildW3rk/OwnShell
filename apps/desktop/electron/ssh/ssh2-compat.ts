import type { ClientChannel, ConnectConfig as Ssh2ConnectConfig } from 'ssh2';
import { createHostVerifier, type HostKeyCheck } from './host-key';

/**
 * Shared ssh2 connect options (used by the main process and the terminal worker,
 * so this module must stay free of Electron/logger imports).
 *
 * SSH Compatibility Configuration
 *
 * Enables support for legacy servers using older algorithms.
 * Modern ssh2 library rejects some algorithms by default (e.g., ssh-rsa).
 *
 * IMPORTANT: Legacy algorithms are listed after modern algorithms so secure
 * algorithms remain preferred while old servers still have a fallback path.
 *
 * Note: Cast to `any` is needed because ssh2 types are overly strict
 * and don't allow all valid algorithm strings.
 */
export const SSH_COMPAT_ALGORITHMS: any = {
  serverHostKey: [
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256',
    'ssh-rsa',
    'ssh-dss',
  ],
  kex: [
    'curve25519-sha256',
    'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group-exchange-sha1',
    'diffie-hellman-group14-sha1',
  ],
  cipher: [
    'aes128-gcm',
    'aes128-gcm@openssh.com',
    'aes256-gcm@openssh.com',
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    'aes128-cbc',
    'aes192-cbc',
    'aes256-cbc',
  ],
};

export interface ConnectOptionsInput {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  readyTimeout?: number;
  keepaliveInterval?: number;
  /** Required: every connection is checked against the host's stored key (TOFU). */
  hostKey: HostKeyCheck;
}

export function toConnectOptions(
  config: ConnectOptionsInput,
  viaStream: boolean,
  stream?: ClientChannel
): Ssh2ConnectConfig {
  const baseOptions = {
    username: config.username,
    password: config.password,
    privateKey: normalizePrivateKey(config.privateKey),
    passphrase: config.passphrase,
    readyTimeout: config.readyTimeout || 30000,
    keepaliveInterval: config.keepaliveInterval || 10000,
    tryKeyboard: true,
    algorithms: SSH_COMPAT_ALGORITHMS,
    hostVerifier: createHostVerifier(config.hostKey),
  };

  if (viaStream) {
    return { ...baseOptions, sock: stream };
  }

  return { ...baseOptions, host: config.host, port: config.port };
}

function normalizePrivateKey(privateKey?: string): string | undefined {
  if (!privateKey) {
    return undefined;
  }

  const cleanKey = privateKey.toString().trim();
  return cleanKey.endsWith('\n') ? cleanKey : `${cleanKey}\n`;
}
