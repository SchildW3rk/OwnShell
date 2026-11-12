export interface ProjectsTable {
  id: string;
  name: string;
  host_id: string | null;
  repository_path: string;
  compose_project: string | null;
  created_at: number;
  updated_at: number;
}

export interface NewProject {
  id: string;
  name: string;
  host_id: string;
  repository_path: string;
  compose_project?: string | null;
  created_at: number;
  updated_at: number;
}

export interface ProjectUpdate {
  name?: string;
  host_id?: string;
  repository_path?: string;
  compose_project?: string | null;
  updated_at: number;
}

export interface GitChangedFile {
  status: string;
  path: string;
  originalPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitCommitSummary {
  hash: string;
  shortHash: string;
  author: string;
  authoredAt: string;
  subject: string;
}

export interface GitCommitHistoryData {
  commits: GitCommitSummary[];
  truncated: boolean;
}

export type GitCommitHistoryResult =
  | ({ success: true } & GitCommitHistoryData)
  | { success: false; error: string };

export interface GitCommitDetailsRequest {
  projectId: string;
  commitHash: string;
}

export interface GitCommitDetails {
  commit: GitCommitSummary;
  diff: string;
  truncated: boolean;
}

export type GitCommitDetailsResult =
  | { success: true; details: GitCommitDetails }
  | { success: false; error: string };

export interface GitRepositoryStatus {
  rootPath: string;
  bare: boolean;
  branch: string;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  changedFiles: GitChangedFile[];
  changedFilesTruncated: boolean;
  lastCommit: GitCommitSummary | null;
}

export type GitRepositoryStatusResult =
  | { success: true; status: GitRepositoryStatus }
  | { success: false; error: string; code?: 'NOT_A_REPOSITORY' };

export type GitInitRepositoryResult = { success: true } | { success: false; error: string };

export type GitDiffScope = 'staged' | 'unstaged';

export interface GitDiffRequest {
  projectId: string;
  path: string;
  scope: GitDiffScope;
}

export interface GitFileDiff {
  path: string;
  scope: GitDiffScope;
  content: string;
  truncated: boolean;
}

export type GitFileDiffResult =
  | { success: true; diff: GitFileDiff }
  | { success: false; error: string };

export interface GitFileActionRequest {
  projectId: string;
  path: string;
}

export interface GitCreateCommitRequest {
  projectId: string;
  message: string;
}

export type GitWorkingTreeActionResult = { success: true } | { success: false; error: string };

export interface GitBranchInfo {
  name: string;
  current: boolean;
  upstream: string | null;
}

export interface GitBranchesData {
  branches: GitBranchInfo[];
  truncated: boolean;
}

export type GitBranchesResult =
  | ({ success: true } & GitBranchesData)
  | { success: false; error: string };

export interface GitBranchActionRequest {
  projectId: string;
  branch: string;
}

export type GitBranchActionResult = { success: true } | { success: false; error: string };

export interface GitCodeEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file' | 'submodule';
  objectId: string;
  mode: string;
}

export interface GitCodeDirectoryRequest {
  projectId: string;
  path: string;
}

export type GitCodeErrorCode =
  | 'DIRECTORY_READ_FAILED'
  | 'FILE_READ_FAILED'
  | 'NOT_A_FILE'
  | 'FILE_TOO_LARGE'
  | 'BINARY_FILE';

export type GitCodeDirectoryResult =
  | { success: true; entries: GitCodeEntry[]; truncated: boolean }
  | { success: false; error: string; errorCode?: GitCodeErrorCode };

export interface GitCodeFileRequest {
  projectId: string;
  path: string;
}

export type GitCodeFileResult =
  | { success: true; path: string; content: string; byteLength: number }
  | { success: false; error: string; errorCode?: GitCodeErrorCode };

export interface ProjectDiscoveryCandidate {
  composeProject: string;
  workingDirectory: string;
  repositoryPath: string | null;
  configFiles: string[];
  services: string[];
  containerCount: number;
}

export interface ProjectDiscoveryData {
  candidates: ProjectDiscoveryCandidate[];
  truncated: boolean;
}

export type ProjectDiscoveryResult =
  | ({ success: true } & ProjectDiscoveryData)
  | { success: false; error: string };
