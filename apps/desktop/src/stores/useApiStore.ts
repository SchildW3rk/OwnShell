/**
 * API Client Store (Zustand) - v1.18.0
 *
 * Manages API Client state:
 * - Collections (folders for organizing requests)
 * - Requests (HTTP requests with full configuration)
 * - Currently selected/active items
 */

import { create } from 'zustand';
import { ApiCollectionsTable, ApiRequestsTable, HttpMethod } from '@ownshell/core';

// ============================================
// Types
// ============================================

export interface ApiCollection extends ApiCollectionsTable {
  // Computed in UI
  children?: ApiCollection[];
  requests?: ApiRequest[];
}

export type ApiRequest = ApiRequestsTable;

interface ApiClientState {
  // Data
  collections: ApiCollection[];
  requests: ApiRequest[];

  // UI State
  selectedCollectionId: string | null;
  selectedRequestId: string | null;
  expandedCollectionIds: Set<string>;
  isLoading: boolean;
  error: string | null;

  // Collection Actions
  loadCollections: () => Promise<void>;
  createCollection: (data: {
    name: string;
    parent_id?: string | null;
    description?: string | null;
  }) => Promise<ApiCollection>;
  updateCollection: (
    id: string,
    data: {
      name?: string;
      parent_id?: string | null;
      description?: string | null;
      sort_order?: number;
    }
  ) => Promise<ApiCollection | undefined>;
  deleteCollection: (id: string) => Promise<void>;

  // Request Actions
  loadRequests: () => Promise<void>;
  createRequest: (data: {
    name: string;
    collection_id?: string | null;
    method?: HttpMethod;
    url?: string;
  }) => Promise<ApiRequest>;
  updateRequest: (
    id: string,
    data: Partial<{
      name: string;
      collection_id: string | null;
      method: HttpMethod;
      url: string;
      params: string;
      headers: string;
      body: string;
      body_type: 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary' | 'graphql';
      auth_type: 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'inherit';
      auth_config: string;
      network_host_id: string | null;
      environment_id: string | null;
      sort_order: number;
      last_executed_at: number | null;
    }>
  ) => Promise<ApiRequest | undefined>;
  deleteRequest: (id: string) => Promise<void>;
  duplicateRequest: (id: string) => Promise<ApiRequest>;

  // UI Actions
  selectCollection: (id: string | null) => void;
  selectRequest: (id: string | null) => void;
  toggleCollectionExpanded: (id: string) => void;
  setCollectionExpanded: (id: string, expanded: boolean) => void;
  expandAllCollections: () => void;
  collapseAllCollections: () => void;

  // Load all data
  loadAll: () => Promise<void>;
}

// ============================================
// Store
// ============================================

export const useApiStore = create<ApiClientState>((set, get) => ({
  // Initial State
  collections: [],
  requests: [],
  selectedCollectionId: null,
  selectedRequestId: null,
  expandedCollectionIds: new Set(),
  isLoading: false,
  error: null,

  // ==================== COLLECTION ACTIONS ====================

  loadCollections: async () => {
    set({ isLoading: true, error: null });

    try {
      const collections = await window.electronAPI.apiClient.collections.getAll();
      set({ collections, isLoading: false });
    } catch (error) {
      console.error('Failed to load API collections:', error);
      set({
        error: 'Failed to load collections',
        isLoading: false,
      });
    }
  },

  createCollection: async (data) => {
    set({ isLoading: true, error: null });

    try {
      const collection = await window.electronAPI.apiClient.collections.create(data);

      // Reload collections
      const collections = await window.electronAPI.apiClient.collections.getAll();
      set({ collections, isLoading: false });

      return collection;
    } catch (error) {
      console.error('Failed to create API collection:', error);
      set({
        error: 'Failed to create collection',
        isLoading: false,
      });
      throw error;
    }
  },

  updateCollection: async (id, data) => {
    set({ isLoading: true, error: null });

    try {
      const updated = await window.electronAPI.apiClient.collections.update(id, data);

      // Reload collections
      const collections = await window.electronAPI.apiClient.collections.getAll();
      set({ collections, isLoading: false });

      return updated;
    } catch (error) {
      console.error('Failed to update API collection:', error);
      set({
        error: 'Failed to update collection',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteCollection: async (id) => {
    set({ isLoading: true, error: null });

    try {
      await window.electronAPI.apiClient.collections.delete(id);

      // If deleted collection was selected, clear selection
      const { selectedCollectionId } = get();
      if (selectedCollectionId === id) {
        set({ selectedCollectionId: null });
      }

      // Remove from expanded set
      const expandedCollectionIds = new Set(get().expandedCollectionIds);
      expandedCollectionIds.delete(id);

      // Reload collections and requests (cascade delete may have removed requests)
      const collections = await window.electronAPI.apiClient.collections.getAll();
      const requests = await window.electronAPI.apiClient.requests.getAll();
      set({ collections, requests, expandedCollectionIds, isLoading: false });
    } catch (error) {
      console.error('Failed to delete API collection:', error);
      set({
        error: 'Failed to delete collection',
        isLoading: false,
      });
      throw error;
    }
  },

  // ==================== REQUEST ACTIONS ====================

  loadRequests: async () => {
    set({ isLoading: true, error: null });

    try {
      const requests = await window.electronAPI.apiClient.requests.getAll();
      set({ requests, isLoading: false });
    } catch (error) {
      console.error('Failed to load API requests:', error);
      set({
        error: 'Failed to load requests',
        isLoading: false,
      });
    }
  },

  createRequest: async (data) => {
    set({ isLoading: true, error: null });

    try {
      const request = await window.electronAPI.apiClient.requests.create(data);

      // Reload requests
      const requests = await window.electronAPI.apiClient.requests.getAll();
      set({ requests, isLoading: false });

      return request;
    } catch (error) {
      console.error('Failed to create API request:', error);
      set({
        error: 'Failed to create request',
        isLoading: false,
      });
      throw error;
    }
  },

  updateRequest: async (id, data) => {
    set({ isLoading: true, error: null });

    try {
      const updated = await window.electronAPI.apiClient.requests.update(id, data);

      // Reload requests
      const requests = await window.electronAPI.apiClient.requests.getAll();
      set({ requests, isLoading: false });

      return updated;
    } catch (error) {
      console.error('Failed to update API request:', error);
      set({
        error: 'Failed to update request',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteRequest: async (id) => {
    set({ isLoading: true, error: null });

    try {
      await window.electronAPI.apiClient.requests.delete(id);

      // If deleted request was selected, clear selection
      const { selectedRequestId } = get();
      if (selectedRequestId === id) {
        set({ selectedRequestId: null });
      }

      // Reload requests
      const requests = await window.electronAPI.apiClient.requests.getAll();
      set({ requests, isLoading: false });
    } catch (error) {
      console.error('Failed to delete API request:', error);
      set({
        error: 'Failed to delete request',
        isLoading: false,
      });
      throw error;
    }
  },

  duplicateRequest: async (id) => {
    set({ isLoading: true, error: null });

    try {
      const duplicate = await window.electronAPI.apiClient.requests.duplicate(id);

      // Reload requests
      const requests = await window.electronAPI.apiClient.requests.getAll();
      set({ requests, isLoading: false });

      return duplicate;
    } catch (error) {
      console.error('Failed to duplicate API request:', error);
      set({
        error: 'Failed to duplicate request',
        isLoading: false,
      });
      throw error;
    }
  },

  // ==================== UI ACTIONS ====================

  selectCollection: (id) => {
    set({ selectedCollectionId: id });
  },

  selectRequest: (id) => {
    set({ selectedRequestId: id });
  },

  toggleCollectionExpanded: (id) => {
    const expandedCollectionIds = new Set(get().expandedCollectionIds);
    if (expandedCollectionIds.has(id)) {
      expandedCollectionIds.delete(id);
    } else {
      expandedCollectionIds.add(id);
    }
    set({ expandedCollectionIds });
  },

  setCollectionExpanded: (id, expanded) => {
    const expandedCollectionIds = new Set(get().expandedCollectionIds);
    if (expanded) {
      expandedCollectionIds.add(id);
    } else {
      expandedCollectionIds.delete(id);
    }
    set({ expandedCollectionIds });
  },

  expandAllCollections: () => {
    const { collections } = get();
    const expandedCollectionIds = new Set(collections.map((c) => c.id));
    set({ expandedCollectionIds });
  },

  collapseAllCollections: () => {
    set({ expandedCollectionIds: new Set() });
  },

  // ==================== LOAD ALL ====================

  loadAll: async () => {
    set({ isLoading: true, error: null });

    try {
      const [collections, requests] = await Promise.all([
        window.electronAPI.apiClient.collections.getAll(),
        window.electronAPI.apiClient.requests.getAll(),
      ]);

      set({ collections, requests, isLoading: false });
    } catch (error) {
      console.error('Failed to load API client data:', error);
      set({
        error: 'Failed to load API client data',
        isLoading: false,
      });
    }
  },
}));

// ============================================
// Utility Selectors
// ============================================

/**
 * Build a tree structure from flat collections
 */
export function buildCollectionTree(
  collections: ApiCollection[],
  requests: ApiRequest[]
): ApiCollection[] {
  const collectionMap = new Map<string, ApiCollection>();
  const rootCollections: ApiCollection[] = [];

  // First pass: create all collections with empty children arrays
  for (const collection of collections) {
    collectionMap.set(collection.id, {
      ...collection,
      children: [],
      requests: [],
    });
  }

  // Second pass: build the tree and assign requests
  for (const collection of collections) {
    const node = collectionMap.get(collection.id)!;

    // Assign requests to this collection
    node.requests = requests.filter((r) => r.collection_id === collection.id);

    if (collection.parent_id) {
      const parent = collectionMap.get(collection.parent_id);
      if (parent) {
        parent.children!.push(node);
      } else {
        // Orphaned collection (parent deleted), treat as root
        rootCollections.push(node);
      }
    } else {
      rootCollections.push(node);
    }
  }

  return rootCollections;
}

/**
 * Get root-level requests (not in any collection)
 */
export function getRootRequests(requests: ApiRequest[]): ApiRequest[] {
  return requests.filter((r) => r.collection_id === null);
}

/**
 * Get all collection IDs in the tree (for expand all)
 */
export function getAllCollectionIds(collections: ApiCollection[]): string[] {
  return collections.map((c) => c.id);
}
