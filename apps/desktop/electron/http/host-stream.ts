import type { Duplex } from 'node:stream';
import { findSessionByHostId, getOrCreateBackgroundSession, getSSHClient } from '../ipc/ssh';

async function getHostSessionId(hostId: string): Promise<string> {
  const existing = findSessionByHostId(hostId);
  if (existing && getSSHClient(existing)) return existing;
  return getOrCreateBackgroundSession(hostId);
}

/** Opens a direct-tcpip channel from the SSH host to host:port. */
export async function openHostStream(hostId: string, host: string, port: number): Promise<Duplex> {
  const client = getSSHClient(await getHostSessionId(hostId));
  if (!client) throw new Error('SSH session is not available');
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, host, port, (error, stream) =>
      error ? reject(error) : resolve(stream)
    );
  });
}
