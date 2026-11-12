/**
 * SSH Session Manager (v1.20.0)
 *
 * Manages detached SSH sessions that survive UI component unmounts
 *
 * Features:
 * - Session persistence: SSH connections survive view changes
 * - Keep-alive: Sessions stay active for 15 minutes when not displayed
 * - Viewer tracking: Multiple UI components can attach to same session
 * - Auto-cleanup: Idle sessions auto-disconnect after timeout
 * - Reconnect optimization: Instant "reattach" instead of new SSH handshake
 */

import { BrowserWindow } from 'electron';
import { SSH2Adapter } from './ssh2-adapter';
import { SSHStreamHandler } from './stream-handler';
import { ISSHSFTP } from '@ownshell/core';
import { logger } from '../logger';

/**
 * Session State
 */
export type SessionState = 'active' | 'idle' | 'disconnected';

/**
 * Managed SSH Session
 * Extends basic SSH session with detached session capabilities
 */
export interface ManagedSSHSession {
  id: string;
  client: SSH2Adapter | null; // null for worker-based sessions
  streamHandler: SSHStreamHandler | null;
  sftpClient: ISSHSFTP | null;
  sftpSessionId?: string;
  sftpClientPromise?: Promise<ISSHSFTP>;
  hostId: string;
  hostname: string;
  username: string;

  // Worker Thread fields (v1.21.0)
  isWorkerSession: boolean;
  workerId?: string; // Worker thread identifier

  // Detached session fields
  state: SessionState;
  lastActivityTime: number;
  keepAliveTimerId: NodeJS.Timeout | null;
  attachedViewers: Set<string>; // UI component IDs that are using this session
  createdAt: number;

  // Replay Buffer (v1.20.0 Phase 2)
  replayBuffer: string; // Rolling terminal output (capped by byte size)
  replayBufferSize: number; // Current size in bytes for fast tracking
}

/**
 * Session Manager
 * Manages lifecycle of detached SSH sessions
 */
export class SSHSessionManager {
  private sessions = new Map<string, ManagedSSHSession>();
  private mainWindow: BrowserWindow | null = null;
  private readonly IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private readonly REPLAY_BUFFER_MAX_BYTES = 256 * 1024; // 256KB max replay buffer per session

  /**
   * Initialize session manager with main window reference
   */
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    logger.info('SSH Session Manager initialized', {
      idleTimeoutMinutes: this.IDLE_TIMEOUT_MS / 60000,
    });
  }

  /**
   * Create a new managed session
   *
   * @param sessionId - Unique session identifier
   * @param client - SSH2Adapter instance (null for worker-based sessions)
   * @param hostId - Host identifier from database
   * @param hostname - SSH host
   * @param username - SSH username
   * @param streamHandler - Optional stream handler
   * @param isWorkerSession - Whether this is a worker-based session (v1.21.0)
   * @param workerId - Worker thread identifier (v1.21.0)
   */
  createSession(
    sessionId: string,
    client: SSH2Adapter | null,
    hostId: string,
    hostname: string,
    username: string,
    streamHandler: SSHStreamHandler | null = null,
    isWorkerSession: boolean = false,
    workerId?: string
  ): ManagedSSHSession {
    const session: ManagedSSHSession = {
      id: sessionId,
      client,
      streamHandler,
      sftpClient: null,
      hostId,
      hostname,
      username,
      isWorkerSession,
      workerId,
      state: 'active',
      lastActivityTime: Date.now(),
      keepAliveTimerId: null,
      attachedViewers: new Set(),
      createdAt: Date.now(),
      replayBuffer: '', // v1.20.0 Phase 2: Terminal replay buffer
      replayBufferSize: 0,
    };

    this.sessions.set(sessionId, session);

    logger.info('SSH session created', {
      sessionId,
      hostId,
      hostname,
      username,
      isWorkerSession,
    });

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ManagedSSHSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Find session by host ID
   * Returns the first active or idle session for this host
   */
  findSessionByHostId(hostId: string): ManagedSSHSession | null {
    for (const session of this.sessions.values()) {
      if (session.hostId === hostId && session.state !== 'disconnected') {
        return session;
      }
    }
    return null;
  }

  /**
   * Attach a viewer (UI component) to a session
   * Stops idle timer if session was idle
   */
  attachViewer(sessionId: string, viewerId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Cannot attach viewer: session not found', { sessionId, viewerId });
      return;
    }

    // Add viewer
    session.attachedViewers.add(viewerId);
    session.lastActivityTime = Date.now();

    // If session was idle, stop the idle timer and make it active
    if (session.state === 'idle') {
      this.stopIdleTimer(sessionId);
    }

    logger.info('Viewer attached to session', {
      sessionId,
      viewerId,
      totalViewers: session.attachedViewers.size,
      state: session.state,
    });
  }

  /**
   * Detach a viewer from a session
   * Starts idle timer if no viewers remain
   */
  detachViewer(sessionId: string, viewerId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Cannot detach viewer: session not found', { sessionId, viewerId });
      return;
    }

    // Remove viewer
    session.attachedViewers.delete(viewerId);
    session.lastActivityTime = Date.now();

    logger.info('Viewer detached from session', {
      sessionId,
      viewerId,
      remainingViewers: session.attachedViewers.size,
    });

    // If no viewers remain, start idle timer
    if (session.attachedViewers.size === 0 && session.state === 'active') {
      this.startIdleTimer(sessionId);
    }
  }

  /**
   * Start idle timer for a session
   * After timeout, session will be disconnected
   */
  private startIdleTimer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clear any existing timer
    if (session.keepAliveTimerId) {
      clearTimeout(session.keepAliveTimerId);
    }

    // Mark as idle
    session.state = 'idle';

    // Start timer
    session.keepAliveTimerId = setTimeout(() => {
      logger.info('Session idle timeout - disconnecting', {
        sessionId,
        hostId: session.hostId,
        idleMinutes: this.IDLE_TIMEOUT_MS / 60000,
      });

      this.disconnect(sessionId, 'idle-timeout');
    }, this.IDLE_TIMEOUT_MS);

    logger.info('Session marked as idle - timer started', {
      sessionId,
      timeoutMinutes: this.IDLE_TIMEOUT_MS / 60000,
    });
  }

  /**
   * Stop idle timer and mark session as active
   */
  private stopIdleTimer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.keepAliveTimerId) {
      clearTimeout(session.keepAliveTimerId);
      session.keepAliveTimerId = null;
    }

    session.state = 'active';

    logger.info('Session reactivated - idle timer stopped', {
      sessionId,
    });
  }

  /**
   * Disconnect and cleanup a session
   */
  disconnect(sessionId: string, reason: string = 'manual'): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Cannot disconnect: session not found', { sessionId });
      return;
    }

    logger.info('Disconnecting SSH session', {
      sessionId,
      hostId: session.hostId,
      reason,
      wasIdle: session.state === 'idle',
    });

    // Clear idle timer
    if (session.keepAliveTimerId) {
      clearTimeout(session.keepAliveTimerId);
      session.keepAliveTimerId = null;
    }

    // Close stream handler (stops buffering, flushes remaining data)
    if (session.streamHandler) {
      try {
        session.streamHandler.close();
      } catch (error) {
        logger.error('Error closing stream handler', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      session.streamHandler = null;
    }

    // Close SFTP if open
    if (session.sftpClient) {
      try {
        session.sftpClient.close();
      } catch (error) {
        logger.error('Error closing SFTP client', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      session.sftpClient = null;
    }

    // Worker SFTP uses an owned main-process transport, not a host-global warm connection.
    if (session.sftpSessionId) {
      const helperSessionId = session.sftpSessionId;
      delete session.sftpSessionId;
      this.disconnect(helperSessionId, 'sftp-owner-closed');
    }

    // Disconnect and destroy SSH client (only for non-worker sessions)
    // Worker sessions are terminated via WorkerManager
    if (session.client && !session.isWorkerSession) {
      try {
        session.client.disconnect();
        session.client.destroy();
      } catch (error) {
        logger.error('Error disconnecting SSH client', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Clear replay buffer to free memory
    session.replayBuffer = '';
    session.replayBufferSize = 0;

    // Mark as disconnected
    session.state = 'disconnected';

    // Notify frontend if idle timeout
    if (reason === 'idle-timeout' && this.mainWindow) {
      this.mainWindow.webContents.send('ssh:session-idle-timeout', {
        sessionId,
        hostId: session.hostId,
      });
    }

    // Remove from sessions map
    this.sessions.delete(sessionId);

    logger.info('SSH session removed', {
      sessionId,
      reason,
      totalSessions: this.sessions.size,
    });
  }

  /**
   * Disconnect all sessions (e.g., on app quit)
   */
  disconnectAll(): void {
    logger.info('Disconnecting all SSH sessions', {
      count: this.sessions.size,
    });

    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      this.disconnect(sessionId, 'app-quit');
    }
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): ManagedSSHSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Add data to replay buffer (v1.20.0 Phase 2)
   * Called when SSH data is received, stores raw terminal output for replay.
   * Uses a single string with byte-size cap to avoid array reallocation overhead.
   */
  addToReplayBuffer(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Only buffer when session is idle (no viewers attached)
    // When a viewer is attached, xterm.js already holds the visible content
    if (session.attachedViewers.size > 0) return;

    session.replayBuffer += data;
    session.replayBufferSize += data.length;

    // Trim from the front when exceeding max size
    if (session.replayBufferSize > this.REPLAY_BUFFER_MAX_BYTES) {
      const excess = session.replayBufferSize - this.REPLAY_BUFFER_MAX_BYTES;
      session.replayBuffer = session.replayBuffer.substring(excess);
      session.replayBufferSize = session.replayBuffer.length;
    }
  }

  /**
   * Get replay buffer for a session (v1.20.0 Phase 2)
   * Returns accumulated terminal output for instant replay on reconnect
   */
  getReplayBuffer(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';

    return session.replayBuffer;
  }

  /**
   * Clear replay buffer (v1.20.0 Phase 2)
   */
  clearReplayBuffer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.replayBuffer = '';
      session.replayBufferSize = 0;
    }
  }

  /**
   * Get session statistics
   */
  getStats(): {
    total: number;
    active: number;
    idle: number;
    disconnected: number;
  } {
    const sessions = Array.from(this.sessions.values());

    return {
      total: sessions.length,
      active: sessions.filter((s) => s.state === 'active').length,
      idle: sessions.filter((s) => s.state === 'idle').length,
      disconnected: sessions.filter((s) => s.state === 'disconnected').length,
    };
  }
}

// Singleton instance
export const sshSessionManager = new SSHSessionManager();
