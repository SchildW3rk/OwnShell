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

/** Per-request settings; null = default (30 s, follow redirects, verify TLS). */
type RequestSettingsColumns = {
  timeout_seconds?: number | null;
  follow_redirects?: 0 | 1 | null;
  verify_tls?: 0 | 1 | null;
  variables?: string;
  cookie_jar?: 0 | 1 | null;
  kind?: 'http' | 'websocket';
  assertions?: string;
  captures?: string;
};

type VariableInput = Parameters<typeof window.electronAPI.apiClient.variables.set>[1][number];

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
      body_type?: 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary' | 'graphql';
      raw_content_type?: RawRequestContentType;
      auth_type?: 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'inherit';
      auth_config?: string;
      network_host_id?: string | null;
      environment_id?: string | null;
      sort_order?: number;
    } & RequestSettingsColumns) => window.electronAPI.apiClient.requests.create(data),
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
        body_type?: 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary' | 'graphql';
        raw_content_type?: RawRequestContentType;
        auth_type?: 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'inherit';
        auth_config?: string;
        network_host_id?: string | null;
        environment_id?: string | null;
        sort_order?: number;
        last_executed_at?: number | null;
      } & RequestSettingsColumns;
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

/**
 * Writes new sort_order values (manual order, sort by name) in one transaction; one refresh at the end.
 */
export function useReorderApiItems() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorToast();

  return useMutation({
    onError,
    mutationFn: async (changes: {
      collections: Array<{ id: string; sort_order: number }>;
      requests: Array<{ id: string; sort_order: number }>;
    }) => window.electronAPI.apiClient.reorder(changes),
    // Awaited so isPending lasts until the new order is loaded; the next move must not start from stale data.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.collections.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.requests.all() }),
      ]),
  });
}

// ==================== VARIABLES & HISTORY ====================

const globalVariablesKey = ['api', 'global-variables'] as const;
const historyKey = ['api', 'history'] as const;

/** Global API variables (secret values are never returned). */
export function useGlobalApiVariables() {
  return useQuery({
    queryKey: globalVariablesKey,
    queryFn: () => window.electronAPI.apiClient.variables.getGlobal(),
  });
}

/** Saves the variables of a folder (collectionId) or the global ones (null). */
export function useSaveApiVariables() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorToast();

  return useMutation({
    onError,
    mutationFn: ({ collectionId, variables }: { collectionId: string | null; variables: VariableInput[] }) =>
      window.electronAPI.apiClient.variables.set(collectionId, variables),
    onSuccess: (_result, { collectionId }) =>
      queryClient.invalidateQueries({
        queryKey: collectionId ? queryKeys.apiClient.collections.all() : globalVariablesKey,
      }),
  });
}

export function useApiHistory(enabled = true) {
  return useQuery({
    queryKey: historyKey,
    queryFn: () => window.electronAPI.apiClient.history.list(),
    enabled,
  });
}

/** Call after a send so an open history list shows it. */
export function useInvalidateApiHistory() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: historyKey });
}

export function useClearApiHistory() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorToast();

  return useMutation({
    onError,
    mutationFn: () => window.electronAPI.apiClient.history.clear(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: historyKey }),
  });
}

/** Refreshes the tree after an import. */
export function useInvalidateApiTree() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.collections.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.apiClient.requests.all() }),
    ]);
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
