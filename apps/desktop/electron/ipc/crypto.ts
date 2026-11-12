/**
 * Crypto/Auth IPC Handlers
 *
 * Handles master password setup, unlock, and lock operations
 */

import { BrowserWindow } from 'electron';
import { z } from 'zod';
import { noPayloadSchema } from './schemas/common';
import type { Kysely } from 'kysely';
import { SETTINGS_KEYS, SettingsQueries, type Database } from '@ownshell/core';
import { cryptoManager } from '../security/crypto';
import { AutoLockManager } from '../security/auto-lock';
import { logger } from '../logger';
import { safeHandle, safeHandleArgs } from './safe-ipc';

let autoLockManager: AutoLockManager | null = null;

const DEFAULT_AUTO_LOCK_MINUTES = 5;
const autoLockMinutesSchema = z.number().int().min(1).max(60);
let autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES;

/** Parses a stored auto-lock value; anything invalid falls back to the default. */
export function parseAutoLockMinutes(value: string | null | undefined): number {
  const parsed = autoLockMinutesSchema.safeParse(Number(value));
  return parsed.success ? parsed.data : DEFAULT_AUTO_LOCK_MINUTES;
}

const passwordSchema = z.string().min(1).max(1024);
const secretStringSchema = z.string().min(1).max(10 * 1024 * 1024);
const resetWithRecoverySchema = z.tuple([secretStringSchema, passwordSchema]);

export function setupCryptoHandlers(mainWindow: BrowserWindow, db: Kysely<Database>) {
  logger.info('Setting up crypto IPC handlers');

  const settingsQueries = new SettingsQueries(db);
  void settingsQueries
    .get(SETTINGS_KEYS.AUTO_LOCK_TIMEOUT)
    .then((value) => {
      autoLockMinutes = parseAutoLockMinutes(value);
    })
    .catch((error) => logger.error('Failed to load auto-lock timeout', error));

  safeHandle('crypto:get-auto-lock-timeout', noPayloadSchema, () => autoLockMinutes);

  safeHandle('crypto:set-auto-lock-timeout', autoLockMinutesSchema, async (_event, minutes) => {
    await settingsQueries.set({
      key: SETTINGS_KEYS.AUTO_LOCK_TIMEOUT,
      value: String(minutes),
      updated_at: Date.now(),
    });
    autoLockMinutes = minutes;
    // Restart a running timer so the new timeout applies immediately.
    if (autoLockManager) startAutoLock(mainWindow);
    logger.info('Auto-lock timeout updated', { minutes });
    return { success: true };
  });

  /**
   * Check if master password is setup
   */
  safeHandle('crypto:is-setup', noPayloadSchema, async () => {
    try {
      logger.debug('IPC: crypto:is-setup');
      return await cryptoManager.isSetup();
    } catch (error) {
      logger.error('Failed to check setup status', error);
      throw error;
    }
  });

  /**
   * Initialize master password (first-time setup)
   * Returns the recovery key that must be shown to the user ONCE
   */
  safeHandle('crypto:initialize', passwordSchema, async (_event, password) => {
    try {
      logger.info('IPC: crypto:initialize');

      const { recoveryKey } = await cryptoManager.initialize(password);

      logger.info('Master password initialized successfully');

      return { success: true, recoveryKey };
    } catch (error) {
      logger.error('Failed to initialize master password', error);
      throw error;
    }
  });

  /**
   * Reset password using recovery key
   */
  safeHandleArgs(
    'crypto:reset-with-recovery',
    resetWithRecoverySchema,
    async (_event, [recoveryKey, newPassword]) => {
      try {
        logger.info('IPC: crypto:reset-with-recovery');

        const result = await cryptoManager.resetWithRecoveryKey(recoveryKey, newPassword);

        if (result.success) {
          logger.info('Password reset successful');
        }

        return result;
      } catch (error) {
        logger.error('Failed to reset password', error);
        return { success: false, error: 'Password reset failed' };
      }
    }
  );

  /**
   * Unlock the app
   */
  safeHandle('crypto:unlock', passwordSchema, async (_event, password) => {
    try {
      logger.info('IPC: crypto:unlock');

      const success = await cryptoManager.unlock(password);

      if (success) {
        // Start auto-lock timer
        startAutoLock(mainWindow);

        logger.info('App unlocked successfully');
        return { success: true };
      } else {
        logger.warn('Unlock failed - invalid password');
        return { success: false, error: 'Invalid password' };
      }
    } catch (error) {
      logger.error('Failed to unlock app', error);
      throw error;
    }
  });

  /**
   * Lock the app
   */
  safeHandle('crypto:lock', noPayloadSchema, () => {
    try {
      logger.info('IPC: crypto:lock');

      // Stop auto-lock timer
      stopAutoLock();

      // Wipe master key from memory
      cryptoManager.lock();

      logger.info('App locked successfully');

      return { success: true };
    } catch (error) {
      logger.error('Failed to lock app', error);
      throw error;
    }
  });

  /**
   * Complete setup/recovery after the user has confirmed that the recovery key is saved.
   */
  safeHandle('crypto:complete-setup', noPayloadSchema, () => {
    try {
      logger.info('IPC: crypto:complete-setup');

      if (!cryptoManager.isUnlocked()) {
        logger.warn('Cannot complete setup because app is locked');
        return { success: false, error: 'App is locked' };
      }

      startAutoLock(mainWindow);
      logger.info('Setup completion confirmed; auto-lock timer started');

      return { success: true };
    } catch (error) {
      logger.error('Failed to complete setup', error);
      throw error;
    }
  });

  /**
   * Check if app is unlocked
   */
  safeHandle('crypto:is-unlocked', noPayloadSchema, () => {
    try {
      return cryptoManager.isUnlocked();
    } catch (error) {
      logger.error('Failed to check unlock status', error);
      throw error;
    }
  });

  /**
   * Encrypt data with master key
   */
  safeHandle('crypto:encrypt-data', secretStringSchema, async (_event, plaintext) => {
    try {
      logger.debug('IPC: crypto:encrypt-data');
      return cryptoManager.encryptData(plaintext);
    } catch (error) {
      logger.error('Failed to encrypt data', error);
      throw error;
    }
  });

  /**
   * Decrypt data with master key
   */
  safeHandle('crypto:decrypt-data', secretStringSchema, async (_event, encrypted) => {
    try {
      logger.debug('IPC: crypto:decrypt-data');
      return cryptoManager.decryptData(encrypted);
    } catch (error) {
      logger.error('Failed to decrypt data', error);
      throw error;
    }
  });

  logger.info('Crypto IPC handlers setup complete');
}

/**
 * Start auto-lock timer
 */
function startAutoLock(mainWindow: BrowserWindow) {
  // Stop existing timer if any
  stopAutoLock();

  // Create new auto-lock manager
  autoLockManager = new AutoLockManager(
    mainWindow,
    () => {
      // On lock callback
      cryptoManager.lock();
    },
    autoLockMinutes
  );

  logger.info('Auto-lock timer started');
}

/**
 * Stop auto-lock timer
 */
function stopAutoLock() {
  if (autoLockManager) {
    autoLockManager.destroy();
    autoLockManager = null;
    logger.info('Auto-lock timer stopped');
  }
}
