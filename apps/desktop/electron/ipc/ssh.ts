/**
 * SSH IPC Handlers
 *
 * Manages SSH connections and terminal sessions between main and renderer process
 *
 * Features:
 * - Multiple concurrent SSH sessions
 * - Stream buffering for performance (via SSHStreamHandler)
 * - Terminal resizing support
 * - Error handling with specific error types
 * - Session lifecycle management
 */

import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { Kysely } from 'kysely';
import {
  Database,
  HostQueries,
  ISSHSFTP,
  KeyQueries,
  ProjectQueries,
  SSHConnectionError,
} from '@ownshell/core';
import { SSH2Adapter, JumpHostConfig } from '../ssh/ssh2-adapter';
import { tunnelManager } from '../ssh/tunnel-manager';
import { cryptoManager } from '../security/crypto';
import { logger } from '../logger';
import { sshSessionManager } from '../ssh/session-manager';
import { sshWorkerManager } from '../ssh/worker-manager';
import { initHostKeyStore, loadHostKeyCheck } from '../ssh/host-key-store';
import { setupSSHDockerHandlers } from './ssh/docker';
import { buildJumpChain } from './ssh/jump-chain';
import { setupSSHConnectionHandlers } from './ssh/connection';
import { setupSSHTerminalHandlers } from './ssh/terminal';
import { setupSSHSftpHandlers } from './ssh/sftp';
import { setupSSHTempFileHandlers } from './ssh/sftp-temp';
import { setupSSHTunnelHandlers } from './ssh/tunnels';
import { setupSSHGitHandlers } from './ssh/git';
import { setupSSHProjectDiscoveryHandlers } from './ssh/project-discovery';
import { setupSSHProjectCodeHandlers } from './ssh/project-code';
import type { ActiveSSHSessionStore, GetHostById, GetKeyById, SSHSession } from './ssh/types';

/**
 * Feature Flag: Use Worker Threads for SSH connections (v1.21.0)
 *
 * When enabled, SSH connections run in isolated Worker Threads,
 * preventing crypto operations from blocking the Main Process Event Loop.
 *
 * Set SSH_USE_WORKERS=false to disable and use the legacy Main Process approach.
 */
const USE_WORKER_THREADS = process.env.SSH_USE_WORKERS !== 'false';

/**
 * Helper: Get SSH2Adapter client from session, throw if not available (v1.21.0)
 *
 * For worker-based sessions, direct client access is not available.
 * Use execCommand() for exec operations instead.
 */
function requireClient(session: SSHSession): SSH2Adapter {
  if (session.isWorkerSession || !session.client) {
    throw new SSHConnectionError(
      'Direct client access not available for worker-based sessions. ' +
        'Use execCommand() or other routing helpers instead.'
    );
  }
  return session.client;
}

/**
 * Helper: Execute command on SSH session (v1.21.0)
 *
 * Routes to either:
 * - Worker Thread (for worker-based sessions)
 * - SSH2Adapter (for main process sessions)
 *
 * Returns unified result format.
 */
async function execCommand(
  session: SSHSession,
  command: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (session.isWorkerSession) {
    // Route through Worker Manager
    const result = await sshWorkerManager.exec(session.id, command, timeout);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
    };
  }

  // Use main process client
  if (!session.client) {
    throw new SSHConnectionError('Session client not available');
  }

  const result = await session.client.exec(command);
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

/**
 * Helper: Ensure session has SFTP client (v1.21.0)
 *
 * For worker-based sessions, SFTP operations require a Main Process SSH connection
 * because SFTP is a stateful protocol that's difficult to proxy through Worker messages.
 *
 * Worker SFTP transports belong to the requesting session and close with that owner.
 */
async function ensureSftpClient(session: SSHSession): Promise<ISSHSFTP> {
  // Check if SFTP client already exists and is usable
  if (session.sftpClient) {
    return session.sftpClient;
  }

  if (session.isWorkerSession) {
    if (session.sftpClientPromise) return session.sftpClientPromise;

    const pending = (async () => {
      let helperSessionId: string | undefined;
      try {
        helperSessionId = await createBackgroundSSHSession(session.hostId);
        if (sshSessionManager.getSession(session.id) !== session) {
          throw new SSHConnectionError('SFTP owner session closed during connection');
        }

        const helper = sshSessionManager.getSession(helperSessionId);
        if (!helper?.client) {
          throw new SSHConnectionError('Failed to get owned SSH session for SFTP');
        }
        session.sftpSessionId = helperSessionId;
        const sftpClient = await helper.client.sftp();
        if (sshSessionManager.getSession(session.id) !== session) {
          sftpClient.close();
          throw new SSHConnectionError('SFTP owner session closed during initialization');
        }
        session.sftpClient = sftpClient;
        return sftpClient;
      } catch (error) {
        delete session.sftpSessionId;
        if (helperSessionId && sshSessionManager.getSession(helperSessionId)) {
          sshSessionManager.disconnect(helperSessionId, 'sftp-initialization-failed');
        }
        throw error;
      }
    })();
    session.sftpClientPromise = pending;
    try {
      return await pending;
    } finally {
      delete session.sftpClientPromise;
    }
  }

  // Main process session - use directly
  if (!session.client) {
    throw new SSHConnectionError('Session client not available');
  }

  const sftpClient = await session.client.sftp();
  session.sftpClient = sftpClient;
  return sftpClient;
}
// Module-level database references (set by setupSSHHandlers)
let moduleHostQueries: HostQueries | null = null;
let moduleKeyQueries: KeyQueries | null = null;

/**
 * Active SSH sessions accessor
 *
 * Provides a Map-like interface that delegates to sshSessionManager,
 * eliminating the previous dual storage that doubled per-session memory.
 * The ManagedSSHSession type is a superset of SSHSession, so all
 * existing access patterns continue to work.
 */
const activeSessions: ActiveSSHSessionStore = {
  get(sessionId: string): SSHSession | undefined {
    return sshSessionManager.getSession(sessionId) ?? undefined;
  },
  set(sessionId: string, _session: SSHSession): void {
    // Sessions are created via sshSessionManager.createSession() instead.
    // This is a no-op kept for compatibility during the transition.
    // The actual session is already registered in sshSessionManager.
    void sessionId;
  },
  delete(sessionId: string): boolean {
    // Session removal is handled by sshSessionManager.disconnect()
    // This is a no-op kept for compatibility.
    void sessionId;
    return true;
  },
  has(sessionId: string): boolean {
    return sshSessionManager.getSession(sessionId) !== null;
  },
  get size(): number {
    return sshSessionManager.getAllSessions().length;
  },
  keys(): IterableIterator<string> {
    return sshSessionManager
      .getAllSessions()
      .map((s) => s.id)
      .values();
  },
  values(): IterableIterator<SSHSession> {
    return (sshSessionManager.getAllSessions() as SSHSession[])[Symbol.iterator]();
  },
  entries(): IterableIterator<[string, SSHSession]> {
    return sshSessionManager
      .getAllSessions()
      .map((s): [string, SSHSession] => [s.id, s])
      .values();
  },
  clear(): void {
    sshSessionManager.disconnectAll();
  },
};

// In-flight promise per host, so concurrent callers share one connection instead of each opening one.
const backgroundConnectionCache = new Map<string, Promise<string>>();

async function getOrCreateBackgroundSession(hostId: string): Promise<string> {
  const cached = backgroundConnectionCache.get(hostId);
  if (cached) {
    const sessionId = await cached; // a failed attempt fails every waiter; the creator evicts it
    if (isSessionConnected(sessionId)) {
      return sessionId;
    }
    // Only drop the entry if nobody replaced it meanwhile.
    if (backgroundConnectionCache.get(hostId) === cached) {
      logger.info('Cached background session unavailable, creating new one', { hostId });
      backgroundConnectionCache.delete(hostId);
    }
    return getOrCreateBackgroundSession(hostId);
  }

  logger.info('Creating background SSH session for SSH helper operation', { hostId });
  const pending = createBackgroundSSHSession(hostId);
  backgroundConnectionCache.set(hostId, pending);
  try {
    return await pending;
  } catch (error) {
    if (backgroundConnectionCache.get(hostId) === pending) {
      backgroundConnectionCache.delete(hostId);
    }
    throw error;
  }
}

/**
 * Setup SSH IPC handlers
 */
export function setupSSHHandlers(mainWindow: BrowserWindow, db: Kysely<Database>) {
  const hostQueries = new HostQueries(db);
  const keyQueries = new KeyQueries(db);
  const projectQueries = new ProjectQueries(db);

  // Store references for module-level functions
  moduleHostQueries = hostQueries;
  moduleKeyQueries = keyQueries;
  initHostKeyStore(hostQueries);

  const ctx = {
    mainWindow,
    activeSessions,
    hostQueries,
    keyQueries,
    useWorkerThreads: USE_WORKER_THREADS,
    buildJumpChain,
    requireClient,
    execCommand,
    ensureSftpClient,
    getOrCreateBackgroundSession,
    createBackgroundSSHSession,
    isSessionConnected,
  };

  // Initialize session manager (v1.20.0)
  sshSessionManager.initialize(mainWindow);

  // Initialize worker manager (v1.21.0)
  if (USE_WORKER_THREADS) {
    sshWorkerManager.initialize(mainWindow);
    logger.info('SSH Worker Threads enabled', { USE_WORKER_THREADS });
  }

  logger.info('Setting up SSH IPC handlers');

  setupSSHConnectionHandlers(ctx);
  setupSSHTerminalHandlers(ctx);
  setupSSHSftpHandlers(ctx);
  setupSSHTempFileHandlers(ctx);
  setupSSHTunnelHandlers(ctx);
  setupSSHDockerHandlers(ctx);
  setupSSHGitHandlers(ctx, projectQueries);
  setupSSHProjectCodeHandlers(ctx, projectQueries);
  setupSSHProjectDiscoveryHandlers(ctx);
  logger.info('SSH IPC handlers setup complete');
}

/**
 * Get SSH client for a session (used by DB Explorer for tunneling)
 * @param sessionId - SSH session ID
 * @returns ssh2 Client or null if session not found or is worker-based
 */
export function getSSHClient(sessionId: string) {
  const session = sshSessionManager.getSession(sessionId);
  // Worker sessions don't have direct client access
  if (!session || session.isWorkerSession || !session.client) {
    return null;
  }
  return session.client.getClient();
}

/**
 * Get SSH2 Adapter for a session (used by DB Dump Service for streaming exec)
 * @param sessionId - SSH session ID
 * @returns SSH2Adapter or null if session not found or is worker-based
 */
export function getSSHAdapter(sessionId: string): SSH2Adapter | null {
  const session = sshSessionManager.getSession(sessionId);
  // Worker sessions don't have SSH2Adapter in main process
  if (!session || session.isWorkerSession) {
    return null;
  }
  return session.client;
}

/**
 * Check if a session exists and is connected
 * @param sessionId - SSH session ID
 */
export function isSessionConnected(sessionId: string): boolean {
  const session = sshSessionManager.getSession(sessionId);
  if (!session) return false;

  // For worker sessions, check via WorkerManager
  if (session.isWorkerSession) {
    return sshWorkerManager.isConnected(sessionId);
  }

  // For main process sessions, check client
  return session.client?.isConnected() || false;
}

/**
 * Find SSH session by host ID
 * Returns the session ID if an active session exists for this host
 * @param hostId - Host ID to search for
 */
export function findSessionByHostId(hostId: string): string | null {
  const session = sshSessionManager.findSessionByHostId(hostId);
  if (!session) return null;

  // For worker sessions, check via WorkerManager
  if (session.isWorkerSession) {
    return sshWorkerManager.isConnected(session.id) ? session.id : null;
  }

  // For main process sessions, check client
  if (session.client?.isConnected()) {
    return session.id;
  }
  return null;
}

/**
 * Create a background SSH session for database connections
 * This creates an SSH connection without a terminal/shell - just for tunneling
 * @param hostId - Host ID to connect to
 * @returns Session ID if successful
 */
export async function createBackgroundSSHSession(hostId: string): Promise<string> {
  const sessionId = uuidv4();

  logger.info('Creating background SSH session for database', { sessionId, hostId });

  // Check if module is initialized
  if (!moduleHostQueries || !moduleKeyQueries) {
    throw new SSHConnectionError('SSH handlers not initialized');
  }

  // Check if app is unlocked
  if (!cryptoManager.isUnlocked()) {
    throw new SSHConnectionError('App is locked. Please unlock to connect.');
  }

  // Get host from database
  const host = await moduleHostQueries.getById(hostId);
  if (!host) {
    throw new SSHConnectionError(`Host not found: ${hostId}`);
  }

  // Decrypt credentials
  let password: string | undefined;
  let privateKey: string | undefined;
  let passphrase: string | undefined;

  if (host.auth_type === 'password' && host.password_encrypted) {
    password = cryptoManager.decryptData(host.password_encrypted);
  } else if (host.auth_type === 'key' && host.key_id) {
    // Get key from database
    const key = await moduleKeyQueries.getById(host.key_id);
    if (key?.private_key_encrypted) {
      privateKey = cryptoManager.decryptData(key.private_key_encrypted);
      // Normalize private key
      if (privateKey) {
        privateKey = privateKey.trim();
        if (!privateKey.endsWith('\n')) {
          privateKey += '\n';
        }
      }
    }
    if (key?.passphrase_encrypted) {
      passphrase = cryptoManager.decryptData(key.passphrase_encrypted);
    }
  }

  // Build jump host chain if needed
  let jumpChain: JumpHostConfig[] = [];
  if (host.jump_host_id) {
    const getHostById: GetHostById = async (id: string) => {
      const h = await moduleHostQueries!.getById(id);
      if (!h) return null;
      return {
        id: h.id,
        label: h.label,
        hostname: h.hostname,
        port: h.port,
        username: h.username,
        auth_type: h.auth_type as 'password' | 'key',
        password_encrypted: h.password_encrypted,
        key_id: h.key_id,
        jump_host_id: h.jump_host_id,
      };
    };

    const getKeyById: GetKeyById = async (id: string) => {
      const k = await moduleKeyQueries!.getById(id);
      if (!k) return null;
      return {
        private_key_encrypted: k.private_key_encrypted,
        passphrase_encrypted: k.passphrase_encrypted,
      };
    };

    jumpChain = await buildJumpChain(host.jump_host_id, getHostById, getKeyById);
  }

  // Create SSH client
  const client = new SSH2Adapter();

  // Register session in SessionManager (no stream handler for background session)
  sshSessionManager.createSession(sessionId, client, hostId, host.hostname, host.username);

  // Connect to SSH server
  const connectionConfig = {
    host: host.hostname,
    port: host.port,
    username: host.username,
    password,
    privateKey,
    passphrase,
    readyTimeout: 20000,
    keepaliveInterval: 10000,
    hostKey: await loadHostKeyCheck(hostId),
  };

  try {
    if (jumpChain.length > 0) {
      await client.connectWithJumpChain(connectionConfig, jumpChain);
    } else {
      await client.connect(connectionConfig);
    }

    logger.info('Background SSH session established', {
      sessionId,
      hostId,
      hostname: host.hostname,
      username: host.username,
    });

    return sessionId;
  } catch (error) {
    // Clean up on failure
    sshSessionManager.disconnect(sessionId, 'connection-failed');
    throw error;
  }
}

/**
 * Cleanup all SSH sessions (called on app exit)
 */
export async function cleanupAllSSHSessions() {
  const sessions = sshSessionManager.getAllSessions();
  logger.info('Cleaning up all SSH sessions', {
    count: sessions.length,
  });

  // Stop all tunnels for each session
  for (const session of sessions) {
    tunnelManager.stopAllForSession(session.id);
  }

  // Terminate all worker threads (v1.21.0)
  if (USE_WORKER_THREADS) {
    sshWorkerManager.terminateAll();
  }

  // Disconnect all sessions (handles SFTP, stream, client cleanup)
  sshSessionManager.disconnectAll();

  logger.info('All SSH sessions cleaned up');
}
