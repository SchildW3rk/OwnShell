/**
 * API Client TanStack Query Hooks (v1.18.0)
 *
 * React Query hooks for API Collections and Requests
 * - Automatic caching and invalidation
 * - Optimistic updates
 * - Error handling
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApiCollectionsTable,
  ApiRequestsTable,
  HttpMethod,
  RawRequestContentType,
  RequestAuthType,
} from '@ownshell/core';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { queryKeys } from '@/lib/queryClient';

/** Mutations must not fail silently: every failed save/update/delete shows a toast. */
function useMutationErrorToast() {
  const { t } = useTranslation();
  return (error: Error) => toast.error(t('api.errors.changeFailed', { error: error.message }));
}

// ==================== COLLECTION HOOKS ====================

/**
 * Get all API collections
 */
export function useApiCollections() {
  return useQuery<ApiCollectionsTable[]>({
    queryKey: queryKeys.apiClient.collections.all(),
    queryFn: () => window.electronAPI.apiClient.collections.getAll(),
  });
}

/**
 * Get single API collection by ID
 */
export function useApiCollection(id: string | null) {
  return useQuery<ApiCollectionsTable | undefined>({
    queryKey: queryKeys.apiClient.collections.byId(id!),
    queryFn: () => window.electronAPI.apiClient.collections.getById(id!),
    enabled: !!id,
  });
}

/**
 * Create new API collection
 */
export function useCreateApiCollection() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorToast();

  return useMutation({
    onError,
    mutationFn: (data: {
      name: string;
      parent_id?: string | null;
      description?: string | null;
      sort_order?: number;
    }) => window.electronAPI.apiClient.collections.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.collections.all() });
    },
  });
}

/**
 * Update API collection
 */
export function useUpdateApiCollection() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorToast();

  return useMutation({
    onError,
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        parent_id?: string | null;
        description?: string | null;
        sort_order?: number;
        auth_type?: RequestAuthType;
        auth_config?: string;
      };
    }) => window.electronAPI.apiClient.collections.update(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.collections.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.collections.byId(variables.id) });
    },
  });
}

/**
 * Delete API collection
 */
export function useDeleteApiCollection() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorToast();

  return useMutation({
    onError,
    mutationFn: (id: string) => window.electronAPI.apiClient.collections.delete(id),
    onSuccess: () => {
      // Invalidate both collections and requests (cascade delete)
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.collections.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.requests.all() });
    },
  });
}

// ==================== REQUEST HOOKS ====================

/**
 * Get all API requests
 */
export function useApiRequests() {
  return useQuery<ApiRequestsTable[]>({
    queryKey: queryKeys.apiClient.requests.all(),
    queryFn: () => window.electronAPI.apiClient.requests.getAll(),
  });
}

/**
 * Get single API request by ID
 */
export function useApiRequest(id: string | null) {
  return useQuery<ApiRequestsTable | undefined>({
    queryKey: queryKeys.apiClient.requests.byId(id!),
    queryFn: () => window.electronAPI.apiClient.requests.getById(id!),
    enabled: !!id,
  });
}

/**
 * Get API requests by collection
 */
export function useApiRequestsByCollection(collectionId: string | null) {
  return useQuery<ApiRequestsTable[]>({
    queryKey: queryKeys.apiClient.requests.byCollection(collectionId),
    queryFn: () => window.electronAPI.apiClient.requests.getByCollection(collectionId),
  });
}

/**
 * Create new API request
 */
export function useCreateApiRequest() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorToast();

  return useMutation({
    onError,
    mutationFn: (data: {
      name: string;
      collection_id?: string | null;
      method?: HttpMethod;
      url?: string;
      params?: string;
      headers?: string;
      body?: string;
      body_type?: 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary';
      raw_content_type?: RawRequestContentType;
      auth_type?: 'none' | 'bearer' | 'basic' | 'api-key' | 'inherit';
      auth_config?: string;
      network_host_id?: string | null;
      environment_id?: string | null;
      sort_order?: number;
    }) => window.electronAPI.apiClient.requests.create(data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.requests.all() });
      if (variables.collection_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.apiClient.requests.byCollection(variables.collection_id),
        });
      }
    },
  });
}

/**
 * Update API request
 */
export function useUpdateApiRequest() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorToast();

  return useMutation({
    onError,
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        collection_id?: string | null;
        method?: HttpMethod;
        url?: string;
        params?: string;
        headers?: string;
        body?: string;
        body_type?: 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary';
        raw_content_type?: RawRequestContentType;
        auth_type?: 'none' | 'bearer' | 'basic' | 'api-key' | 'inherit';
        auth_config?: string;
        network_host_id?: string | null;
        environment_id?: string | null;
        sort_order?: number;
        last_executed_at?: number | null;
      };
    }) => window.electronAPI.apiClient.requests.update(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.requests.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.requests.byId(variables.id) });
    },
  });
}

/**
 * Delete API request
 */
export function useDeleteApiRequest() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorToast();

  return useMutation({
    onError,
    mutationFn: (id: string) => window.electronAPI.apiClient.requests.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.requests.all() });
    },
  });
}

/**
 * Duplicate API request
 */
export function useDuplicateApiRequest() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorToast();

  return useMutation({
    onError,
    mutationFn: (id: string) => window.electronAPI.apiClient.requests.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.requests.all() });
    },
  });
}

// ==================== COMBINED HOOKS ====================

/**
 * Get all API client data (collections + requests)
 * Useful for initial load
 */
export function useApiClientData() {
  const collectionsQuery = useApiCollections();
  const requestsQuery = useApiRequests();

  return {
    collections: collectionsQuery.data ?? [],
    requests: requestsQuery.data ?? [],
    isLoading: collectionsQuery.isLoading || requestsQuery.isLoading,
    isError: collectionsQuery.isError || requestsQuery.isError,
    error: collectionsQuery.error || requestsQuery.error,
    refetch: async () => {
      await Promise.all([collectionsQuery.refetch(), requestsQuery.refetch()]);
    },
  };
}
