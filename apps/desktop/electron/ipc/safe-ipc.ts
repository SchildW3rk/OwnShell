import { IpcMainEvent, IpcMainInvokeEvent, app, ipcMain } from 'electron';
import { z } from 'zod';
import { logger } from '../logger';
import { validateSafeIpcPayload } from './safe-ipc-validation';

type SafeHandleResult = unknown | Promise<unknown>;
type SafeIpcEvent = IpcMainEvent | IpcMainInvokeEvent;

const APP_PROTOCOL = 'ownshell:';
const APP_PROTOCOL_HOST = 'app';
const APP_PROTOCOL_INDEX_PATH = '/index.html';

function isProductionAppUrl(frameUrl: URL): boolean {
  return (
    frameUrl.protocol === APP_PROTOCOL &&
    frameUrl.hostname === APP_PROTOCOL_HOST &&
    frameUrl.pathname === APP_PROTOCOL_INDEX_PATH
  );
}

function isAuthorizedIpcSender(event: SafeIpcEvent): boolean {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) {
    return false;
  }

  try {
    const frameUrl = new URL(frame.url);
    const devServerUrl =
      !app.isPackaged && process.env.VITE_DEV_SERVER_URL
        ? process.env.VITE_DEV_SERVER_URL
        : undefined;

    if (devServerUrl) {
      return frameUrl.origin === new URL(devServerUrl).origin;
    }

    return isProductionAppUrl(frameUrl);
  } catch {
    return false;
  }
}

function rejectUnauthorizedIpcSender(
  channel: string,
  event: SafeIpcEvent
): { success: false; error: string } {
  logger.warn('Rejected unauthorized IPC sender', {
    channel,
    frameUrl: event.senderFrame?.url,
  });
  return { success: false, error: 'Unauthorized IPC sender' };
}

export function safeHandle<TSchema extends z.ZodTypeAny>(
  channel: string,
  schema: TSchema,
  handler: (event: IpcMainInvokeEvent, payload: z.infer<TSchema>) => SafeHandleResult
): void {
  ipcMain.handle(channel, async (event, payload: unknown) => {
    if (!isAuthorizedIpcSender(event)) {
      return rejectUnauthorizedIpcSender(channel, event);
    }

    const parsed = validateSafeIpcPayload(schema, payload);
    if (!parsed.success) {
      logger.warn('Rejected invalid IPC invoke payload', {
        channel,
        issues: parsed.issues,
      });
      return { success: false, error: 'Invalid IPC payload' };
    }

    return handler(event, parsed.data);
  });
}

export function safeHandleArgs<TSchema extends z.ZodTypeAny>(
  channel: string,
  schema: TSchema,
  handler: (event: IpcMainInvokeEvent, payload: z.infer<TSchema>) => SafeHandleResult
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (!isAuthorizedIpcSender(event)) {
      return rejectUnauthorizedIpcSender(channel, event);
    }

    const parsed = validateSafeIpcPayload(schema, args);
    if (!parsed.success) {
      logger.warn('Rejected invalid IPC invoke args', {
        channel,
        issues: parsed.issues,
      });
      return { success: false, error: 'Invalid IPC payload' };
    }

    return handler(event, parsed.data);
  });
}

export function safeOn<TSchema extends z.ZodTypeAny>(
  channel: string,
  schema: TSchema,
  handler: (event: IpcMainEvent, payload: z.infer<TSchema>) => void
): void {
  ipcMain.on(channel, (event, payload: unknown) => {
    if (!isAuthorizedIpcSender(event)) {
      rejectUnauthorizedIpcSender(channel, event);
      return;
    }

    const parsed = validateSafeIpcPayload(schema, payload);
    if (!parsed.success) {
      logger.warn('Rejected invalid IPC event payload', {
        channel,
        issues: parsed.issues,
      });
      return;
    }

    handler(event, parsed.data);
  });
}
