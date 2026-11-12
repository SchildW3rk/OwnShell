import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NewSidebarFolder,
  SidebarFolderResourceType,
  SidebarFoldersTable,
  SidebarFolderUpdate,
} from '@ownshell/core';
import toast from 'react-hot-toast';
import { queryKeys } from '../lib/queryClient';
import { i18n } from '../i18n';

function normalizeFoldersResult(result: unknown): SidebarFoldersTable[] {
  if (Array.isArray(result)) {
    return result as SidebarFoldersTable[];
  }

  const error =
    result && typeof result === 'object' && 'error' in result
      ? String((result as { error?: unknown }).error)
      : 'Failed to load folders';

  throw new Error(error);
}

export function useSidebarFolders(resourceType: SidebarFolderResourceType) {
  return useQuery({
    queryKey: queryKeys.sidebarFolders.list(resourceType),
    queryFn: async () =>
      normalizeFoldersResult(await window.electronAPI.sidebarFolders.getAll(resourceType)),
    staleTime: 60 * 1000,
  });
}

export function useCreateSidebarFolder(resourceType: SidebarFolderResourceType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<NewSidebarFolder> =>
      window.electronAPI.sidebarFolders.create({
        resource_type: resourceType,
        name,
      }),
    onSuccess: () => {
      toast.success(i18n.t('sidebar.folderCreated'));
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarFolders.list(resourceType) });
    },
    onError: (error: Error) => {
      toast.error(`${i18n.t('sidebar.folderCreateFailed')}: ${error.message}`);
    },
  });
}

export function useUpdateSidebarFolder(resourceType: SidebarFolderResourceType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      update,
    }: {
      id: string;
      update: Omit<SidebarFolderUpdate, 'updated_at'>;
    }): Promise<void> => {
      await window.electronAPI.sidebarFolders.update(id, update);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarFolders.list(resourceType) });
    },
    onError: (error: Error) => {
      toast.error(`${i18n.t('sidebar.folderUpdateFailed')}: ${error.message}`);
    },
  });
}

export function useDeleteSidebarFolder(resourceType: SidebarFolderResourceType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await window.electronAPI.sidebarFolders.delete(id);
    },
    onSuccess: () => {
      toast.success(i18n.t('sidebar.folderDeleted'));
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarFolders.list(resourceType) });
    },
    onError: (error: Error) => {
      toast.error(`${i18n.t('sidebar.folderDeleteFailed')}: ${error.message}`);
    },
  });
}
