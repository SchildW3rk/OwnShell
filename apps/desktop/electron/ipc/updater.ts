/**
 * Auto-Updater IPC Handlers (v1.22.0)
 *
 * Handles automatic updates via electron-updater:
 * - Check for updates on app start
 * - Download updates in background (if auto-update enabled)
 * - Manual download option (if auto-update disabled)
 * - Auto-install on quit (or manual trigger)
 * - Send progress to renderer
 */

import { BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { Kysely } from 'kysely';
import { z } from 'zod';
import { noPayloadSchema } from './schemas/common';
import { Database, SettingsQueries } from '@ownshell/core';
import { logger } from '../logger';
import { licenseManager } from '../license/license-manager';
import { updateLicenseCoverage, type UpdateLicenseCoverage } from '../license/types';
import { safeHandle } from './safe-ipc';

// Setting key for auto-update preference
const AUTO_UPDATE_SETTING_KEY = 'autoUpdateEnabled';
const booleanSchema = z.boolean();

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

interface SerializableUpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string | null;
  /** Honor notice only: 'uncovered' when the stored license's updatesUntil is before this release. */
  licenseCoverage: UpdateLicenseCoverage;
}

interface SerializableProgressInfo {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

interface UpdaterState {
  status: UpdateStatus;
  updateInfo?: SerializableUpdateInfo;
  progress?: SerializableProgressInfo;
  error?: string;
  autoUpdateEnabled: boolean;
  updatedAt: number;
}

// Configure auto-updater defaults
autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

// Module-level settings queries instance
let settingsQueries: SettingsQueries | null = null;
let updaterState: UpdaterState = {
  status: 'idle',
  autoUpdateEnabled: false,
  updatedAt: Date.now(),
};

async function getLicenseCoverage(releaseDate: string): Promise<UpdateLicenseCoverage> {
  try {
    const { license } = await licenseManager.getStatus();
    return updateLicenseCoverage(releaseDate, license);
  } catch (error) {
    logger.warn('Could not check update license coverage', error);
    return 'unknown';
  }
}

async function serializeUpdateInfo(info: UpdateInfo): Promise<SerializableUpdateInfo> {
  const licenseCoverage = await getLicenseCoverage(info.releaseDate);
  // Never install an uncovered or unverifiable update silently on quit; the user installs it after the notice.
  autoUpdater.autoInstallOnAppQuit = licenseCoverage === 'covered';
  return {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    licenseCoverage,
  };
}

function setUpdaterState(patch: Partial<UpdaterState>): UpdaterState {
  updaterState = {
    ...updaterState,
    ...patch,
    updatedAt: Date.now(),
  };
  return updaterState;
}

/**
 * Load auto-update setting and configure updater
 */
async function loadAutoUpdateSetting(): Promise<boolean> {
  try {
    if (!settingsQueries) {
      logger.warn('Settings queries not initialized, defaulting to manual updates');
      autoUpdater.autoDownload = false;
      return false;
    }
    const setting = await settingsQueries.get(AUTO_UPDATE_SETTING_KEY);
    // Default to false (manual updates) if not set
    const enabled = setting === 'true';
    autoUpdater.autoDownload = enabled;
    setUpdaterState({ autoUpdateEnabled: enabled });
    logger.info(`Auto-update setting loaded: ${enabled ? 'automatic' : 'manual'}`);
    return enabled;
  } catch (error) {
    logger.error('Failed to load auto-update setting, defaulting to manual:', error);
    autoUpdater.autoDownload = false;
    return false;
  }
}

/**
 * Setup auto-updater handlers
 */
export async function setupAutoUpdater(window: BrowserWindow, db: Kysely<Database>) {
  logger.info('Setting up auto-updater');

  // Initialize settings queries
  settingsQueries = new SettingsQueries(db);

  // Load the auto-update setting
  await loadAutoUpdateSetting();

  // ==================== AUTO-UPDATER EVENTS ====================

  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for updates...');
    setUpdaterState({ status: 'checking', error: undefined });
    window.webContents.send('updater:checking');
  });

  autoUpdater.on('update-available', async (info: UpdateInfo) => {
    logger.info('Update available:', info.version);
    const updateInfo = await serializeUpdateInfo(info);
    setUpdaterState({ status: 'available', updateInfo, progress: undefined, error: undefined });
    window.webContents.send('updater:available', updateInfo);
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    logger.info('No update available. Current version:', info.version);
    setUpdaterState({
      status: 'idle',
      updateInfo: undefined,
      progress: undefined,
      error: undefined,
    });
    window.webContents.send('updater:not-available', {
      version: info.version,
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    logger.info(`Download progress: ${progress.percent.toFixed(1)}%`);
    const serializedProgress = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    };
    setUpdaterState({ status: 'downloading', progress: serializedProgress, error: undefined });
    window.webContents.send('updater:progress', serializedProgress);
  });

  autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
    logger.info('Update downloaded:', info.version);
    const updateInfo = await serializeUpdateInfo(info);
    setUpdaterState({ status: 'ready', updateInfo, progress: undefined, error: undefined });
    window.webContents.send('updater:downloaded', updateInfo);
  });

  autoUpdater.on('error', (error: Error) => {
    logger.error('Auto-updater error:', error);
    setUpdaterState({ status: 'error', error: error.message, progress: undefined });
    window.webContents.send('updater:error', {
      message: error.message,
    });
  });

  // ==================== IPC HANDLERS ====================

  // Check for updates manually
  safeHandle('updater:check', noPayloadSchema, async () => {
    logger.info('Manual update check requested');
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        success: true,
        updateInfo: result?.updateInfo
          ? {
              version: result.updateInfo.version,
              releaseDate: result.updateInfo.releaseDate,
            }
          : null,
      };
    } catch (error) {
      logger.error('Failed to check for updates:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Download update manually (if autoDownload is false)
  safeHandle('updater:download', noPayloadSchema, async () => {
    logger.info('Manual download requested');
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      logger.error('Failed to download update:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Install update and restart app
  safeHandle('updater:install', noPayloadSchema, () => {
    logger.info('Installing update and restarting...');
    autoUpdater.quitAndInstall(false, true);
  });

  // Get current updater state so renderer can recover missed events.
  safeHandle('updater:getState', noPayloadSchema, () => updaterState);

  // Get auto-update setting
  safeHandle('updater:getAutoUpdate', noPayloadSchema, async () => {
    try {
      if (!settingsQueries) {
        return { enabled: false };
      }
      const setting = await settingsQueries.get(AUTO_UPDATE_SETTING_KEY);
      return { enabled: setting === 'true' };
    } catch (error) {
      logger.error('Failed to get auto-update setting:', error);
      return { enabled: false };
    }
  });

  // Set auto-update setting
  safeHandle('updater:setAutoUpdate', booleanSchema, async (_event, enabled) => {
    logger.info(`Setting auto-update to: ${enabled ? 'automatic' : 'manual'}`);
    try {
      if (!settingsQueries) {
        throw new Error('Settings queries not initialized');
      }
      await settingsQueries.set({
        key: AUTO_UPDATE_SETTING_KEY,
        value: enabled ? 'true' : 'false',
        updated_at: Date.now(),
      });
      // Apply the setting immediately
      autoUpdater.autoDownload = enabled;
      setUpdaterState({ autoUpdateEnabled: enabled });
      return { success: true };
    } catch (error) {
      logger.error('Failed to set auto-update setting:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Note: 'updater:version' is registered in main.ts (always available, even in dev)

  // ==================== INITIAL CHECK ====================

  // Check for updates after a short delay (let app fully load first)
  setTimeout(() => {
    logger.info('Running initial update check...');
    autoUpdater.checkForUpdates().catch((error) => {
      logger.error('Initial update check failed:', error);
    });
  }, 5000); // 5 seconds after app start

  // ==================== PERIODIC CHECK ====================

  // Check for updates every 30 minutes
  const CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes in ms

  setInterval(() => {
    logger.info('Running periodic update check...');
    autoUpdater.checkForUpdates().catch((error) => {
      logger.error('Periodic update check failed:', error);
    });
  }, CHECK_INTERVAL);
}
