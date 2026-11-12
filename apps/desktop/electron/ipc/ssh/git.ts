import type {
  GitBranchActionRequest,
  GitBranchActionResult,
  GitBranchesResult,
  GitCommitDetailsResult,
  GitCommitHistoryResult,
  GitCreateCommitRequest,
  GitFileActionRequest,
  GitFileDiffResult,
  GitInitRepositoryResult,
  GitRepositoryStatus,
  GitRepositoryStatusResult,
  GitWorkingTreeActionResult,
  ProjectQueries,
} from '@ownshell/core';
import { logger } from '../../logger';
import {
  buildGitBranchListCommand,
  buildGitBranchNameValidationCommand,
  buildGitCreateBranchCommand,
  buildGitDeleteBranchCommand,
  buildGitSwitchBranchCommand,
  isSafeBranchName,
  parseGitBranches,
} from '../../projects/git-branches';
import {
  buildGitDiffCommand,
  buildGitStatusForPathCommand,
  isSafeRepositoryRelativePath,
  truncateGitDiff,
} from '../../projects/git-diff';
import {
  buildGitCommitDiffCommand,
  buildGitCommitHistoryCommand,
  buildGitCommitSummaryCommand,
  buildGitCommitValidationCommand,
  MAX_GIT_HISTORY_BYTES,
  parseGitCommitHistory,
  parseGitCommitSummary,
  truncateGitCommitDiff,
} from '../../projects/git-history';
import { buildGitInitRepositoryCommand } from '../../projects/git-init';
import {
  buildGitBareRepositoryCheckCommand,
  buildGitRepositoryCheckCommand,
  buildGitRepositoryRootCommand,
  parseAheadBehind,
  parseGitBareRepository,
  parseGitStatusPorcelain,
} from '../../projects/git-status';
import {
  buildGitCreateCommitCommand,
  buildGitStageFilesCommand,
  buildGitUnstageFilesCommand,
} from '../../projects/git-working-tree';
import { shellQuotePath } from '../../utils/shell-quote';
import { safeHandle } from '../safe-ipc';
import {
  sshGitBranchActionSchema,
  sshGitCommitDetailsSchema,
  sshGitCreateCommitSchema,
  sshGitDiffSchema,
  sshGitFileActionSchema,
  sshProjectIdSchema,
} from '../schemas/ssh';
import type { SSHIPCContext } from './context';

const MAX_CHANGED_FILES = 500;
const MAX_STATUS_BYTES = 1024 * 1024;

function getCommandError(stderr: string, fallback: string): string {
  const message = stderr.trim();
  return message || fallback;
}

type GitSSHSession = Parameters<SSHIPCContext['execCommand']>[0];

async function readBareRepository(
  ctx: SSHIPCContext,
  session: GitSSHSession,
  repositoryPath: string
): Promise<{ success: true; bare: boolean } | { success: false; error: string }> {
  const result = await ctx.execCommand(
    session,
    buildGitBareRepositoryCheckCommand(repositoryPath)
  );
  const bare = result.exitCode === 0 ? parseGitBareRepository(result.stdout) : null;
  if (bare === null) {
    return {
      success: false,
      error: getCommandError(result.stderr, 'Could not determine Git repository type'),
    };
  }
  return { success: true, bare };
}

async function requireWorkingTree(
  ctx: SSHIPCContext,
  session: GitSSHSession,
  repositoryPath: string
): Promise<string | null> {
  const repositoryType = await readBareRepository(ctx, session, repositoryPath);
  if (!repositoryType.success) return repositoryType.error;
  return repositoryType.bare ? 'This action is not available for bare repositories' : null;
}

export function setupSSHGitHandlers(ctx: SSHIPCContext, projectQueries: ProjectQueries): void {
  safeHandle(
    'ssh:git:status',
    sshProjectIdSchema,
    async (_event, projectId): Promise<GitRepositoryStatusResult> => {
      const project = await projectQueries.getById(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }
      if (!project.host_id) {
        return { success: false, error: 'Project has no SSH host' };
      }

      try {
        const sessionId = await ctx.getOrCreateBackgroundSession(project.host_id);
        const session = ctx.activeSessions.get(sessionId);
        if (!session) {
          return { success: false, error: 'SSH session is not available' };
        }

        const repositoryResult = await ctx.execCommand(
          session,
          buildGitRepositoryCheckCommand(project.repository_path)
        );
        if (repositoryResult.exitCode !== 0) {
          return {
            success: false,
            error: getCommandError(
              repositoryResult.stderr,
              'Repository path is not a Git repository'
            ),
            code: 'NOT_A_REPOSITORY',
          };
        }

        const repositoryType = await readBareRepository(ctx, session, project.repository_path);
        if (!repositoryType.success) return repositoryType;
        const { bare } = repositoryType;

        const rootResult = await ctx.execCommand(
          session,
          buildGitRepositoryRootCommand(project.repository_path, bare)
        );
        if (rootResult.exitCode !== 0) {
          return {
            success: false,
            error: getCommandError(rootResult.stderr, 'Could not read Git repository root'),
          };
        }

        const git = `git -C ${shellQuotePath(project.repository_path)}`;
        const statusPromise = bare
          ? Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
          : ctx.execCommand(
              session,
              `${git} status --porcelain=v1 -z --untracked-files=all | head -c ${
                MAX_STATUS_BYTES + 1
              }`
            );

        const [branchResult, statusResult, commitResult, upstreamResult] = await Promise.all([
          ctx.execCommand(session, `${git} branch --show-current`),
          statusPromise,
          ctx.execCommand(session, `${git} log -1 --format=%H%x1f%h%x1f%an%x1f%aI%x1f%s`),
          ctx.execCommand(
            session,
            `${git} rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'`
          ),
        ]);

        if (branchResult.exitCode !== 0) {
          return {
            success: false,
            error: getCommandError(branchResult.stderr, 'Could not read Git branch'),
          };
        }
        if (statusResult.exitCode !== 0 || statusResult.stderr.trim()) {
          return {
            success: false,
            error: getCommandError(statusResult.stderr, 'Could not read Git status'),
          };
        }

        const lastCommit =
          commitResult.exitCode === 0 ? parseGitCommitSummary(commitResult.stdout) : null;
        const branch = branchResult.stdout.trim();
        const upstream =
          upstreamResult.exitCode === 0 ? upstreamResult.stdout.trim() || null : null;
        const aheadBehindResult = upstream
          ? await ctx.execCommand(
              session,
              `${git} rev-list --left-right --count HEAD...'@{upstream}'`
            )
          : null;
        const { ahead, behind } =
          aheadBehindResult?.exitCode === 0
            ? parseAheadBehind(aheadBehindResult.stdout)
            : { ahead: 0, behind: 0 };
        const parsedStatus = parseGitStatusPorcelain(
          statusResult.stdout,
          MAX_CHANGED_FILES,
          Buffer.byteLength(statusResult.stdout, 'utf8') > MAX_STATUS_BYTES
        );

        const status: GitRepositoryStatus = {
          rootPath: rootResult.stdout.trim(),
          bare,
          branch: branch || lastCommit?.shortHash || 'HEAD',
          detached: branch.length === 0,
          upstream,
          ahead,
          behind,
          clean: parsedStatus.files.length === 0 && !parsedStatus.truncated,
          changedFiles: parsedStatus.files,
          changedFilesTruncated: parsedStatus.truncated,
          lastCommit,
        };

        return { success: true, status };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load Git status';
        logger.error('Failed to load project Git status', error, {
          projectId,
          hostId: project.host_id,
        });
        return { success: false, error: message };
      }
    }
  );

  safeHandle(
    'ssh:git:history',
    sshProjectIdSchema,
    async (_event, projectId): Promise<GitCommitHistoryResult> => {
      const project = await projectQueries.getById(projectId);
      if (!project) return { success: false, error: 'Project not found' };
      if (!project.host_id) return { success: false, error: 'Project has no SSH host' };

      try {
        const sessionId = await ctx.getOrCreateBackgroundSession(project.host_id);
        const session = ctx.activeSessions.get(sessionId);
        if (!session) return { success: false, error: 'SSH session is not available' };

        const git = `git -C ${shellQuotePath(project.repository_path)}`;
        const repositoryResult = await ctx.execCommand(session, `${git} rev-parse --git-dir`);
        if (repositoryResult.exitCode !== 0) {
          return {
            success: false,
            error: getCommandError(
              repositoryResult.stderr,
              'Repository path is not a Git repository'
            ),
          };
        }

        const headResult = await ctx.execCommand(session, `${git} rev-parse --verify HEAD`);
        if (headResult.exitCode !== 0) {
          return { success: true, commits: [], truncated: false };
        }

        const historyResult = await ctx.execCommand(
          session,
          buildGitCommitHistoryCommand(project.repository_path)
        );
        if (historyResult.exitCode !== 0 || historyResult.stderr.trim()) {
          return {
            success: false,
            error: getCommandError(historyResult.stderr, 'Could not load Git history'),
          };
        }

        return {
          success: true,
          ...parseGitCommitHistory(
            historyResult.stdout,
            Buffer.byteLength(historyResult.stdout, 'utf8') > MAX_GIT_HISTORY_BYTES
          ),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load Git history';
        logger.error('Failed to load project Git history', error, {
          projectId,
          hostId: project.host_id,
        });
        return { success: false, error: message };
      }
    }
  );

  safeHandle(
    'ssh:git:commit-details',
    sshGitCommitDetailsSchema,
    async (_event, request): Promise<GitCommitDetailsResult> => {
      const project = await projectQueries.getById(request.projectId);
      if (!project) return { success: false, error: 'Project not found' };
      if (!project.host_id) return { success: false, error: 'Project has no SSH host' };

      try {
        const sessionId = await ctx.getOrCreateBackgroundSession(project.host_id);
        const session = ctx.activeSessions.get(sessionId);
        if (!session) return { success: false, error: 'SSH session is not available' };

        const validationResult = await ctx.execCommand(
          session,
          buildGitCommitValidationCommand(project.repository_path, request.commitHash)
        );
        if (validationResult.exitCode !== 0) {
          return {
            success: false,
            error: getCommandError(validationResult.stderr, 'Commit does not exist'),
          };
        }

        const [summaryResult, diffResult] = await Promise.all([
          ctx.execCommand(
            session,
            buildGitCommitSummaryCommand(project.repository_path, request.commitHash)
          ),
          ctx.execCommand(
            session,
            buildGitCommitDiffCommand(project.repository_path, request.commitHash)
          ),
        ]);
        if (summaryResult.stderr.trim() || diffResult.stderr.trim()) {
          return {
            success: false,
            error: getCommandError(
              summaryResult.stderr || diffResult.stderr,
              'Could not load commit details'
            ),
          };
        }

        const commit = parseGitCommitSummary(summaryResult.stdout);
        if (!commit) return { success: false, error: 'Could not parse commit details' };

        const diff = truncateGitCommitDiff(diffResult.stdout);
        return {
          success: true,
          details: {
            commit,
            diff: diff.content,
            truncated: diff.truncated,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load commit details';
        logger.error('Failed to load project Git commit details', error, {
          projectId: request.projectId,
          commitHash: request.commitHash,
        });
        return { success: false, error: message };
      }
    }
  );

  safeHandle(
    'ssh:git:diff',
    sshGitDiffSchema,
    async (_event, request): Promise<GitFileDiffResult> => {
      const project = await projectQueries.getById(request.projectId);
      if (!project) return { success: false, error: 'Project not found' };
      if (!project.host_id) return { success: false, error: 'Project has no SSH host' };
      if (!isSafeRepositoryRelativePath(request.path)) {
        return { success: false, error: 'Invalid repository path' };
      }

      try {
        const sessionId = await ctx.getOrCreateBackgroundSession(project.host_id);
        const session = ctx.activeSessions.get(sessionId);
        if (!session) return { success: false, error: 'SSH session is not available' };

        const workingTreeError = await requireWorkingTree(
          ctx,
          session,
          project.repository_path
        );
        if (workingTreeError) return { success: false, error: workingTreeError };

        const pathStatusResult = await ctx.execCommand(
          session,
          buildGitStatusForPathCommand(project.repository_path, request.path)
        );
        if (pathStatusResult.exitCode !== 0 || pathStatusResult.stderr.trim()) {
          return {
            success: false,
            error: getCommandError(pathStatusResult.stderr, 'Could not verify changed file'),
          };
        }

        const changedFile = parseGitStatusPorcelain(pathStatusResult.stdout, 2).files.find(
          (file) => file.path === request.path
        );
        if (!changedFile) {
          return { success: false, error: 'File is not part of the current Git changes' };
        }
        if (request.scope === 'staged' && !changedFile.staged) {
          return { success: false, error: 'File has no staged changes' };
        }
        if (request.scope === 'unstaged' && !changedFile.unstaged) {
          return { success: false, error: 'File has no unstaged changes' };
        }

        const diffResult = await ctx.execCommand(
          session,
          buildGitDiffCommand(
            project.repository_path,
            request.path,
            request.scope,
            changedFile.untracked
          )
        );
        if (diffResult.stderr.trim()) {
          return {
            success: false,
            error: getCommandError(diffResult.stderr, 'Could not read Git diff'),
          };
        }

        const diff = truncateGitDiff(diffResult.stdout);
        return {
          success: true,
          diff: {
            path: request.path,
            scope: request.scope,
            content: diff.content,
            truncated: diff.truncated,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not read Git diff';
        logger.error('Failed to read project Git diff', error, {
          projectId: request.projectId,
          path: request.path,
          scope: request.scope,
        });
        return { success: false, error: message };
      }
    }
  );

  const runFileAction = async (
    request: GitFileActionRequest,
    action: 'stage' | 'unstage'
  ): Promise<GitWorkingTreeActionResult> => {
    const project = await projectQueries.getById(request.projectId);
    if (!project) return { success: false, error: 'Project not found' };
    if (!project.host_id) return { success: false, error: 'Project has no SSH host' };
    if (!isSafeRepositoryRelativePath(request.path)) {
      return { success: false, error: 'Invalid repository path' };
    }

    try {
      const sessionId = await ctx.getOrCreateBackgroundSession(project.host_id);
      const session = ctx.activeSessions.get(sessionId);
      if (!session) return { success: false, error: 'SSH session is not available' };

      const workingTreeError = await requireWorkingTree(ctx, session, project.repository_path);
      if (workingTreeError) return { success: false, error: workingTreeError };

      const pathStatusResult = await ctx.execCommand(
        session,
        buildGitStatusForPathCommand(project.repository_path, request.path)
      );
      if (pathStatusResult.exitCode !== 0 || pathStatusResult.stderr.trim()) {
        return {
          success: false,
          error: getCommandError(pathStatusResult.stderr, 'Could not verify changed file'),
        };
      }

      const changedFile = parseGitStatusPorcelain(pathStatusResult.stdout, 2).files.find(
        (file) => file.path === request.path
      );
      if (!changedFile) {
        return { success: false, error: 'File is not part of the current Git changes' };
      }
      if (action === 'stage' && !changedFile.unstaged) {
        return { success: false, error: 'File has no unstaged changes' };
      }
      if (action === 'unstage' && !changedFile.staged) {
        return { success: false, error: 'File has no staged changes' };
      }

      const paths = [changedFile.path, changedFile.originalPath].filter((path): path is string =>
        Boolean(path)
      );
      if (paths.some((path) => !isSafeRepositoryRelativePath(path))) {
        return { success: false, error: 'Invalid repository path' };
      }

      const command =
        action === 'stage'
          ? buildGitStageFilesCommand(project.repository_path, paths)
          : buildGitUnstageFilesCommand(project.repository_path, paths);
      const result = await ctx.execCommand(session, command);
      if (result.exitCode !== 0) {
        return {
          success: false,
          error: getCommandError(result.stderr, `Could not ${action} Git file`),
        };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not ${action} Git file`;
      logger.error('Failed to run project Git file action', error, {
        projectId: request.projectId,
        path: request.path,
        action,
      });
      return { success: false, error: message };
    }
  };

  safeHandle('ssh:git:stage-file', sshGitFileActionSchema, (_event, request) =>
    runFileAction(request, 'stage')
  );
  safeHandle('ssh:git:unstage-file', sshGitFileActionSchema, (_event, request) =>
    runFileAction(request, 'unstage')
  );

  safeHandle(
    'ssh:git:create-commit',
    sshGitCreateCommitSchema,
    async (_event, request: GitCreateCommitRequest): Promise<GitWorkingTreeActionResult> => {
      const project = await projectQueries.getById(request.projectId);
      if (!project) return { success: false, error: 'Project not found' };
      if (!project.host_id) return { success: false, error: 'Project has no SSH host' };

      try {
        const sessionId = await ctx.getOrCreateBackgroundSession(project.host_id);
        const session = ctx.activeSessions.get(sessionId);
        if (!session) return { success: false, error: 'SSH session is not available' };

        const workingTreeError = await requireWorkingTree(
          ctx,
          session,
          project.repository_path
        );
        if (workingTreeError) return { success: false, error: workingTreeError };

        const git = `git -C ${shellQuotePath(project.repository_path)}`;
        const statusResult = await ctx.execCommand(
          session,
          `${git} status --porcelain=v1 -z --untracked-files=all | head -c ${MAX_STATUS_BYTES + 1}`
        );
        if (statusResult.exitCode !== 0 || statusResult.stderr.trim()) {
          return {
            success: false,
            error: getCommandError(statusResult.stderr, 'Could not verify staged changes'),
          };
        }

        const status = parseGitStatusPorcelain(
          statusResult.stdout,
          MAX_CHANGED_FILES,
          Buffer.byteLength(statusResult.stdout, 'utf8') > MAX_STATUS_BYTES
        );
        if (status.truncated) {
          return {
            success: false,
            error: 'Git status is truncated; refusing to commit hidden staged changes',
          };
        }
        if (!status.files.some((file) => file.staged)) {
          return { success: false, error: 'There are no staged changes to commit' };
        }

        const result = await ctx.execCommand(
          session,
          buildGitCreateCommitCommand(project.repository_path, request.message),
          120000
        );
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: getCommandError(result.stderr, 'Could not create Git commit'),
          };
        }

        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not create Git commit';
        logger.error('Failed to create project Git commit', error, {
          projectId: request.projectId,
        });
        return { success: false, error: message };
      }
    }
  );

  safeHandle(
    'ssh:git:branches',
    sshProjectIdSchema,
    async (_event, projectId): Promise<GitBranchesResult> => {
      const project = await projectQueries.getById(projectId);
      if (!project) return { success: false, error: 'Project not found' };
      if (!project.host_id) return { success: false, error: 'Project has no SSH host' };

      try {
        const sessionId = await ctx.getOrCreateBackgroundSession(project.host_id);
        const session = ctx.activeSessions.get(sessionId);
        if (!session) return { success: false, error: 'SSH session is not available' };

        const result = await ctx.execCommand(
          session,
          buildGitBranchListCommand(project.repository_path)
        );
        if (result.exitCode !== 0 || result.stderr.trim()) {
          return {
            success: false,
            error: getCommandError(result.stderr, 'Could not load Git branches'),
          };
        }

        return { success: true, ...parseGitBranches(result.stdout) };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load Git branches';
        logger.error('Failed to load project Git branches', error, {
          projectId,
          hostId: project.host_id,
        });
        return { success: false, error: message };
      }
    }
  );

  safeHandle(
    'ssh:git:init',
    sshProjectIdSchema,
    async (_event, projectId): Promise<GitInitRepositoryResult> => {
      const project = await projectQueries.getById(projectId);
      if (!project) return { success: false, error: 'Project not found' };
      if (!project.host_id) return { success: false, error: 'Project has no SSH host' };

      try {
        const sessionId = await ctx.getOrCreateBackgroundSession(project.host_id);
        const session = ctx.activeSessions.get(sessionId);
        if (!session) return { success: false, error: 'SSH session is not available' };

        const result = await ctx.execCommand(
          session,
          buildGitInitRepositoryCommand(project.repository_path)
        );
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: getCommandError(result.stderr, 'Could not initialize Git repository'),
          };
        }

        return { success: true };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not initialize Git repository';
        logger.error('Failed to initialize project Git repository', error, {
          projectId,
          hostId: project.host_id,
        });
        return { success: false, error: message };
      }
    }
  );

  const runBranchAction = async (
    request: GitBranchActionRequest,
    action: 'create' | 'switch' | 'delete'
  ): Promise<GitBranchActionResult> => {
    const project = await projectQueries.getById(request.projectId);
    if (!project) return { success: false, error: 'Project not found' };
    if (!project.host_id) return { success: false, error: 'Project has no SSH host' };
    if (!isSafeBranchName(request.branch)) {
      return { success: false, error: 'Invalid branch name' };
    }

    try {
      const sessionId = await ctx.getOrCreateBackgroundSession(project.host_id);
      const session = ctx.activeSessions.get(sessionId);
      if (!session) return { success: false, error: 'SSH session is not available' };

      const validationResult = await ctx.execCommand(
        session,
        buildGitBranchNameValidationCommand(project.repository_path, request.branch)
      );
      if (validationResult.exitCode !== 0) {
        return {
          success: false,
          error: getCommandError(validationResult.stderr, 'Invalid branch name'),
        };
      }

      if (action === 'switch') {
        const workingTreeError = await requireWorkingTree(
          ctx,
          session,
          project.repository_path
        );
        if (workingTreeError) return { success: false, error: workingTreeError };

        const git = `git -C ${shellQuotePath(project.repository_path)}`;
        const statusResult = await ctx.execCommand(
          session,
          `${git} status --porcelain=v1 -z --untracked-files=all | head -c 1`
        );
        if (statusResult.exitCode !== 0 || statusResult.stderr.trim()) {
          return {
            success: false,
            error: getCommandError(statusResult.stderr, 'Could not verify working tree'),
          };
        }
        if (statusResult.stdout.length > 0) {
          return {
            success: false,
            error: 'Working tree must be clean before switching branches',
          };
        }
      }

      const command =
        action === 'create'
          ? buildGitCreateBranchCommand(project.repository_path, request.branch)
          : action === 'switch'
            ? buildGitSwitchBranchCommand(project.repository_path, request.branch)
            : buildGitDeleteBranchCommand(project.repository_path, request.branch);
      const result = await ctx.execCommand(session, command);
      if (result.exitCode !== 0) {
        return {
          success: false,
          error: getCommandError(result.stderr, `Could not ${action} Git branch`),
        };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not ${action} Git branch`;
      logger.error('Failed to run project Git branch action', error, {
        projectId: request.projectId,
        branch: request.branch,
        action,
      });
      return { success: false, error: message };
    }
  };

  safeHandle('ssh:git:create-branch', sshGitBranchActionSchema, (_event, request) =>
    runBranchAction(request, 'create')
  );
  safeHandle('ssh:git:switch-branch', sshGitBranchActionSchema, (_event, request) =>
    runBranchAction(request, 'switch')
  );
  safeHandle('ssh:git:delete-branch', sshGitBranchActionSchema, (_event, request) =>
    runBranchAction(request, 'delete')
  );
}
