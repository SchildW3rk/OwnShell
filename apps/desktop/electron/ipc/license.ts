/**
 * License IPC Handlers
 *
 * Handles license activation, status, personal-use confirmation, and deactivation
 */

import { BrowserWindow } from 'electron';
import { z } from 'zod';
import { noPayloadSchema } from './schemas/common';
import { licenseManager } from '../license/license-manager';
import { logger } from '../logger';
import { safeHandle } from './safe-ipc';

const licenseKeySchema = z.string().min(1).max(1024);

export function setupLicenseHandlers(_mainWindow: BrowserWindow) {
  logger.info('Setting up license IPC handlers');

  licenseManager.onStatusChanged = () => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('license:status-changed');
    }
  };

  /**
   * Get license status
   */
  safeHandle('license:get-status', noPayloadSchema, async () => {
    try {
      logger.debug('IPC: license:get-status');
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

  /**
   * Confirm (true) or undo (false) "I only use OwnShell personally". Stored locally only.
   */
  safeHandle('license:set-personal-use', z.boolean(), async (_event, confirmed) => {
    return licenseManager.setPersonalUseConfirmed(confirmed);
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

  logger.info('License IPC handlers setup complete');
}
