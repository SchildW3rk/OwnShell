/**
 * Sidebar Context (v1.15.0)
 *
 * Provides sidebar state management across the app
 * with localStorage persistence
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { SidebarMode, SidebarContextValue, SIDEBAR_STORAGE_KEY } from './types';

const SidebarContext = createContext<SidebarContextValue | null>(null);

/**
 * Hook to access sidebar context
 */
export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}

/**
 * Load sidebar mode from localStorage
 */
function loadSidebarMode(): SidebarMode {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored && ['expanded', 'slim', 'collapsed'].includes(stored)) {
      return stored as SidebarMode;
    }
  } catch {
    // localStorage not available
  }
  return 'expanded';
}

/**
 * Save sidebar mode to localStorage
 */
function saveSidebarMode(mode: SidebarMode): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, mode);
  } catch {
    // localStorage not available
  }
}

interface SidebarProviderProps {
  children: React.ReactNode;
}

/**
 * Sidebar state provider
 */
export function SidebarProvider({ children }: SidebarProviderProps) {
  const [mode, setModeInternal] = useState<SidebarMode>(() => loadSidebarMode());

  // Persist mode changes
  const setMode = useCallback((newMode: SidebarMode) => {
    setModeInternal(newMode);
    saveSidebarMode(newMode);
  }, []);

  // Toggle between expanded and slim
  const toggleSlim = useCallback(() => {
    setMode(mode === 'expanded' ? 'slim' : 'expanded');
  }, [mode, setMode]);

  // Toggle between current and collapsed
  const toggleCollapsed = useCallback(() => {
    if (mode === 'collapsed') {
      // Restore to expanded when un-collapsing
      setMode('expanded');
    } else {
      setMode('collapsed');
    }
  }, [mode, setMode]);

  // Keyboard shortcut: Cmd/Ctrl + B to toggle slim
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSlim();
      }
      // Cmd/Ctrl + Shift + B to toggle collapsed
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        toggleCollapsed();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSlim, toggleCollapsed]);

  const value = useMemo<SidebarContextValue>(
    () => ({
      mode,
      setMode,
      toggleSlim,
      toggleCollapsed,
      isSlim: mode === 'slim',
      isCollapsed: mode === 'collapsed',
      isExpanded: mode === 'expanded',
    }),
    [mode, setMode, toggleSlim, toggleCollapsed]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
