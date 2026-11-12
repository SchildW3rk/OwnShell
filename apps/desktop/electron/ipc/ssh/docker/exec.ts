import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { ISSHShell } from '@ownshell/core';
import { SSHStreamHandler } from '../../../ssh/stream-handler';
import { logger } from '../../../logger';
import { shellQuote } from '../../../utils/shell-quote';
import { safeHandle, safeOn } from '../../safe-ipc';
import { dockerExecResizeSchema, dockerExecSendSchema, dockerExecSessionSchema, dockerExecStartSchema } from '../../schemas/docker';
import { releaseDockerBackgroundSession, SSHDockerContext } from './context';

export function setupDockerExecHandlers(ctx: SSHDockerContext) {
  const { activeSessions, requireClient } = ctx;

  interface DockerExecSessionData {
    sessionId: string;
    containerId: string;
    streamHandler: SSHStreamHandler;
    backgroundSessionId?: string;
  }

  const dockerExecSessions = new Map<string, DockerExecSessionData>();
  /**
   * Start Docker exec session (attach shell to container)
   *
   * Worker sessions get an exclusively owned Main Process SSH connection;
   * closing this exec never disconnects another stream or the user's session.
   */
  safeHandle(
    'ssh:docker:exec-start',
    dockerExecStartSchema,
    async (_event, params) => {
      let backgroundSessionId: string | undefined;
      let shellStream: ISSHShell | undefined;
      let execStreamHandler: SSHStreamHandler | undefined;
      let cleanup: (() => void) | undefined;
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const shell = params.shell || '/bin/sh';
        const execSessionId = uuidv4();
        const mainWindow = BrowserWindow.getAllWindows()[0];
  
        if (!mainWindow) {
          throw new Error('No main window found');
        }
  
        // For worker sessions, use a background SSH connection (v1.21.0)
        let effectiveSession = session;
  
        if (session.isWorkerSession) {
          logger.info('Worker session detected, using background SSH connection for Docker exec', {
            sessionId: params.sessionId,
            hostId: session.hostId,
          });
  
          backgroundSessionId = await ctx.createBackgroundSSHSession(session.hostId);
          const bgSession = activeSessions.get(backgroundSessionId);
  
          if (!bgSession) {
            throw new Error('Failed to get background SSH session');
          }
  
          effectiveSession = bgSession;
        }
  
        // Create a new shell with docker exec command
        shellStream = await requireClient(effectiveSession).shell({
          term: 'xterm-256color',
          cols: params.cols || 80,
          rows: params.rows || 24,
        });
  
        // Create a stream handler for this exec session (adaptive buffering)
        execStreamHandler = new SSHStreamHandler(mainWindow, shellStream, {
          sessionId: execSessionId,
          maxBufferSize: 8192, // 8KB
        });
  
        const execSession: DockerExecSessionData = {
          sessionId: params.sessionId,
          containerId: params.containerId,
          streamHandler: execStreamHandler,
          backgroundSessionId,
        };
        cleanup = () => {
          dockerExecSessions.delete(execSessionId);
          releaseDockerBackgroundSession(execSession);
        };
        dockerExecSessions.set(execSessionId, execSession);
        shellStream.onClose(cleanup);
        shellStream.onError(() => {
          if (!dockerExecSessions.delete(execSessionId)) return;
          try { execSession.streamHandler.close(); }
          finally { cleanup?.(); }
        });
  
        // Send the docker exec command
        shellStream.write(
          `docker exec -it ${shellQuote(params.containerId)} ${shellQuote(shell)}\n`
        );
  
        logger.info('Docker exec session started', {
          sessionId: params.sessionId,
          execSessionId,
          containerId: params.containerId,
          shell,
          usedBackgroundSession: !!backgroundSessionId,
        });
  
        return {
          success: true,
          execSessionId,
        };
      } catch (error) {
        try {
          if (execStreamHandler) execStreamHandler.close();
          else shellStream?.close();
        } catch (closeError) {
          logger.warn('Failed to close Docker exec shell after start failure', { closeError });
        } finally {
          if (cleanup) cleanup();
          else releaseDockerBackgroundSession({ backgroundSessionId });
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to start Docker exec', {
          sessionId: params.sessionId,
          containerId: params.containerId,
          errorMessage,
        });
  
        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  );
  
  /**
   * Send data to Docker exec session
   * Fire-and-forget for minimal latency - no Promise overhead
   */
  safeOn('ssh:docker:exec-send', dockerExecSendSchema, (_event, params) => {
    const execSession = dockerExecSessions.get(params.execSessionId);
    if (execSession?.streamHandler) {
      execSession.streamHandler.write(params.data);
    }
    // No return - fire-and-forget for performance
  });
  
  /**
   * Resize Docker exec terminal
   * Fire-and-forget for minimal latency - no Promise overhead
   */
  safeOn(
    'ssh:docker:exec-resize',
    dockerExecResizeSchema,
    (_event, params) => {
      const execSession = dockerExecSessions.get(params.execSessionId);
      if (execSession?.streamHandler) {
        execSession.streamHandler.resize(params.cols, params.rows);
      }
      // No return - fire-and-forget for performance
    }
  );
  
  /**
   * Close Docker exec session
   */
  safeHandle(
    'ssh:docker:exec-close',
    dockerExecSessionSchema,
    async (_event, params) => {
      try {
        const execSession = dockerExecSessions.get(params.execSessionId);
        if (execSession) {
          dockerExecSessions.delete(params.execSessionId);
          try { execSession.streamHandler.close(); }
          finally { releaseDockerBackgroundSession(execSession); }
          logger.info('Docker exec session closed', {
            execSessionId: params.execSessionId,
          });
        }
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  );
  
  
}
