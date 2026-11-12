import type { IpcRenderer } from 'electron';
import type {
  GitBranchActionRequest,
  GitBranchActionResult,
  GitBranchesResult,
  GitCommitDetailsRequest,
  GitCommitDetailsResult,
  GitCommitHistoryRequest,
  GitCommitHistoryResult,
  GitComposeStatusResult,
  GitCreateCommitRequest,
  GitCodeDirectoryRequest,
  GitCodeDirectoryResult,
  GitCodeFileListResult,
  GitCodeFileRequest,
  GitCodeFileResult,
  GitDiffRequest,
  GitFileActionRequest,
  GitFileDiffResult,
  GitInitRepositoryResult,
  GitRepositoryStatusResult,
  GitWorkingTreeActionResult,
  GitWorkingTreeNumstatResult,
  ProjectDiscoveryResult,
  ProjectsTable,
  ProjectUpdate,
} from '@ownshell/core';

export interface ProjectInput {
  name: string;
  host_id: string;
  repository_path: string;
  compose_project?: string | null;
}

export function createProjectsApi(ipcRenderer: IpcRenderer) {
  return {
    getAll: () => ipcRenderer.invoke('db:projects:get-all') as Promise<ProjectsTable[]>,
    getById: (id: string) =>
      ipcRenderer.invoke('db:projects:get-by-id', id) as Promise<ProjectsTable | null>,
    create: (data: ProjectInput) =>
      ipcRenderer.invoke('db:projects:create', data) as Promise<ProjectsTable>,
    update: (id: string, data: Omit<ProjectUpdate, 'updated_at'>) =>
      ipcRenderer.invoke('db:projects:update', id, data) as Promise<ProjectsTable>,
    delete: (id: string) =>
      ipcRenderer.invoke('db:projects:delete', id) as Promise<{ success: boolean }>,
    gitStatus: (id: string) =>
      ipcRenderer.invoke('ssh:git:status', id) as Promise<GitRepositoryStatusResult>,
    gitHistory: (request: GitCommitHistoryRequest) =>
      ipcRenderer.invoke('ssh:git:history', request) as Promise<GitCommitHistoryResult>,
    gitWorkingTreeNumstat: (id: string) =>
      ipcRenderer.invoke('ssh:git:numstat', id) as Promise<GitWorkingTreeNumstatResult>,
    gitCommitDetails: (request: GitCommitDetailsRequest) =>
      ipcRenderer.invoke('ssh:git:commit-details', request) as Promise<GitCommitDetailsResult>,
    gitDiff: (request: GitDiffRequest) =>
      ipcRenderer.invoke('ssh:git:diff', request) as Promise<GitFileDiffResult>,
    stageGitFile: (request: GitFileActionRequest) =>
      ipcRenderer.invoke('ssh:git:stage-file', request) as Promise<GitWorkingTreeActionResult>,
    unstageGitFile: (request: GitFileActionRequest) =>
      ipcRenderer.invoke('ssh:git:unstage-file', request) as Promise<GitWorkingTreeActionResult>,
    createGitCommit: (request: GitCreateCommitRequest) =>
      ipcRenderer.invoke('ssh:git:create-commit', request) as Promise<GitWorkingTreeActionResult>,
    gitBranches: (id: string) =>
      ipcRenderer.invoke('ssh:git:branches', id) as Promise<GitBranchesResult>,
    initGitRepository: (id: string) =>
      ipcRenderer.invoke('ssh:git:init', id) as Promise<GitInitRepositoryResult>,
    createGitBranch: (request: GitBranchActionRequest) =>
      ipcRenderer.invoke('ssh:git:create-branch', request) as Promise<GitBranchActionResult>,
    switchGitBranch: (request: GitBranchActionRequest) =>
      ipcRenderer.invoke('ssh:git:switch-branch', request) as Promise<GitBranchActionResult>,
    deleteGitBranch: (request: GitBranchActionRequest) =>
      ipcRenderer.invoke('ssh:git:delete-branch', request) as Promise<GitBranchActionResult>,
    checkoutRemoteGitBranch: (request: GitBranchActionRequest) =>
      ipcRenderer.invoke(
        'ssh:git:checkout-remote-branch',
        request
      ) as Promise<GitBranchActionResult>,
    gitCodeDirectory: (request: GitCodeDirectoryRequest) =>
      ipcRenderer.invoke('ssh:git:code-directory', request) as Promise<GitCodeDirectoryResult>,
    gitCodeFile: (request: GitCodeFileRequest) =>
      ipcRenderer.invoke('ssh:git:code-file', request) as Promise<GitCodeFileResult>,
    gitCodeFiles: (id: string) =>
      ipcRenderer.invoke('ssh:git:code-files', id) as Promise<GitCodeFileListResult>,
    composeStatus: (id: string) =>
      ipcRenderer.invoke('ssh:git:compose-status', id) as Promise<GitComposeStatusResult>,
    discover: (hostId: string) =>
      ipcRenderer.invoke('ssh:docker:discover-projects', {
        hostId,
      }) as Promise<ProjectDiscoveryResult>,
  };
}
