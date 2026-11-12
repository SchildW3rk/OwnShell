/**
 * Tunnel Store (Zustand)
 *
 * Manages port forwarding tunnel state and operations
 * - Active tunnels (runtime)
 * - Saved tunnel configs (from database)
 * - Start/stop tunnels
 * - Auto-start tunnels on SSH connect
 */

import { create } from 'zustand';
import { TunnelState, TunnelConfig, SavedTunnel } from '@ownshell/core';
import toast from 'react-hot-toast';
import { assertIpcSuccess } from '../lib/ipcResult';
import { i18n } from '../i18n';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Saved tunnel from database (snake_case from DB)
 */
interface DBTunnel {
  id: string;
  host_id: string;
  local_port: number;
  remote_host: string;
  remote_port: number;
  name: string;
  auto_start: number;
  created_at: number;
  updated_at: number;
}

interface TunnelStoreState {
  // Active tunnels per session (runtime)
  activeTunnels: Map<string, TunnelState[]>;

  // Saved tunnel configs per host (from database)
  savedTunnels: Map<string, SavedTunnel[]>;

  // Loading states
  isLoading: Map<string, boolean>;

  // Actions
  startTunnel: (sessionId: string, config: TunnelConfig) => Promise<string | null>;
  stopTunnel: (tunnelId: string) => Promise<void>;
  refreshTunnels: (sessionId: string) => Promise<void>;

  // Saved tunnel config actions
  loadSavedTunnels: (hostId: string) => Promise<void>;
  saveTunnelConfig: (
    hostId: string,
    config: {
      localPort: number;
      remoteHost: string;
      remotePort: number;
      name: string;
      autoStart: boolean;
    }
  ) => Promise<void>;
  deleteSavedTunnel: (tunnelId: string, hostId: string) => Promise<void>;
  updateSavedTunnel: (
    tunnelId: string,
    hostId: string,
    update: Partial<{
      localPort: number;
      remoteHost: string;
      remotePort: number;
      name: string;
      autoStart: boolean;
    }>
  ) => Promise<void>;

  // Auto-start
  autoStartTunnels: (sessionId: string, hostId: string) => Promise<void>;

  // Getters
  getActiveTunnels: (sessionId: string) => TunnelState[];
  getSavedTunnels: (hostId: string) => SavedTunnel[];

  // Handle status updates from backend
  updateTunnelStatus: (state: TunnelState) => void;
}

export const useTunnelStore = create<TunnelStoreState>((set, get) => ({
  activeTunnels: new Map(),
  savedTunnels: new Map(),
  isLoading: new Map(),

  startTunnel: async (sessionId: string, config: TunnelConfig) => {
    try {
      if (isDev) console.log('[Tunnel] Starting tunnel', { sessionId, config });

      const result = await window.electronAPI.tunnel.start(sessionId, config);

      if (result.success && result.tunnelId) {
        if (isDev) console.log('[Tunnel] Tunnel started', { tunnelId: result.tunnelId });
        toast.success(
          i18n.t('tunnels.started', {
            localPort: config.localPort,
            remoteHost: config.remoteHost,
            remotePort: config.remotePort,
          })
        );

        // Refresh tunnel list
        await get().refreshTunnels(sessionId);

        return result.tunnelId;
      } else {
        const errorMsg = result.error?.message || 'Failed to start tunnel';
        console.error('[Tunnel] Failed to start', { error: result.error });
        toast.error(`${i18n.t('tunnels.error')}: ${errorMsg}`);
        return null;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Tunnel] Exception starting tunnel', { error });
      toast.error(`${i18n.t('tunnels.error')}: ${errorMsg}`);
      return null;
    }
  },

  stopTunnel: async (tunnelId: string) => {
    try {
      if (isDev) console.log('[Tunnel] Stopping tunnel', { tunnelId });

      const result = await window.electronAPI.tunnel.stop(tunnelId);

      if (result.success) {
        if (isDev) console.log('[Tunnel] Tunnel stopped', { tunnelId });
        toast.success(i18n.t('tunnels.stopped'));

        // Remove from active tunnels
        const { activeTunnels } = get();
        const newActiveTunnels = new Map(activeTunnels);

        for (const [sessionId, tunnels] of newActiveTunnels) {
          const filtered = tunnels.filter((t) => t.id !== tunnelId);
          if (filtered.length !== tunnels.length) {
            newActiveTunnels.set(sessionId, filtered);
          }
        }

        set({ activeTunnels: newActiveTunnels });
      } else {
        toast.error(`${i18n.t('tunnels.stopFailed')}: ${result.error?.message ?? ''}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`${i18n.t('tunnels.stopFailed')}: ${errorMsg}`);
    }
  },

  refreshTunnels: async (sessionId: string) => {
    try {
      const result = await window.electronAPI.tunnel.list(sessionId);

      if (result.success && result.tunnels) {
        const { activeTunnels } = get();
        const newActiveTunnels = new Map(activeTunnels);
        newActiveTunnels.set(sessionId, result.tunnels);
        set({ activeTunnels: newActiveTunnels });
      }
    } catch (error) {
      console.error('[Tunnel] Failed to refresh tunnels', { error });
    }
  },

  loadSavedTunnels: async (hostId: string) => {
    try {
      const { isLoading } = get();
      const newLoading = new Map(isLoading);
      newLoading.set(hostId, true);
      set({ isLoading: newLoading });

      const dbTunnels: DBTunnel[] = await window.electronAPI.tunnel.getSaved(hostId);

      // Convert from DB format to SavedTunnel format
      const tunnels: SavedTunnel[] = dbTunnels.map((t) => ({
        id: t.id,
        hostId: t.host_id,
        localPort: t.local_port,
        remoteHost: t.remote_host,
        remotePort: t.remote_port,
        name: t.name,
        autoStart: t.auto_start === 1,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }));

      const { savedTunnels } = get();
      const newSavedTunnels = new Map(savedTunnels);
      newSavedTunnels.set(hostId, tunnels);

      newLoading.set(hostId, false);
      set({ savedTunnels: newSavedTunnels, isLoading: newLoading });
    } catch (error) {
      console.error('[Tunnel] Failed to load saved tunnels', { error });

      const { isLoading } = get();
      const newLoading = new Map(isLoading);
      newLoading.set(hostId, false);
      set({ isLoading: newLoading });
    }
  },

  saveTunnelConfig: async (hostId, config) => {
    try {
      if (isDev) console.log('[Tunnel] Saving tunnel config', { hostId, config });

      assertIpcSuccess(await window.electronAPI.tunnel.save({
        host_id: hostId,
        local_port: config.localPort,
        remote_host: config.remoteHost,
        remote_port: config.remotePort,
        name: config.name,
        auto_start: config.autoStart,
      }));

      toast.success(i18n.t('tunnels.configSaved'));

      // Reload saved tunnels
      await get().loadSavedTunnels(hostId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`${i18n.t('tunnels.saveFailed')}: ${errorMsg}`);
    }
  },

  deleteSavedTunnel: async (tunnelId: string, hostId: string) => {
    try {
      if (isDev) console.log('[Tunnel] Deleting saved tunnel', { tunnelId });

      assertIpcSuccess(await window.electronAPI.tunnel.deleteSaved(tunnelId));

      toast.success(i18n.t('tunnels.configDeleted'));

      // Reload saved tunnels
      await get().loadSavedTunnels(hostId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`${i18n.t('tunnels.deleteFailed')}: ${errorMsg}`);
    }
  },

  updateSavedTunnel: async (tunnelId: string, hostId: string, update) => {
    try {
      if (isDev) console.log('[Tunnel] Updating saved tunnel', { tunnelId, update });

      // Convert to snake_case for API
      const apiUpdate: Record<string, any> = {};
      if (update.localPort !== undefined) apiUpdate.local_port = update.localPort;
      if (update.remoteHost !== undefined) apiUpdate.remote_host = update.remoteHost;
      if (update.remotePort !== undefined) apiUpdate.remote_port = update.remotePort;
      if (update.name !== undefined) apiUpdate.name = update.name;
      if (update.autoStart !== undefined) apiUpdate.auto_start = update.autoStart;

      assertIpcSuccess(await window.electronAPI.tunnel.update(tunnelId, apiUpdate));

      toast.success(i18n.t('tunnels.configUpdated'));

      // Reload saved tunnels
      await get().loadSavedTunnels(hostId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`${i18n.t('tunnels.updateFailed')}: ${errorMsg}`);
    }
  },

  autoStartTunnels: async (sessionId: string, hostId: string) => {
    try {
      if (isDev) console.log('[Tunnel] Auto-starting tunnels', { sessionId, hostId });

      const dbTunnels: DBTunnel[] = await window.electronAPI.tunnel.getAutoStart(hostId);

      if (dbTunnels.length === 0) {
        if (isDev) console.log('[Tunnel] No auto-start tunnels configured');
        return;
      }

      if (isDev) console.log('[Tunnel] Found auto-start tunnels', { count: dbTunnels.length });

      for (const tunnel of dbTunnels) {
        try {
          await get().startTunnel(sessionId, {
            localPort: tunnel.local_port,
            remoteHost: tunnel.remote_host,
            remotePort: tunnel.remote_port,
            description: tunnel.name,
          });
        } catch (error) {
          console.warn('[Tunnel] Failed to auto-start tunnel', {
            tunnel: tunnel.name,
            error,
          });
          // Continue with other tunnels
        }
      }
    } catch (error) {
      console.error('[Tunnel] Failed to auto-start tunnels', { error });
    }
  },

  getActiveTunnels: (sessionId: string) => {
    const { activeTunnels } = get();
    return activeTunnels.get(sessionId) || [];
  },

  getSavedTunnels: (hostId: string) => {
    const { savedTunnels } = get();
    return savedTunnels.get(hostId) || [];
  },

  updateTunnelStatus: (state: TunnelState) => {
    const { activeTunnels } = get();
    const newActiveTunnels = new Map(activeTunnels);

    const sessionTunnels = newActiveTunnels.get(state.sessionId) || [];
    const index = sessionTunnels.findIndex((t) => t.id === state.id);

    if (state.status === 'stopped') {
      // Remove stopped tunnel
      if (index !== -1) {
        sessionTunnels.splice(index, 1);
      }
    } else {
      // Update or add tunnel
      if (index !== -1) {
        sessionTunnels[index] = state;
      } else {
        sessionTunnels.push(state);
      }
    }

    newActiveTunnels.set(state.sessionId, sessionTunnels);
    set({ activeTunnels: newActiveTunnels });
  },
}));

// Setup listener for tunnel status updates
if (typeof window !== 'undefined' && window.electronAPI?.tunnel?.onStatusChange) {
  window.electronAPI.tunnel.onStatusChange((state) => {
    useTunnelStore.getState().updateTunnelStatus(state);
  });
}
