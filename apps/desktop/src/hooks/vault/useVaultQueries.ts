/**
 * Vault TanStack Query Hooks (v1.17.0)
 *
 * React Query hooks for Vault Credentials and Environments
 * - Automatic caching and invalidation
 * - Optimistic updates
 * - Error handling
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { VaultCredentialsTable, VaultEnvironmentsTable } from '@ownshell/core';
import { queryKeys } from '@/lib/queryClient';

// ==================== CREDENTIALS HOOKS ====================

/**
 * Get all vault credentials
 */
export function useVaultCredentials() {
  return useQuery<VaultCredentialsTable[]>({
    queryKey: queryKeys.vault.credentials.all(),
    queryFn: () => window.electronAPI.vault.credentials.getAll(),
  });
}

/**
 * Get single vault credential by ID
 */
export function useVaultCredential(id: string | null) {
  return useQuery<VaultCredentialsTable | undefined>({
    queryKey: queryKeys.vault.credentials.byId(id!),
    queryFn: () => window.electronAPI.vault.credentials.getById(id!),
    enabled: !!id,
  });
}

/**
 * Create new vault credential
 */
export function useCreateVaultCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      title: string;
      username: string | null;
      password: string;
      url: string | null;
      notes: string | null;
      tags: string[] | null;
    }) => window.electronAPI.vault.credentials.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.credentials.all() });
    },
  });
}

/**
 * Update vault credential
 */
export function useUpdateVaultCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        title?: string;
        username?: string | null;
        password?: string;
        url?: string | null;
        notes?: string | null;
        tags?: string[] | null;
        favorite?: number;
      };
    }) => window.electronAPI.vault.credentials.update(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.credentials.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.credentials.byId(variables.id) });
    },
  });
}

/**
 * Delete vault credential
 */
export function useDeleteVaultCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => window.electronAPI.vault.credentials.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.credentials.all() });
    },
  });
}

/**
 * Decrypt credential password
 * Note: This does NOT cache the decrypted password for security reasons
 */
export function useDecryptPassword() {
  return useMutation<string, Error, string>({
    mutationFn: (id: string) => window.electronAPI.vault.credentials.decryptPassword(id),
  });
}

/**
 * Open credential URL in browser
 */
export function useOpenURL() {
  return useMutation({
    mutationFn: (url: string) => window.electronAPI.vault.credentials.openURL(url),
  });
}

/**
 * Toggle credential favorite status
 */
export function useToggleCredentialFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: number }) =>
      window.electronAPI.vault.credentials.toggleFavorite(id, favorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.credentials.all() });
    },
  });
}

// ==================== ENVIRONMENTS HOOKS ====================

/**
 * Get all vault environment sets
 */
export function useVaultEnvironments() {
  return useQuery<VaultEnvironmentsTable[]>({
    queryKey: queryKeys.vault.environments.all(),
    queryFn: () => window.electronAPI.vault.environments.getAll(),
  });
}

/**
 * Get single vault environment by ID
 */
export function useVaultEnvironment(id: string | null) {
  return useQuery<VaultEnvironmentsTable | undefined>({
    queryKey: queryKeys.vault.environments.byId(id!),
    queryFn: () => window.electronAPI.vault.environments.getById(id!),
    enabled: !!id,
  });
}

/**
 * Get all unique projects (for grouping/filtering)
 */
export function useVaultProjects() {
  return useQuery<string[]>({
    queryKey: queryKeys.vault.projects.all(),
    queryFn: () => window.electronAPI.vault.environments.getProjects(),
  });
}

/**
 * Get environments by project
 */
export function useVaultEnvironmentsByProject(project: string | null) {
  return useQuery<VaultEnvironmentsTable[]>({
    queryKey: queryKeys.vault.environments.byProject(project!),
    queryFn: () => window.electronAPI.vault.environments.getByProject(project!),
    enabled: !!project,
  });
}

/**
 * Create new vault environment set
 */
export function useCreateVaultEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      project: string;
      description: string | null;
      variables: Array<{ key: string; value: string }>;
      host_id: string | null;
      default_remote_path: string | null;
    }) => window.electronAPI.vault.environments.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.environments.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.projects.all() });
    },
  });
}

/**
 * Update vault environment set
 */
export function useUpdateVaultEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        project?: string;
        description?: string | null;
        variables?: Array<{ key: string; value: string }>;
        host_id?: string | null;
        default_remote_path?: string | null;
        favorite?: number;
      };
    }) => window.electronAPI.vault.environments.update(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.environments.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.environments.byId(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.projects.all() });
    },
  });
}

/**
 * Delete vault environment set
 */
export function useDeleteVaultEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => window.electronAPI.vault.environments.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.environments.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.projects.all() });
    },
  });
}

/**
 * Decrypt environment variables
 * Note: This does NOT cache the decrypted variables for security reasons
 */
export function useDecryptVariables() {
  return useMutation<Array<{ key: string; value: string }>, Error, string>({
    mutationFn: (id: string) => window.electronAPI.vault.environments.decryptVariables(id),
  });
}

/**
 * Deploy environment to SFTP server as .env file
 */
export function useDeployToSFTP() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      envId,
      params,
    }: {
      envId: string;
      params: { connectionId: string; remotePath: string };
    }) => window.electronAPI.vault.environments.deployToSFTP(envId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.environments.all() });
    },
  });
}

/**
 * Toggle environment favorite status
 */
export function useToggleEnvironmentFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: number }) =>
      window.electronAPI.vault.environments.toggleFavorite(id, favorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.environments.all() });
    },
  });
}
