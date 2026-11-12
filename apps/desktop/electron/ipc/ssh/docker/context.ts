import { ISSHShell } from '@ownshell/core';
import { sshSessionManager } from '../../../ssh/session-manager';

export interface DockerSftpClient {
  writeFile(path: string, content: string | Buffer): Promise<void>;
  readFile(path: string): Promise<Buffer>;
}

export interface SSHSessionLike {
  id: string;
  client: unknown;
  sftpClient: DockerSftpClient | null;
  streamHandler?: unknown;
  hostId: string;
  hostname: string;
  username: string;
  isWorkerSession?: boolean;
}

export interface SSHDockerContext {
  activeSessions: {
    get(sessionId: string): SSHSessionLike | undefined;
    keys(): IterableIterator<string>;
  };
  execCommand: (
    session: any,
    command: string,
    timeout?: number
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  requireClient: (session: any) => { shell(options: unknown): Promise<ISSHShell> };
  ensureSftpClient: (session: any) => Promise<unknown>;
  createBackgroundSSHSession: (hostId: string) => Promise<string>;
}

export function parseMemoryValue(value: string): number {
  const match = value.match(/^([\d.]+)\s*([KMGTP]?i?B)?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1, KB: 1024, KIB: 1024, MB: 1024 ** 2, MIB: 1024 ** 2,
    GB: 1024 ** 3, GIB: 1024 ** 3, TB: 1024 ** 4, TIB: 1024 ** 4,
  };
  return Math.round(num * (multipliers[unit] || 1));
}

export function releaseDockerBackgroundSession(owner: { backgroundSessionId?: string }): void {
  const sessionId = owner.backgroundSessionId;
  if (!sessionId) return;
  owner.backgroundSessionId = undefined;
  if (sshSessionManager.getSession(sessionId)) {
    sshSessionManager.disconnect(sessionId, 'docker-stream-closed');
  }
}
