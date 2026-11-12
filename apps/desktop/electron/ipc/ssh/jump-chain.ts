import type { JumpHostConfig } from '../../ssh/ssh2-adapter';
import { SSHConnectionError } from '@ownshell/core';
import { cryptoManager } from '../../security/crypto';
import type { GetHostById, GetKeyById } from './types';
import { loadHostKeyCheck } from '../../ssh/host-key-store';

/**
 * Build jump host chain by following jump_host_id references.
 * Returns array ordered from first hop to target hop.
 */
export async function buildJumpChain(
  hostId: string | null | undefined,
  getHostById: GetHostById,
  getKeyById: GetKeyById
): Promise<JumpHostConfig[]> {
  if (!hostId) return [];

  const chain: JumpHostConfig[] = [];
  const visited = new Set<string>();
  let currentId: string | null | undefined = hostId;

  while (currentId) {
    if (visited.has(currentId)) {
      const visitedList = Array.from(visited).join(' -> ');
      throw new SSHConnectionError(
        'Circular jump host reference detected: ' + visitedList + ' -> ' + currentId
      );
    }
    visited.add(currentId);

    const host = await getHostById(currentId);
    if (!host) {
      throw new SSHConnectionError('Jump host not found: ' + currentId);
    }

    let password: string | undefined;
    let privateKey: string | undefined;
    let passphrase: string | undefined;

    if (host.auth_type === 'password' && host.password_encrypted) {
      password = cryptoManager.decryptData(host.password_encrypted);
    } else if (host.auth_type === 'key' && host.key_id) {
      const key = await getKeyById(host.key_id);
      if (key) {
        privateKey = cryptoManager.decryptData(key.private_key_encrypted);
        if (key.passphrase_encrypted) {
          passphrase = cryptoManager.decryptData(key.passphrase_encrypted);
        }
      }
    }

    chain.unshift({
      label: host.label,
      host: host.hostname,
      port: host.port,
      username: host.username,
      password,
      privateKey,
      passphrase,
      hostKey: await loadHostKeyCheck(host.id),
    });

    currentId = host.jump_host_id;
  }

  return chain;
}
