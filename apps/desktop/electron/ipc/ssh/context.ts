import type { BrowserWindow } from 'electron';
import type { HostQueries, ISSHSFTP, KeyQueries } from '@ownshell/core';
import type { SSH2Adapter } from '../../ssh/ssh2-adapter';
import type { ActiveSSHSessionStore, BuildJumpChain, SSHSession } from './types';

export interface SSHIPCContext {
  mainWindow: BrowserWindow;
  activeSessions: ActiveSSHSessionStore;
  hostQueries: HostQueries;
  keyQueries: KeyQueries;
  useWorkerThreads: boolean;
  buildJumpChain: BuildJumpChain;
  requireClient(session: SSHSession): SSH2Adapter;
  execCommand(
    session: SSHSession,
    command: string,
    timeout?: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  ensureSftpClient(session: SSHSession): Promise<ISSHSFTP>;
  getOrCreateBackgroundSession(hostId: string): Promise<string>;
  createBackgroundSSHSession(hostId: string): Promise<string>;
  isSessionConnected(sessionId: string): boolean;
}
