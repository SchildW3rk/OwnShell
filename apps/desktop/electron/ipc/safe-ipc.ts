import { IpcMainEvent, IpcMainInvokeEvent, app, ipcMain } from 'electron';
import { z } from 'zod';
import { logger } from '../logger';
import { licenseManager } from '../license/license-manager';
import type { EntitlementFeature, FeatureEntitlementDecision } from '../license/types';
import { getEntitlementFeaturesForChannel } from './entitlement-gates';
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

function isDevelopmentMode(): boolean {
  return (
    !app.isPackaged &&
    (Boolean(process.env.VITE_DEV_SERVER_URL) || process.env.NODE_ENV === 'development')
  );
}

async function getDeniedEntitlementDecision(
  channel: string
): Promise<FeatureEntitlementDecision | null> {
  const requiredFeatures = getEntitlementFeaturesForChannel(channel);
  if (!requiredFeatures || isDevelopmentMode()) {
    return null;
  }

  try {
    const decision = await licenseManager.getFeatureDecision(requiredFeatures);
    return decision.allowed ? null : decision;
  } catch (error) {
    logger.warn('Could not verify feature entitlement', {
      channel,
      requiredFeatures,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      allowed: false,
      status: 'none',
      licenseValid: false,
      requiredFeatures: [...requiredFeatures],
      grantedFeatures: [],
      missingFeatures: [...requiredFeatures],
      checks: requiredFeatures.map((feature) => ({ feature, allowed: false })),
      reason: 'verification-failed',
    };
  }
}

function rejectMissingEntitlement(
  channel: string,
  decision: FeatureEntitlementDecision
): { success: false; error: string; code: string; features: EntitlementFeature[] } {
  const features =
    decision.missingFeatures.length > 0 ? decision.missingFeatures : decision.requiredFeatures;

  logger.warn('Rejected IPC invoke without required entitlement', {
    channel,
    requiredFeatures: decision.requiredFeatures,
    grantedFeatures: decision.grantedFeatures,
    missingFeatures: decision.missingFeatures,
    licenseStatus: decision.status,
    reason: decision.reason,
  });

  return {
    success: false,
    error: 'Feature not available for this license',
    code: 'FEATURE_NOT_ENTITLED',
    features: [...features],
  };
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

    const deniedEntitlement = await getDeniedEntitlementDecision(channel);
    if (deniedEntitlement) {
      return rejectMissingEntitlement(channel, deniedEntitlement);
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

    const deniedEntitlement = await getDeniedEntitlementDecision(channel);
    if (deniedEntitlement) {
      return rejectMissingEntitlement(channel, deniedEntitlement);
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
