/**
 * Theme Store (Zustand)
 *
 * Manages theme state with system preference support
 * - 'system': Follow OS preference (default)
 * - 'dark': Force dark mode
 * - 'light': Force light mode
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  cycleTheme: () => void;
  getResolvedTheme: () => ResolvedTheme;
}

/**
 * Get the system's preferred color scheme
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Apply the resolved theme to the document
 */
function applyTheme(mode: ThemeMode): void {
  const resolved = mode === 'system' ? getSystemTheme() : mode;
  document.documentElement.setAttribute('data-theme', resolved);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system', // Default: follow system preference

      setMode: (mode: ThemeMode) => {
        set({ mode });
        applyTheme(mode);
      },

      cycleTheme: () => {
        const currentMode = get().mode;
        // Cycle: system -> light -> dark -> system
        const nextMode: ThemeMode =
          currentMode === 'system' ? 'light' : currentMode === 'light' ? 'dark' : 'system';
        get().setMode(nextMode);
      },

      getResolvedTheme: (): ResolvedTheme => {
        const mode = get().mode;
        return mode === 'system' ? getSystemTheme() : mode;
      },
    }),
    {
      name: 'ownshell-theme',
      onRehydrateStorage: () => (state) => {
        // Apply theme on app load (after hydration from localStorage)
        if (state?.mode) {
          applyTheme(state.mode);
        }
      },
    }
  )
);

/**
 * Hook to initialize theme and listen for system preference changes
 * Call this in your App component
 */
export const useInitializeTheme = () => {
  const mode = useThemeStore((state) => state.mode);

  // Apply theme on mount
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  // Listen for system theme changes (only relevant when mode === 'system')
  useEffect(() => {
    if (mode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mode]);
};
