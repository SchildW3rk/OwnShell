import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GitCodeErrorCode,
  GitDiffScope,
  ProjectDiscoveryData,
  ProjectsTable,
  ProjectUpdate,
} from '@ownshell/core';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { queryKeys } from '../../lib/queryClient';

export interface ProjectInput {
  name: string;
  host_id: string;
  repository_path: string;
  compose_project?: string | null;
}

export class ProjectGitStatusError extends Error {
  constructor(
    message: string,
    readonly code?: 'NOT_A_REPOSITORY'
  ) {
    super(message);
    this.name = 'ProjectGitStatusError';
  }
}

export class ProjectGitCodeError extends Error {
  constructor(message: string, readonly code?: GitCodeErrorCode) {
    super(message);
    this.name = 'ProjectGitCodeError';
  }
}

function getIpcError(result: unknown): string | null {
  if (!result || typeof result !== 'object' || !('error' in result)) return null;
  return String((result as { error?: unknown }).error || 'Unknown IPC error');
}

function normalizeProjects(result: unknown): ProjectsTable[] {
  if (Array.isArray(result)) return result as ProjectsTable[];
  throw new Error(getIpcError(result) || 'Failed to load projects');
}

function normalizeProject(result: unknown): ProjectsTable {
  const error = getIpcError(result);
  if (error) throw new Error(error);
  if (!result || typeof result !== 'object' || !('id' in result)) {
    throw new Error('Project not found');
  }
  return result as ProjectsTable;
}

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.all(),
    queryFn: async () => normalizeProjects(await window.electronAPI.projects.getAll()),
    staleTime: 60 * 1000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.projects.byId(id),
    queryFn: async () => normalizeProject(await window.electronAPI.projects.getById(id)),
    enabled: Boolean(id),
  });
}

export function useProjectGitStatus(id: string) {
  return useQuery({
    queryKey: queryKeys.projects.gitStatus(id),
    queryFn: async () => {
      const result = await window.electronAPI.projects.gitStatus(id);
      if (!result.success) throw new ProjectGitStatusError(result.error, result.code);
      return result.status;
    },
    enabled: Boolean(id),
    staleTime: 15 * 1000,
    retry: false,
  });
}

export function useProjectGitCodeDirectory(id: string, path: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.projects.gitCodeDirectory(id, path),
    queryFn: async () => {
      const result = await window.electronAPI.projects.gitCodeDirectory({ projectId: id, path });
      if (!result.success) throw new ProjectGitCodeError(result.error, result.errorCode);
      return { entries: result.entries, truncated: result.truncated };
    },
    enabled: Boolean(id) && enabled,
    staleTime: 30 * 1000,
    retry: false,
  });
}

export function useProjectGitCodeFile(id: string, path: string | null) {
  return useQuery({
    queryKey: queryKeys.projects.gitCodeFile(id, path ?? ''),
    queryFn: async () => {
      if (!path) throw new Error('No Git file selected');
      const result = await window.electronAPI.projects.gitCodeFile({ projectId: id, path });
      if (!result.success) throw new ProjectGitCodeError(result.error, result.errorCode);
      return result;
    },
    enabled: Boolean(id) && Boolean(path),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useProjectGitBranches(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.projects.gitBranches(id),
    queryFn: async () => {
      const result = await window.electronAPI.projects.gitBranches(id);
      if (!result.success) throw new Error(result.error);
      return { branches: result.branches, truncated: result.truncated };
    },
    enabled: Boolean(id) && enabled,
    staleTime: 15 * 1000,
    retry: false,
  });
}

export function useProjectGitHistory(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.projects.gitHistory(id),
    queryFn: async () => {
      const result = await window.electronAPI.projects.gitHistory(id);
      if (!result.success) throw new Error(result.error);
      return { commits: result.commits, truncated: result.truncated };
    },
    enabled: Boolean(id) && enabled,
    staleTime: 15 * 1000,
    retry: false,
  });
}

export function useProjectGitCommitDetails(id: string, commitHash: string | null) {
  return useQuery({
    queryKey: queryKeys.projects.gitCommitDetails(id, commitHash ?? ''),
    queryFn: async () => {
      if (!commitHash) throw new Error('No Git commit selected');
      const result = await window.electronAPI.projects.gitCommitDetails({
        projectId: id,
        commitHash,
      });
      if (!result.success) throw new Error(result.error);
      return result.details;
    },
    enabled: Boolean(id) && Boolean(commitHash),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export interface GitDiffSelection {
  path: string;
  scope: GitDiffScope;
}

export function useProjectGitDiff(id: string, selection: GitDiffSelection | null) {
  return useQuery({
    queryKey: queryKeys.projects.gitDiff(id, selection?.path ?? '', selection?.scope ?? 'unstaged'),
    queryFn: async () => {
      if (!selection) throw new Error('No Git diff selected');
      const result = await window.electronAPI.projects.gitDiff({
        projectId: id,
        path: selection.path,
        scope: selection.scope,
      });
      if (!result.success) throw new Error(result.error);
      return result.diff;
    },
    enabled: Boolean(id) && Boolean(selection),
    staleTime: 10 * 1000,
    retry: false,
  });
}

export function useProjectGitWorkingTreeActions(id: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const refreshWorkingTree = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitStatus(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitDiffAll(id) }),
    ]);

  const stageFile = useMutation({
    mutationFn: async (path: string) => {
      const result = await window.electronAPI.projects.stageGitFile({ projectId: id, path });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: async (_data, path) => {
      toast.success(t('projects.fileStaged', { path }));
      await refreshWorkingTree();
    },
    onError: (error: Error) => toast.error(t('projects.stageFileFailed', { error: error.message })),
  });

  const unstageFile = useMutation({
    mutationFn: async (path: string) => {
      const result = await window.electronAPI.projects.unstageGitFile({ projectId: id, path });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: async (_data, path) => {
      toast.success(t('projects.fileUnstaged', { path }));
      await refreshWorkingTree();
    },
    onError: (error: Error) =>
      toast.error(t('projects.unstageFileFailed', { error: error.message })),
  });

  const createCommit = useMutation({
    mutationFn: async (message: string) => {
      const result = await window.electronAPI.projects.createGitCommit({
        projectId: id,
        message,
      });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: async () => {
      toast.success(t('projects.commitCreated'));
      await Promise.all([
        refreshWorkingTree(),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitHistory(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitCommitDetailsAll(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitCodeAll(id) }),
      ]);
    },
    onError: (error: Error) =>
      toast.error(t('projects.commitCreateFailed', { error: error.message })),
  });

  return { stageFile, unstageFile, createCommit };
}

export function useDiscoverProjectCandidates() {
  return useMutation({
    mutationFn: async (hostId: string): Promise<ProjectDiscoveryData> => {
      const result = await window.electronAPI.projects.discover(hostId);
      if (!result.success) throw new Error(result.error);
      return { candidates: result.candidates, truncated: result.truncated };
    },
  });
}

export function useProjectGitBranchActions(id: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Every per-project git query key starts with byId(id).
  const refreshGitData = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects.byId(id) });
  };

  const createBranch = useMutation({
    mutationFn: async (branch: string) => {
      const result = await window.electronAPI.projects.createGitBranch({ projectId: id, branch });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: (_data, branch) => {
      toast.success(t('projects.branchCreated', { name: branch }));
      refreshGitData();
    },
    onError: (error: Error) =>
      toast.error(t('projects.branchCreateFailed', { error: error.message })),
  });

  const switchBranch = useMutation({
    mutationFn: async (branch: string) => {
      const result = await window.electronAPI.projects.switchGitBranch({ projectId: id, branch });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: (_data, branch) => {
      toast.success(t('projects.branchSwitched', { name: branch }));
      refreshGitData();
    },
    onError: (error: Error) =>
      toast.error(t('projects.branchSwitchFailed', { error: error.message })),
  });

  const deleteBranch = useMutation({
    mutationFn: async (branch: string) => {
      const result = await window.electronAPI.projects.deleteGitBranch({ projectId: id, branch });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: (_data, branch) => {
      toast.success(t('projects.branchDeleted', { name: branch }));
      refreshGitData();
    },
    onError: (error: Error) =>
      toast.error(t('projects.branchDeleteFailed', { error: error.message })),
  });

  return { createBranch, switchBranch, deleteBranch };
}

export function useInitProjectGitRepository(id: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await window.electronAPI.projects.initGitRepository(id);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success(t('projects.repositoryInitialized'));
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitStatus(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitBranches(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitHistory(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitCodeAll(id) });
    },
    onError: (error: Error) =>
      toast.error(t('projects.repositoryInitFailed', { error: error.message })),
  });
}

export function useCreateProject() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ProjectInput) =>
      normalizeProject(await window.electronAPI.projects.create(data)),
    onSuccess: () => {
      toast.success(t('projects.created'));
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
    },
    onError: (error: Error) => toast.error(t('projects.createFailed', { error: error.message })),
  });
}

export function useUpdateProject() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Omit<ProjectUpdate, 'updated_at'> }) =>
      normalizeProject(await window.electronAPI.projects.update(id, data)),
    onSuccess: (project) => {
      toast.success(t('projects.updated'));
      queryClient.setQueryData(queryKeys.projects.byId(project.id), project);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitStatus(project.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitBranches(project.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitHistory(project.id) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projects.gitCommitDetailsAll(project.id),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitDiffAll(project.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.gitCodeAll(project.id) });
    },
    onError: (error: Error) => toast.error(t('projects.updateFailed', { error: error.message })),
  });
}

export function useDeleteProject() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await window.electronAPI.projects.delete(id);
      const error = getIpcError(result);
      if (error || !result.success) throw new Error(error || 'Failed to delete project');
      return id;
    },
    onSuccess: (id) => {
      toast.success(t('projects.deleted'));
      queryClient.removeQueries({ queryKey: queryKeys.projects.byId(id) });
      queryClient.removeQueries({ queryKey: queryKeys.projects.gitStatus(id) });
      queryClient.removeQueries({ queryKey: queryKeys.projects.gitBranches(id) });
      queryClient.removeQueries({ queryKey: queryKeys.projects.gitHistory(id) });
      queryClient.removeQueries({ queryKey: queryKeys.projects.gitCommitDetailsAll(id) });
      queryClient.removeQueries({ queryKey: queryKeys.projects.gitDiffAll(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
    },
    onError: (error: Error) => toast.error(t('projects.deleteFailed', { error: error.message })),
  });
}
