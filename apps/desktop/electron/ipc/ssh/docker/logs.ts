import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { ISSHShell } from '@ownshell/core';
import { logger } from '../../../logger';
import { shellQuote } from '../../../utils/shell-quote';
import { safeHandle } from '../../safe-ipc';
import { sshSessionSchema } from '../../schemas/ssh';
import { dockerLogsStreamStartSchema, dockerLogsStreamStopSchema } from '../../schemas/docker';
import { releaseDockerBackgroundSession, SSHDockerContext } from './context';

export function setupDockerLogHandlers(ctx: SSHDockerContext) {
  const { activeSessions, execCommand, requireClient } = ctx;

  interface DockerLogStreamData {
    sessionId: string;
    containerId: string;
    shell: ISSHShell;
    backgroundSessionId?: string;
  }
  const dockerLogStreams = new Map<string, DockerLogStreamData>();
  // ============================================
  // DOCKER LIVE LOGS HANDLER
  // ============================================
  
  /**
   * Start streaming logs for a container
   */
  safeHandle(
    'ssh:docker:logs-stream-start',
    dockerLogsStreamStartSchema,
    async (_event, params) => {
      let backgroundSessionId: string | undefined;
      let shellStream: ISSHShell | undefined;
      let cleanup: (() => void) | undefined;
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        const streamId = uuidv4();
        const mainWindow = BrowserWindow.getAllWindows()[0];
  
        if (!mainWindow) {
          throw new Error('No main window found');
        }
  
        const tailLines = params.tail || 100;
  
        // For worker sessions, use background connection for shell streaming
        let effectiveSession = session;
        if (session.isWorkerSession) {
          backgroundSessionId = await ctx.createBackgroundSSHSession(session.hostId);
          const bgSession = activeSessions.get(backgroundSessionId);
          if (!bgSession || !bgSession.client) {
            throw new Error('Failed to get background SSH session for log streaming');
          }
          effectiveSession = bgSession;
        }
  
        // Create a shell and run docker logs -f
        shellStream = await requireClient(effectiveSession).shell({
          term: 'xterm-256color',
          cols: 200,
          rows: 50,
        });
        const stream: DockerLogStreamData = {
          sessionId: params.sessionId,
          containerId: params.containerId,
          shell: shellStream,
          backgroundSessionId,
        };
        cleanup = () => {
          dockerLogStreams.delete(streamId);
          releaseDockerBackgroundSession(stream);
        };
        dockerLogStreams.set(streamId, stream);
  
        // Buffer for collecting log data
        let buffer = '';
  
        shellStream.onData((data: Buffer) => {
          buffer += data.toString('utf-8');
  
          // Send data in chunks
          if (buffer.length > 0) {
            mainWindow.webContents.send('ssh:docker:logs-stream-data', {
              streamId,
              data: buffer,
            });
            buffer = '';
          }
        });
  
        shellStream.onClose(() => {
          cleanup?.();
          if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('ssh:docker:logs-stream-end', { streamId });
          }
        });
        shellStream.onError(() => {
          if (!dockerLogStreams.delete(streamId)) return;
          try { stream.shell.close(); }
          finally { cleanup?.(); }
        });
  
        // Start streaming logs
        shellStream.write(
          `docker logs -f --tail ${shellQuote(tailLines)} ${shellQuote(params.containerId)}\n`
        );
  
        logger.info('Started log stream', {
          streamId,
          containerId: params.containerId,
          tail: tailLines,
        });
  
        return {
          success: true,
          streamId,
        };
      } catch (error) {
        try { shellStream?.close(); }
        catch (closeError) { logger.warn('Failed to close Docker log shell after start failure', { closeError }); }
        finally {
          if (cleanup) cleanup();
          else releaseDockerBackgroundSession({ backgroundSessionId });
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  /**
   * Stop streaming logs
   */
  safeHandle(
    'ssh:docker:logs-stream-stop',
    dockerLogsStreamStopSchema,
    async (_event, params) => {
      try {
        const stream = dockerLogStreams.get(params.streamId);
        if (stream) {
          dockerLogStreams.delete(params.streamId);
          try { stream.shell.close(); }
          finally { releaseDockerBackgroundSession(stream); }
          logger.info('Stopped log stream', { streamId: params.streamId });
        }
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  /**
   * Get host memory info for memory limit display
   */
  safeHandle(
    'ssh:docker:host-memory',
    sshSessionSchema,
    async (_event, params) => {
      try {
        const session = activeSessions.get(params.sessionId);
        if (!session) {
          throw new Error('SSH session not found');
        }
  
        // Get total memory from /proc/meminfo
        const result = await execCommand(session, "grep MemTotal /proc/meminfo | awk '{print $2}'");
  
        if (result.exitCode !== 0) {
          return { success: false, error: 'Failed to get host memory' };
        }
  
        const memKb = parseInt(result.stdout.trim(), 10);
        const memBytes = memKb * 1024;
  
        return {
          success: true,
          totalMemory: memBytes,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    }
  );
  
  
  
}
