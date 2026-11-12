/**
 * Terminal Session Store (Zustand)
 *
 * Manages multiple terminal sessions/tabs
 * - Tab creation, selection, closing
 * - Connection state tracking
 * - Session cleanup
 */

import { create } from 'zustand';
import { HostsTable } from '@ownshell/core';
import { clearTerminalHistory } from '../components/terminal-view/runtime';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
export type TerminalSessionKind = 'ssh' | 'local';
export type TerminalSessionFeatureTab = 'terminal' | 'sftp' | 'tunnels' | 'docker' | 'database';

export interface TerminalSession {
  id: string; // Unique session ID
  kind: TerminalSessionKind;
  host: HostsTable | null;
  sessionId: string | null; // Backend SSH or local PTY session ID
  nativePtySessionId?: string | null; // Native OpenSSH PTY session ID
  state: ConnectionState;
  activeFeatureTab: TerminalSessionFeatureTab;
  visitedFeatureTabs: TerminalSessionFeatureTab[];
  startupCommand?: string;
  startupEnv?: Record<string, string>;
  startupCommandSent?: boolean;
  errorMessage?: string;
}

export interface CreateTerminalSessionOptions {
  sessionId?: string;
  startupCommand?: string;
  startupEnv?: Record<string, string>;
}

/**
 * Background Session (v1.20.0)
 * Tracks SSH sessions that are detached but still alive in background
 */
export interface BackgroundSession {
  hostId: string;
  sshSessionId: string;
  detachedAt: number;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  backgroundSessions: Map<string, BackgroundSession>; // hostId -> BackgroundSession

  // Actions
  createSession: (host: HostsTable, options?: CreateTerminalSessionOptions) => string;
  createLocalSession: (options?: CreateTerminalSessionOptions) => string;
  createSessionFromExisting: (host: HostsTable, existingSessionId: string) => string;
  setSessionState: (id: string, state: ConnectionState, errorMessage?: string) => void;
  setSessionId: (id: string, sessionId: string) => void;
  clearSessionId: (id: string) => void;
  setNativePtySessionId: (id: string, ptySessionId: string) => void;
  clearNativePtySessionId: (id: string) => void;
  setActiveSession: (id: string) => void;
  setSessionFeatureTab: (id: string, tab: TerminalSessionFeatureTab) => void;
  markStartupCommandSent: (id: string) => void;
  closeSession: (id: string) => Promise<void>;
  getActiveSession: () => TerminalSession | null;

  // Background Session Actions (v1.20.0)
  addBackgroundSession: (hostId: string, sshSessionId: string) => void;
  removeBackgroundSession: (sshSessionId: string) => void;
  getBackgroundSessionForHost: (hostId: string) => BackgroundSession | null;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  backgroundSessions: new Map(),

  /**
   * Create a new terminal session
   */
  createSession: (host: HostsTable, options) => {
    const id = `term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newSession: TerminalSession = {
      id,
      kind: 'ssh',
      host,
      sessionId: options?.sessionId ?? null,
      nativePtySessionId: null,
      state: 'connecting',
      activeFeatureTab: 'terminal',
      visitedFeatureTabs: ['terminal'],
      startupCommand: options?.startupCommand,
      startupEnv: options?.startupEnv,
      startupCommandSent: false,
    };

    set((state) => ({
      sessions: [...state.sessions, newSession],
      activeSessionId: id,
    }));

    return id;
  },

  /**
   * Create a new local macOS terminal session.
   */
  createLocalSession: (options) => {
    const id = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newSession: TerminalSession = {
      id,
      kind: 'local',
      host: null,
      sessionId: options?.sessionId ?? null,
      nativePtySessionId: null,
      state: 'connecting',
      activeFeatureTab: 'terminal',
      visitedFeatureTabs: ['terminal'],
      startupCommand: options?.startupCommand,
      startupEnv: options?.startupEnv,
      startupCommandSent: false,
    };

    set((state) => ({
      sessions: [...state.sessions, newSession],
      activeSessionId: id,
    }));

    return id;
  },

  /**
   * Create terminal session from existing SSH session (v1.20.0)
   * Used when re-opening a tab for a host that has a background session
   */
  createSessionFromExisting: (host: HostsTable, existingSessionId: string) => {
    const id = `term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newSession: TerminalSession = {
      id,
      kind: 'ssh',
      host,
      sessionId: existingSessionId, // ✅ Use existing session ID
      nativePtySessionId: null,
      state: 'connected', // ✅ Already connected!
      activeFeatureTab: 'terminal',
      visitedFeatureTabs: ['terminal'],
    };

    set((state) => ({
      sessions: [...state.sessions, newSession],
      activeSessionId: id,
    }));

    return id;
  },

  /**
   * Update session connection state
   */
  setSessionState: (id: string, state: ConnectionState, errorMessage?: string) => {
    set((prevState) => ({
      sessions: prevState.sessions.map((session) =>
        session.id === id ? { ...session, state, errorMessage } : session
      ),
    }));
  },

  /**
   * Set SSH session ID from backend
   */
  setSessionId: (id: string, sessionId: string) => {
    set((prevState) => ({
      sessions: prevState.sessions.map((session) =>
        session.id === id ? { ...session, sessionId } : session
      ),
    }));
  },

  /**
   * Clear stale backend session ID
   */
  clearSessionId: (id: string) => {
    set((prevState) => ({
      sessions: prevState.sessions.map((session) =>
        session.id === id ? { ...session, sessionId: null } : session
      ),
    }));
  },

  /**
   * Set native OpenSSH PTY session ID.
   */
  setNativePtySessionId: (id: string, ptySessionId: string) => {
    set((prevState) => ({
      sessions: prevState.sessions.map((session) =>
        session.id === id ? { ...session, nativePtySessionId: ptySessionId } : session
      ),
    }));
  },

  /**
   * Clear native OpenSSH PTY session ID.
   */
  clearNativePtySessionId: (id: string) => {
    set((prevState) => ({
      sessions: prevState.sessions.map((session) =>
        session.id === id ? { ...session, nativePtySessionId: null } : session
      ),
    }));
  },

  /**
   * Set active session (switch tabs)
   */
  setActiveSession: (id: string) => {
    set({ activeSessionId: id });
  },

  /**
   * Keep feature tab selection tied to the terminal session so it survives
   * workspace layout remounts when panes are added or removed.
   */
  setSessionFeatureTab: (id: string, tab: TerminalSessionFeatureTab) => {
    set((prevState) => ({
      sessions: prevState.sessions.map((session) => {
        if (session.id !== id) return session;

        const activeFeatureTab = session.kind === 'local' && tab !== 'docker' ? 'terminal' : tab;
        const previousVisitedTabs = session.visitedFeatureTabs ?? ['terminal'];
        const visitedFeatureTabs = previousVisitedTabs.includes(activeFeatureTab)
          ? previousVisitedTabs
          : [...previousVisitedTabs, activeFeatureTab];

        return {
          ...session,
          activeFeatureTab,
          visitedFeatureTabs,
        };
      }),
    }));
  },

  markStartupCommandSent: (id: string) => {
    set((prevState) => ({
      sessions: prevState.sessions.map((session) =>
        session.id === id
          ? { ...session, startupCommandSent: true, startupEnv: undefined }
          : session
      ),
    }));
  },

  /**
   * Close session and cleanup
   */
  closeSession: async (id: string) => {
    const session = get().sessions.find((s) => s.id === id);

    if (!session) return;

    // Kill native OpenSSH PTY if connected
    if (session.nativePtySessionId) {
      try {
        await window.electronAPI.localPty.kill(session.nativePtySessionId);
      } catch (error) {
        console.error('Failed to kill native PTY session:', error);
      }
    }

    // Disconnect backend session if connected
    if (session.sessionId) {
      try {
        if (session.kind === 'local') {
          await window.electronAPI.localPty.kill(session.sessionId);
        } else {
          await window.electronAPI.ssh.disconnect(session.sessionId);
        }
      } catch (error) {
        console.error('Failed to disconnect session:', error);
      }
    }

    clearTerminalHistory(id);

    // Remove from sessions
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== id);

      // If closing active session, switch to another
      let newActiveId = state.activeSessionId;
      if (state.activeSessionId === id) {
        newActiveId = newSessions.length > 0 ? newSessions[0].id : null;
      }

      return {
        sessions: newSessions,
        activeSessionId: newActiveId,
      };
    });
  },

  /**
   * Get currently active session
   */
  getActiveSession: () => {
    const state = get();
    return state.sessions.find((s) => s.id === state.activeSessionId) || null;
  },

  /**
   * Add background session (v1.20.0)
   * Called when a session is detached but still alive
   */
  addBackgroundSession: (hostId: string, sshSessionId: string) => {
    set((state) => {
      const newMap = new Map(state.backgroundSessions);
      newMap.set(hostId, {
        hostId,
        sshSessionId,
        detachedAt: Date.now(),
      });
      return { backgroundSessions: newMap };
    });
  },

  /**
   * Remove background session (v1.20.0)
   * Called when session is disconnected or times out
   */
  removeBackgroundSession: (sshSessionId: string) => {
    set((state) => {
      const newMap = new Map(state.backgroundSessions);
      // Find and remove by sshSessionId
      for (const [hostId, session] of newMap.entries()) {
        if (session.sshSessionId === sshSessionId) {
          newMap.delete(hostId);
          break;
        }
      }
      return { backgroundSessions: newMap };
    });
  },

  /**
   * Get background session for a host (v1.20.0)
   */
  getBackgroundSessionForHost: (hostId: string) => {
    const state = get();
    return state.backgroundSessions.get(hostId) || null;
  },
}));
