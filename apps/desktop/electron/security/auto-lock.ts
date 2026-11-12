/**
 * Auto-Lock Manager
 *
 * Automatically locks the app after a period of inactivity
 * Also locks on system sleep/suspend
 *
 * ⚠️ SECURITY: Default 5 minutes, configurable in settings
 */

import { BrowserWindow, powerMonitor } from 'electron';
import { logger } from '../logger';

/**
 * Auto-Lock Configuration
 * This constant can be changed easily for settings integration later
 */
const AUTO_LOCK_TIMEOUT_MINUTES = 5;

export class AutoLockManager {
  private inactivityTimer: NodeJS.Timeout | null = null;
  private readonly timeoutMs: number;
  private lastResetTime: number = 0;
  private readonly THROTTLE_MS = 1000; // Max 1 reset per second (performance optimization)
  private readonly resetTimerHandler = () => this.resetTimer();
  private readonly suspendHandler = () => {
    logger.info('System suspending - triggering auto-lock');
    this.triggerLock('system_suspend');
  };
  private readonly resumeHandler = () => {
    logger.info('System resumed - resetting auto-lock timer');
    this.resetTimer();
  };
  private readonly lockScreenHandler = () => {
    logger.info('Screen locked - triggering auto-lock');
    this.triggerLock('screen_lock');
  };
  private readonly unlockScreenHandler = () => {
    logger.info('Screen unlocked - resetting auto-lock timer');
    this.resetTimer();
  };

  constructor(
    private window: BrowserWindow,
    private onLock: () => void,
    timeoutMinutes: number = AUTO_LOCK_TIMEOUT_MINUTES
  ) {
    this.timeoutMs = timeoutMinutes * 60 * 1000;
    logger.info('Auto-lock manager initialized', {
      timeout_minutes: timeoutMinutes,
    });

    this.setupListeners();
  }

  /**
   * Setup event listeners for user activity
   */
  private setupListeners() {
    // Window focus events
    this.window.on('focus', this.resetTimerHandler);
    this.window.on('blur', this.resetTimerHandler); // Reset even on blur to track total time

    // WebContents events (user input in renderer)
    this.window.webContents.on('before-input-event', this.resetTimerHandler);

    // System power events
    powerMonitor.on('suspend', this.suspendHandler);
    powerMonitor.on('resume', this.resumeHandler);
    powerMonitor.on('lock-screen', this.lockScreenHandler);
    powerMonitor.on('unlock-screen', this.unlockScreenHandler);

    // Start timer
    this.resetTimer();

    logger.debug('Auto-lock listeners setup complete');
  }

  /**
   * Reset the inactivity timer
   *
   * ⚡ Performance: Throttled to max 1 reset per second
   * This prevents excessive timer operations on every keystroke
   */
  private resetTimer() {
    const now = Date.now();

    // Throttle: Skip if less than THROTTLE_MS since last reset
    if (now - this.lastResetTime < this.THROTTLE_MS) {
      return;
    }
    this.lastResetTime = now;

    // Clear existing timer
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    // Start new timer
    this.inactivityTimer = setTimeout(() => {
      this.triggerLock('inactivity_timeout');
    }, this.timeoutMs);

    // Use trace level for high-frequency event (disabled by default)
    logger.trace('Auto-lock timer reset', {
      timeout_ms: this.timeoutMs,
    });
  }

  /**
   * Trigger the lock
   */
  private triggerLock(reason: string) {
    logger.info('Auto-lock triggered', { reason });

    // Clear timer
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    // Call lock callback
    this.onLock();

    // Notify renderer
    this.window.webContents.send('auth:auto-locked', { reason });
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    this.window.off('focus', this.resetTimerHandler);
    this.window.off('blur', this.resetTimerHandler);
    this.window.webContents.off('before-input-event', this.resetTimerHandler);
    powerMonitor.off('suspend', this.suspendHandler);
    powerMonitor.off('resume', this.resumeHandler);
    powerMonitor.off('lock-screen', this.lockScreenHandler);
    powerMonitor.off('unlock-screen', this.unlockScreenHandler);

    logger.info('Auto-lock manager destroyed');
  }
}
