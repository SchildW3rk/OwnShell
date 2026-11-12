import { logger } from '../../logger';
import { sshSessionManager } from '../../ssh/session-manager';
import { sshWorkerManager } from '../../ssh/worker-manager';
import { tunnelManager } from '../../ssh/tunnel-manager';
import { safeHandle, safeOn } from '../safe-ipc';
import { hostIdSchema, noPayloadSchema, sshResizeSchema, sshSendSchema, sshSessionSchema, sshViewerSchema } from '../schemas/ssh';
import type { SSHIPCContext } from './context';

export function setupSSHTerminalHandlers(ctx: SSHIPCContext) {
  const { activeSessions } = ctx;
  /**
   * Send data to SSH session (user input)
   * Fire-and-forget for minimal latency - no Promise overhead
   */
  safeOn('ssh:send', sshSendSchema, (_event, params) => {
    const session = activeSessions.get(params.sessionId);
    if (!session) return;

    // Route to Worker or StreamHandler based on session type
    if (session.isWorkerSession) {
      sshWorkerManager.send(params.sessionId, params.data);
    } else if (session.streamHandler) {
      session.streamHandler.write(params.data);
    }
    // No return - fire-and-forget for performance
  });

  /**
   * Resize SSH terminal
   * Fire-and-forget for minimal latency - no Promise overhead
   */
  safeOn('ssh:resize', sshResizeSchema, (_event, params) => {
    const session = activeSessions.get(params.sessionId);
    if (!session) return;

    // Route to Worker or StreamHandler based on session type
    if (session.isWorkerSession) {
      sshWorkerManager.resize(params.sessionId, params.cols, params.rows);
    } else if (session.streamHandler) {
      session.streamHandler.resize(params.cols, params.rows);
    }
    // No return - fire-and-forget for performance
  });

  /**
   * Disconnect SSH session
   */
  safeHandle('ssh:disconnect', sshSessionSchema, async (_event, params) => {
    try {
      const session = activeSessions.get(params.sessionId);

      if (!session) {
        logger.warn('Attempted to disconnect non-existent session', {
          sessionId: params.sessionId,
        });
        return { success: true }; // Already disconnected
      }

      logger.info('Disconnecting SSH session', {
        sessionId: params.sessionId,
        hostname: session.hostname,
        isWorkerSession: session.isWorkerSession,
      });

      // Stop all tunnels for this session (not managed by sshSessionManager)
      tunnelManager.stopAllForSession(params.sessionId);

      // Terminate worker if worker-based session
      if (session.isWorkerSession) {
        sshWorkerManager.terminate(params.sessionId);
      }

      // Disconnect via SessionManager (handles SFTP, stream, client cleanup)
      sshSessionManager.disconnect(params.sessionId, 'manual');

      logger.info('SSH session disconnected', { sessionId: params.sessionId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to disconnect SSH session', {
        sessionId: params.sessionId,
        error,
      });

      // Force cleanup on error
      sshSessionManager.disconnect(params.sessionId, 'error');

      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  });

  /**
   * Get active sessions
   */
  safeHandle('ssh:get-sessions', noPayloadSchema, async () => {
    const sessions = Array.from(activeSessions.values()).map((session) => ({
      id: session.id,
      hostId: session.hostId,
      hostname: session.hostname,
      username: session.username,
    }));

    return { success: true, sessions };
  });


/**
 * Attach viewer to existing SSH session (v1.20.0)
 * Re-attaches to a detached/background session
 */
safeHandle(
  'ssh:attach',
  sshViewerSchema,
  async (_event, params) => {
    try {
      const session = sshSessionManager.getSession(params.sessionId);

      if (!session) {
        logger.warn('Cannot attach: session not found', params);
        return {
          success: false,
          error: {
            message: 'Session not found',
          },
        };
      }

      if (session.state === 'disconnected') {
        logger.warn('Cannot attach: session is disconnected', params);
        return {
          success: false,
          error: {
            message: 'Session is disconnected',
          },
        };
      }

      // Attach viewer (will stop idle timer if session was idle)
      sshSessionManager.attachViewer(params.sessionId, params.viewerId);

      // Get replay buffer for terminal replay (v1.20.0 Phase 2)
      const replayBuffer = sshSessionManager.getReplayBuffer(params.sessionId);

      logger.info('Viewer attached to existing session', {
        ...params,
        sessionState: session.state,
        hostId: session.hostId,
        replayBufferLines: replayBuffer.length,
      });

      return {
        success: true,
        sessionState: session.state,
        replayBuffer, // Already a string
      };
    } catch (error) {
      logger.error('Failed to attach viewer', { error, params });
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
);

/**
 * Detach viewer from SSH session (v1.20.0)
 * Session will go idle after 15 minutes if no viewers attached
 */
safeHandle(
  'ssh:detach',
  sshViewerSchema,
  async (_event, params) => {
    try {
      sshSessionManager.detachViewer(params.sessionId, params.viewerId);
      logger.info('Viewer detached from session', params);
      return { success: true };
    } catch (error) {
      logger.error('Failed to detach viewer', { error, params });
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
);

/**
 * Find existing session for a host (v1.20.0)
 * Returns session ID if an active/idle session exists for this host
 */
safeHandle(
  'ssh:findSessionForHost',
  hostIdSchema,
  async (_event, params) => {
    try {
      const session = sshSessionManager.findSessionByHostId(params.hostId);

      if (session && session.state !== 'disconnected') {
        logger.info('Found existing session for host', {
          hostId: params.hostId,
          sessionId: session.id,
          state: session.state,
        });

        return {
          success: true,
          sessionId: session.id,
          state: session.state,
        };
      }

      return {
        success: true,
        sessionId: null,
        state: null,
      };
    } catch (error) {
      logger.error('Failed to find session for host', { error, params });
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
);


}
