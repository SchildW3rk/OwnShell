/**
 * License Store (Zustand)
 *
 * Manages license state (active, trial, expired, none)
 * Includes online status tracking for deactivation
 */

import { create } from 'zustand';
import type { LicenseInfo } from '../../electron/license/types';

interface LicenseMutationResult {
  success: boolean;
  error?: string;
  info?: LicenseInfo;
}

interface LicenseState {
  // State
  licenseInfo: LicenseInfo | null;
  isLoading: boolean;
  hasCheckedLicense: boolean;
  error: string | null;
  showActivationModal: boolean;
  isOnline: boolean; // Tracks internet connectivity for deactivation

  // Actions
  checkLicense: () => Promise<void>;
  activate: (key: string) => Promise<boolean>;
  startTrial: () => Promise<boolean>;
  deactivate: () => Promise<{ success: boolean; requiresOnline?: boolean }>;
  setShowActivationModal: (show: boolean) => void;
  setOnlineStatus: (online: boolean) => void;
  clearError: () => void;
  quitApp: () => void;
}

export const useLicenseStore = create<LicenseState>((set, get) => ({
  licenseInfo: null,
  isLoading: false,
  hasCheckedLicense: false,
  error: null,
  showActivationModal: false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

  checkLicense: async () => {
    set({ isLoading: true, error: null });

    try {
      const info = await window.electronAPI.license.getStatus();
      const needsActivation = info.status === 'none' || info.status === 'expired';

      set({
        licenseInfo: info,
        isLoading: false,
        hasCheckedLicense: true,
        showActivationModal: needsActivation,
      });
    } catch (error) {
      console.error('Failed to check license:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to check license',
        isLoading: false,
        hasCheckedLicense: true,
        showActivationModal: true, // Show modal on error
      });
    }
  },

  startTrial: async () => {
    if (get().isLoading) return false;
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.license.startTrial();
      if (result.success && result.info) {
        set({ licenseInfo: result.info, isLoading: false, hasCheckedLicense: true, showActivationModal: false });
        return true;
      }
      set({ isLoading: false, error: result.errorCode || 'license.trialStartFailed' });
    } catch {
      set({ isLoading: false, error: 'license.trialStartFailed' });
    }
    return false;
  },

  activate: async (key: string) => {
    set({ isLoading: true, error: null });

    try {
      const result = await window.electronAPI.license.activate(key);

      if (result.success) {
        if (isLicenseMutationResult(result) && result.info) {
          set({
            licenseInfo: result.info,
            isLoading: false,
            hasCheckedLicense: true,
            showActivationModal: false,
          });
        } else {
          await get().checkLicense();
          set({ showActivationModal: false });
        }
        return true;
      } else {
        set({
          error: result.error || 'Activation failed',
          isLoading: false,
        });
        return false;
      }
    } catch (error) {
      console.error('Failed to activate license:', error);
      set({
        error: error instanceof Error ? error.message : 'Activation failed',
        isLoading: false,
      });
      return false;
    }
  },

  deactivate: async () => {
    set({ isLoading: true, error: null });

    try {
      const result = await window.electronAPI.license.deactivate();

      if (result.success) {
        // Refresh license info
        await get().checkLicense();
        return { success: true };
      } else {
        set({
          error: result.error || 'Failed to deactivate',
          isLoading: false,
        });
        return { success: false, requiresOnline: result.requiresOnline };
      }
    } catch (error) {
      console.error('Failed to deactivate license:', error);
      set({
        error: error instanceof Error ? error.message : 'Deactivation failed',
        isLoading: false,
      });
      return { success: false };
    }
  },

  setShowActivationModal: (show: boolean) => {
    set({ showActivationModal: show });
  },

  setOnlineStatus: (online: boolean) => {
    set({ isOnline: online });
  },

  clearError: () => set({ error: null }),

  quitApp: () => {
    window.electronAPI.app.quit();
  },
}));

function isLicenseMutationResult(value: unknown): value is LicenseMutationResult {
  return Boolean(value && typeof value === 'object' && 'success' in value);
}

// Setup online/offline event listeners for deactivation control
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useLicenseStore.setState({ isOnline: true });
  });

  window.addEventListener('offline', () => {
    useLicenseStore.setState({ isOnline: false });
  });
}
