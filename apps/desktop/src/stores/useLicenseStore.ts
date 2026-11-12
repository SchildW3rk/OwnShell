/**
 * License Store (Zustand)
 *
 * Honor model: the license never gates features. This store only feeds the header
 * reminder badge and the settings license tab.
 */

import { create } from 'zustand';
import { i18n } from '../i18n';
import type { LicenseErrorCode, LicenseInfo } from '../../electron/license/types';

const LICENSE_ERROR_KEYS: Record<LicenseErrorCode, string> = {
  emptyKey: 'license.enterKey',
  activationLimit: 'license.errors.activationLimit',
  rejected: 'license.errors.rejected',
  unavailable: 'license.errors.unavailable',
  instanceMissing: 'license.errors.instanceMissing',
};

function licenseErrorMessage(code: LicenseErrorCode | undefined): string {
  return i18n.t((code && LICENSE_ERROR_KEYS[code]) || 'license.errors.generic');
}

interface LicenseState {
  licenseInfo: LicenseInfo | null;
  isLoading: boolean;
  error: string | null;
  isOnline: boolean; // Deactivation needs the license API

  checkLicense: () => Promise<void>;
  activate: (key: string) => Promise<boolean>;
  setPersonalUse: (confirmed: boolean) => Promise<void>;
  deactivate: () => Promise<{ success: boolean; requiresOnline?: boolean }>;
  clearError: () => void;
}

export const useLicenseStore = create<LicenseState>((set, get) => ({
  licenseInfo: null,
  isLoading: false,
  error: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

  checkLicense: async () => {
    try {
      set({ licenseInfo: await window.electronAPI.license.getStatus() });
    } catch (error) {
      console.error('Failed to check license:', error);
    }
  },

  activate: async (key: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.license.activate(key);
      if (result.success) {
        set({ licenseInfo: result.info ?? get().licenseInfo, isLoading: false });
        if (!result.info) await get().checkLicense();
        return true;
      }
      set({ error: licenseErrorMessage(result.error), isLoading: false });
    } catch (error) {
      console.error('Failed to activate license:', error);
      set({ error: licenseErrorMessage(undefined), isLoading: false });
    }
    return false;
  },

  setPersonalUse: async (confirmed: boolean) => {
    try {
      set({ licenseInfo: await window.electronAPI.license.setPersonalUse(confirmed) });
    } catch (error) {
      console.error('Failed to store personal-use confirmation:', error);
    }
  },

  deactivate: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.license.deactivate();
      if (result.success) {
        await get().checkLicense();
        set({ isLoading: false });
        return { success: true };
      }
      set({ error: licenseErrorMessage(result.error), isLoading: false });
      return { success: false, requiresOnline: result.requiresOnline };
    } catch (error) {
      console.error('Failed to deactivate license:', error);
      set({ error: licenseErrorMessage(undefined), isLoading: false });
      return { success: false };
    }
  },

  clearError: () => set({ error: null }),
}));

// Setup online/offline event listeners for deactivation control
if (typeof window !== 'undefined') {
  // A background refresh (e.g. after renewal) changed the license: reload badge and settings.
  window.electronAPI?.license?.onStatusChanged?.(() => {
    void useLicenseStore.getState().checkLicense();
  });

  window.addEventListener('online', () => {
    useLicenseStore.setState({ isOnline: true });
  });

  window.addEventListener('offline', () => {
    useLicenseStore.setState({ isOnline: false });
  });
}
