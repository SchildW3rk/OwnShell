import { BrowserWindow } from 'electron';
import { z } from 'zod';
import { localPtyManager } from '../pty/local-pty-manager';
import { logger } from '../logger';
import { safeHandle, safeOn } from './safe-ipc';

const createLocalPtySchema = z
  .object({
    shell: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    cols: z.number().finite().positive().optional(),
    rows: z.number().finite().positive().optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .optional();

const ptyWriteSchema = z.object({
  sessionId: z.string().min(1),
  data: z.string(),
});

const ptyResizeSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().finite().positive(),
  rows: z.number().finite().positive(),
});

const ptyKillSchema = z.string().min(1);

export function setupLocalPtyHandlers(mainWindow: BrowserWindow) {
  localPtyManager.setMainWindow(mainWindow);

  safeHandle('pty:create', createLocalPtySchema, async (_event, params) => {
    try {
      const result = localPtyManager.create(params);
      return { success: true, ...result };
    } catch (error) {
      logger.error('Failed to create local PTY', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create local PTY',
      };
    }
  });

  safeOn('pty:write', ptyWriteSchema, (_event, params) => {
    localPtyManager.write(params.sessionId, params.data);
  });

  safeOn('pty:resize', ptyResizeSchema, (_event, params) => {
    localPtyManager.resize(params.sessionId, params.cols, params.rows);
  });

  safeHandle('pty:kill', ptyKillSchema, async (_event, sessionId) => {
    localPtyManager.kill(sessionId);
    return { success: true };
  });

  logger.info('Local PTY IPC handlers registered');
}

export async function cleanupLocalPtySessions() {
  await localPtyManager.killAll();
}
