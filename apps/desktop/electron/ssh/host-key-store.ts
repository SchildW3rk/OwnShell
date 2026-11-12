/**
 * Persists TOFU host key fingerprints on the host record (main process only).
 */

import { SSHConnectionError, type HostQueries } from '@ownshell/core';
import { logger } from '../logger';
import type { HostKeyCheck } from './host-key';

let hostQueries: HostQueries | null = null;

export function initHostKeyStore(queries: HostQueries): void {
  hostQueries = queries;
}

export async function loadHostKeyCheck(hostId: string): Promise<HostKeyCheck> {
  const queries = hostQueries;
  if (!queries) {
    throw new SSHConnectionError('Host key store not initialized');
  }
  const host = await queries.getById(hostId);
  return {
    hostId,
    expected: host?.host_key_fingerprint ?? null,
    claim: async (fingerprint) => {
      try {
        const stored = await queries.claimHostKey(hostId, fingerprint);
        if (stored === fingerprint) {
          logger.info('SSH host key on record (first use)', { hostId, fingerprint });
        }
        return stored;
      } catch (error) {
        logger.error('Failed to store SSH host key fingerprint', { hostId, error });
        throw error;
      }
    },
  };
}
