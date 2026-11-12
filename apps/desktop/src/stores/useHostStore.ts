/**
 * Host Store (Zustand)
 * 
 * Manages SSH host configurations
 */

import { create } from 'zustand';
import { HostsTable } from '@ownshell/core';
import { assertIpcSuccess } from '../lib/ipcResult';

function assertHostsResult(result: unknown): HostsTable[] {
  if (Array.isArray(result)) {
    return result as HostsTable[];
  }

  const error =
    result && typeof result === 'object' && 'error' in result
      ? String((result as { error?: unknown }).error)
      : 'Failed to load hosts';

  throw new Error(error);
}

interface HostState {
  hosts: HostsTable[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadHosts: () => Promise<void>;
  createHost: (hostData: any) => Promise<void>;
  updateHost: (id: string, updateData: any) => Promise<void>;
  deleteHost: (id: string) => Promise<void>;
}

export const useHostStore = create<HostState>((set) => ({
  hosts: [],
  isLoading: false,
  error: null,
  
  loadHosts: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const hosts = assertHostsResult(await window.electronAPI.hosts.getAll());
      set({ hosts, isLoading: false });
    } catch (error) {
      console.error('Failed to load hosts:', error);
      set({ 
        error: 'Failed to load hosts', 
        isLoading: false 
      });
    }
  },
  
  createHost: async (hostData: any) => {
    set({ isLoading: true, error: null });
    
    try {
      assertIpcSuccess(await window.electronAPI.hosts.create(hostData), 'Failed to create host');
      
      // Reload hosts
      const hosts = assertHostsResult(await window.electronAPI.hosts.getAll());
      set({ hosts, isLoading: false });
    } catch (error) {
      console.error('Failed to create host:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create host',
        isLoading: false 
      });
      throw error;
    }
  },
  
  updateHost: async (id: string, updateData: any) => {
    set({ isLoading: true, error: null });
    
    try {
      assertIpcSuccess(await window.electronAPI.hosts.update(id, updateData), 'Failed to update host');
      
      // Reload hosts
      const hosts = assertHostsResult(await window.electronAPI.hosts.getAll());
      set({ hosts, isLoading: false });
    } catch (error) {
      console.error('Failed to update host:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update host',
        isLoading: false 
      });
      throw error;
    }
  },
  
  deleteHost: async (id: string) => {
    set({ isLoading: true, error: null });
    
    try {
      assertIpcSuccess(await window.electronAPI.hosts.delete(id), 'Failed to delete host');
      
      // Reload hosts
      const hosts = assertHostsResult(await window.electronAPI.hosts.getAll());
      set({ hosts, isLoading: false });
    } catch (error) {
      console.error('Failed to delete host:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete host',
        isLoading: false 
      });
      throw error;
    }
  },
}));
