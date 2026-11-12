import type { SSH2Adapter, JumpHostConfig } from '../../ssh/ssh2-adapter';
import type { SSHStreamHandler } from '../../ssh/stream-handler';
import type { ISSHSFTP } from '@ownshell/core';

/**
 * SSH Session (legacy structure for compatibility).
 * Worker sessions intentionally do not hold a Main Process SSH client.
 */
export interface SSHSession {
  id: string;
  client: SSH2Adapter | null;
  streamHandler: SSHStreamHandler | null;
  sftpClient: ISSHSFTP | null;
  sftpSessionId?: string;
  sftpClientPromise?: Promise<ISSHSFTP>;
  hostId: string;
  hostname: string;
  username: string;
  isWorkerSession?: boolean;
}

export interface ActiveSSHSessionStore {
  get(sessionId: string): SSHSession | undefined;
  set(sessionId: string, session: SSHSession): void;
  delete(sessionId: string): boolean;
  has(sessionId: string): boolean;
  readonly size: number;
  keys(): IterableIterator<string>;
  values(): IterableIterator<SSHSession>;
  entries(): IterableIterator<[string, SSHSession]>;
  clear(): void;
}

export interface JumpHostData {
  id: string;
  label: string;
  hostname: string;
  port: number;
  username: string;
  auth_type: 'password' | 'key';
  password_encrypted?: string | null;
  key_id?: string | null;
  jump_host_id?: string | null;
}

export type GetHostById = (id: string) => Promise<JumpHostData | null>;

export type GetKeyById = (id: string) => Promise<{
  private_key_encrypted: string;
  passphrase_encrypted?: string | null;
} | null>;

export type BuildJumpChain = (
  hostId: string | null | undefined,
  getHostById: GetHostById,
  getKeyById: GetKeyById
) => Promise<JumpHostConfig[]>;
