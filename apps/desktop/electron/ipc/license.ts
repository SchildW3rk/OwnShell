/**
 * License IPC Handlers
 *
 * Handles license activation, trial, status, and deactivation
 */

import { app, BrowserWindow } from 'electron';
import { z } from 'zod';
import { noPayloadSchema } from './schemas/common';
import { licenseManager } from '../license/license-manager';
import { KNOWN_ENTITLEMENT_FEATURES } from '../license/types';
import { logger } from '../logger';
import { safeHandle } from './safe-ipc';

const licenseKeySchema = z.string().min(1).max(1024);

function isDevelopmentMode(): boolean {
  return (
    !app.isPackaged &&
    (Boolean(process.env.VITE_DEV_SERVER_URL) || process.env.NODE_ENV === 'development')
  );
}

export function setupLicenseHandlers(_mainWindow: BrowserWindow) {
  logger.info('Setting up license IPC handlers');

  /**
   * Get license status
   */
  safeHandle('license:get-status', noPayloadSchema, async () => {
    try {
      logger.debug('IPC: license:get-status');
      if (isDevelopmentMode()) {
        return {
          status: 'active' as const,
          licenseType: 'Development',
          features: [...KNOWN_ENTITLEMENT_FEATURES],
        };
      }
      return await licenseManager.getStatus();
    } catch (error) {
      logger.error('Failed to get license status', error);
      throw error;
    }
  });

  /**
   * Activate license with key
   */
  safeHandle('license:activate', licenseKeySchema, async (_event, key) => {
    try {
      logger.info('IPC: license:activate');
      return await licenseManager.activate(key);
    } catch (error) {
      logger.error('Failed to activate license', error);
      throw error;
    }
  });

  safeHandle('license:start-trial', noPayloadSchema, async () => {
    return licenseManager.startTrial();
  });

  /**
   * Deactivate license
   */
  safeHandle('license:deactivate', noPayloadSchema, async () => {
    try {
      logger.info('IPC: license:deactivate');
      return await licenseManager.deactivate();
    } catch (error) {
      logger.error('Failed to deactivate license', error);
      throw error;
    }
  });

  /**
   * Check if license is valid
   */
  safeHandle('license:is-valid', noPayloadSchema, async () => {
    try {
      logger.debug('IPC: license:is-valid');
      if (isDevelopmentMode()) {
        return true;
      }
      return await licenseManager.isValid();
    } catch (error) {
      logger.error('Failed to check license validity', error);
      throw error;
    }
  });

  /**
   * Quit the app
   */
  safeHandle('app:quit', noPayloadSchema, () => {
    logger.info('IPC: app:quit - User requested app quit');
    app.quit();
  });

  logger.info('License IPC handlers setup complete');
}
