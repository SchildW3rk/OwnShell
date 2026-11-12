/**
 * Auth Store (Zustand)
 *
 * Manages authentication state (setup, locked, unlocked)
 */

import { create } from 'zustand';

const isDev = process.env.NODE_ENV === 'development';

interface AuthState {
  isSetup: boolean;
  isLocked: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  checkSetup: () => Promise<void>;
  initialize: (password: string) => Promise<{ recoveryKey: string }>;
  completeSetup: () => Promise<void>; // Called after user saves recovery key
  completeRecovery: () => Promise<void>; // Called after user saves a new recovery key
  unlock: (password: string) => Promise<boolean>;
  lock: () => Promise<void>;
  resetWithRecovery: (
    recoveryKey: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string; newRecoveryKey?: string }>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isSetup: false,
  isLocked: true,
  isLoading: false,
  error: null,

  checkSetup: async () => {
    try {
      const isSetup = await window.electronAPI.crypto.isSetup();
      set({ isSetup, isLocked: isSetup });
    } catch (error) {
      console.error('Failed to check setup status:', error);
      set({ error: 'Failed to check setup status' });
    }
  },

  initialize: async (password: string) => {
    set({ isLoading: true, error: null });

    try {
      const result = await window.electronAPI.crypto.initialize(password);
      // Don't unlock yet - wait for user to save recovery key
      // Keep isSetup: false so SetupScreen stays visible
      set({ isLoading: false });
      return { recoveryKey: result.recoveryKey };
    } catch (error) {
      console.error('Failed to initialize:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize',
        isLoading: false,
      });
      throw error;
    }
  },

  completeSetup: async () => {
    // Called after user confirms they saved recovery key
    set({ isLoading: true, error: null });

    try {
      const result = await window.electronAPI.crypto.completeSetup();
      if (!result.success) {
        throw new Error(result.error || 'Failed to complete setup');
      }

      set({ isSetup: true, isLocked: false, isLoading: false });
    } catch (error) {
      console.error('Failed to complete setup:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to complete setup',
        isLoading: false,
      });
      throw error;
    }
  },

  completeRecovery: async () => {
    set({ isLoading: true, error: null });

    try {
      const result = await window.electronAPI.crypto.completeSetup();
      if (!result.success) {
        throw new Error(result.error || 'Failed to complete recovery');
      }

      set({ isLocked: false, isLoading: false });
    } catch (error) {
      console.error('Failed to complete recovery:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to complete recovery',
        isLoading: false,
      });
      throw error;
    }
  },

  unlock: async (password: string) => {
    set({ isLoading: true, error: null });

    try {
      const result = await window.electronAPI.crypto.unlock(password);

      if (result.success) {
        set({ isLocked: false, isLoading: false });
        return true;
      } else {
        set({
          error: result.error || 'Invalid password',
          isLoading: false,
        });
        return false;
      }
    } catch (error) {
      console.error('Failed to unlock:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to unlock',
        isLoading: false,
      });
      return false;
    }
  },

  lock: async () => {
    try {
      await window.electronAPI.crypto.lock();
      set({ isLocked: true });
    } catch (error) {
      console.error('Failed to lock:', error);
      set({ error: 'Failed to lock app' });
    }
  },

  resetWithRecovery: async (recoveryKey: string, newPassword: string) => {
    set({ isLoading: true, error: null });

    try {
      const result = await window.electronAPI.crypto.resetWithRecovery(recoveryKey, newPassword);

      if (result.success) {
        // Keep the lock screen mounted until the user confirms the newly generated recovery key.
        set({ isLoading: false });
      } else {
        set({
          error: result.error || 'Recovery failed',
          isLoading: false,
        });
      }

      return result;
    } catch (error) {
      console.error('Failed to reset with recovery:', error);
      const errorMsg = error instanceof Error ? error.message : 'Recovery failed';
      set({ error: errorMsg, isLoading: false });
      return { success: false, error: errorMsg };
    }
  },

  clearError: () => set({ error: null }),
}));

// Setup auto-lock listener
window.electronAPI.crypto.onAutoLocked((reason) => {
  if (isDev) console.log('Auto-locked:', reason);
  const { isSetup } = useAuthStore.getState();
  if (!isSetup) return;
  useAuthStore.setState({ isLocked: true });
});
