import React from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import type { GitBranchInfo } from '@ownshell/core';
import {
  AlertCircle,
  CheckCircle2,
  FileCode2,
  Files,
  FolderGit2,
  FolderPlus,
  GitBranch,
  History,
  LayoutDashboard,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { queryKeys } from '../../lib/queryClient';
import { useHostStore } from '../../stores/useHostStore';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import {
  ProjectGitStatusError,
  type GitDiffSelection,
  useInitProjectGitRepository,
  useProject,
  useProjectComposeStatus,
  useProjectGitBranchActions,
  useProjectGitBranches,
  useProjectGitDiff,
  useProjectGitStatus,
  useProjectGitWorkingTreeActions,
} from './useProjectQueries';
import { ProjectCodeBrowser } from './ProjectCodeBrowser';
import { buildProjectGitCommands } from './repositoryCommands';
import { RepositoryAccessPanel, RepositoryOverview } from './ProjectOverviewTab';
import { RepositoryHistory } from './ProjectHistoryTab';
import { RepositoryChanges } from './ProjectChangesTab';
import { RepositoryBranches } from './ProjectBranchesTab';
import { formatAbsoluteDate } from './gitFormat';

interface ProjectViewProps {
  projectId: string;
}

type RepositorySection = 'overview' | 'code' | 'changes' | 'history' | 'branches';

export const ProjectView: React.FC<ProjectViewProps> = ({ projectId }) => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [diffSelection, setDiffSelection] = React.useState<GitDiffSelection | null>(null);
  const [repositorySection, setRepositorySection] = React.useState<RepositorySection>('overview');
  const [selectedCommitHash, setSelectedCommitHash] = React.useState<string | null>(null);
  const [commitMessage, setCommitMessage] = React.useState('');
  const [newBranch, setNewBranch] = React.useState('');
  const [branchToDelete, setBranchToDelete] = React.useState<GitBranchInfo | null>(null);
  const [remoteBranchToCheckout, setRemoteBranchToCheckout] = React.useState<GitBranchInfo | null>(
    null
  );
  const [initRepositoryOpen, setInitRepositoryOpen] = React.useState(false);
  const [copiedCommand, setCopiedCommand] = React.useState<'clone' | 'remote' | null>(null);
  const projectQuery = useProject(projectId);
  const gitStatusQuery = useProjectGitStatus(projectId);
  const gitDiffQuery = useProjectGitDiff(projectId, diffSelection);
  const gitBranchesQuery = useProjectGitBranches(
    projectId,
    repositorySection === 'branches' && Boolean(gitStatusQuery.data)
  );
  const composeStatusQuery = useProjectComposeStatus(
    projectId,
    repositorySection === 'overview' && Boolean(projectQuery.data?.compose_project)
  );
  const branchActions = useProjectGitBranchActions(projectId);
  const workingTreeActions = useProjectGitWorkingTreeActions(projectId);
  const initRepository = useInitProjectGitRepository(projectId);
  const isFetching = useIsFetching({ queryKey: queryKeys.projects.byId(projectId) }) > 0;
  const host = useHostStore((state) =>
    state.hosts.find((item) => item.id === projectQuery.data?.host_id)
  );

  React.useEffect(() => {
    if (!gitStatusQuery.data?.bare) return;
    setDiffSelection(null);
    setRepositorySection((section) => (section === 'changes' ? 'overview' : section));
  }, [gitStatusQuery.data?.bare]);

  if (projectQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!projectQuery.data) {
    return (
      <EmptyState
        icon={FolderGit2}
        title={t('projects.notFound')}
        subtitle={t('projects.notFoundDescription')}
      />
    );
  }

  const project = projectQuery.data;
  const repositoryCommands = host ? buildProjectGitCommands(host, project) : null;
  const gitStatus = gitStatusQuery.data;
  const selectedFile = diffSelection
    ? gitStatus?.changedFiles.find((file) => file.path === diffSelection.path)
    : undefined;
  const formattedAuthoredAt = gitStatus?.lastCommit?.authoredAt
    ? formatAbsoluteDate(gitStatus.lastCommit.authoredAt, i18n.language)
    : null;
  const branchActionPending =
    branchActions.createBranch.isPending ||
    branchActions.switchBranch.isPending ||
    branchActions.deleteBranch.isPending ||
    branchActions.checkoutRemoteBranch.isPending;
  const workingTreeActionPending =
    workingTreeActions.stageFile.isPending ||
    workingTreeActions.unstageFile.isPending ||
    workingTreeActions.createCommit.isPending;
  const canInitializeRepository =
    gitStatusQuery.error instanceof ProjectGitStatusError &&
    gitStatusQuery.error.code === 'NOT_A_REPOSITORY';
  const context = [
    host ? `${host.label} (${host.username}@${host.hostname})` : t('projects.noHost'),
    project.repository_path,
    project.compose_project,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleCreateBranch = (event: React.FormEvent) => {
    event.preventDefault();
    const branch = newBranch.trim();
    if (!branch) return;
    branchActions.createBranch.mutate(branch, {
      onSuccess: () => setNewBranch(''),
    });
  };

  const handleCreateCommit = (event: React.FormEvent) => {
    event.preventDefault();
    const message = commitMessage.trim();
    if (!message) return;
    workingTreeActions.createCommit.mutate(message, {
      onSuccess: () => {
        setCommitMessage('');
        setDiffSelection(null);
      },
    });
  };

  const copyRepositoryCommand = async (kind: 'clone' | 'remote', command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(kind);
      window.setTimeout(
        () => setCopiedCommand((current) => (current === kind ? null : current)),
        1800
      );
    } catch {
      toast.error(t('projects.repositoryCommandCopyFailed'));
    }
  };

  // Docker lives in the SSH session's feature tabs: reuse an open terminal pane for the host,
  // otherwise open a new one, and switch it to Docker.
  const openDocker = host
    ? () => {
        const { sessions, createSession, setSessionFeatureTab } = useTerminalStore.getState();
        const { panes, addPane, setActivePane } = useWorkspaceStore.getState();
        const pane = panes.find(
          (item) =>
            item.type === 'terminal' &&
            sessions.some(
              (session) =>
                session.id === item.contentId &&
                session.kind === 'ssh' &&
                session.host?.id === host.id &&
                session.state !== 'error'
            )
        );
        if (pane) {
          setSessionFeatureTab(pane.contentId, 'docker');
          setActivePane(pane.id);
          return;
        }
        const sessionId = createSession(host);
        setSessionFeatureTab(sessionId, 'docker');
        addPane({
          type: 'terminal',
          contentId: sessionId,
          title: host.label || `${host.username}@${host.hostname}`,
        });
      }
    : null;

  const changedCount = gitStatus?.changedFiles.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <FolderGit2 aria-hidden className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h1 className="shrink-0 truncate text-sm font-semibold text-foreground">{project.name}</h1>
          <p className="min-w-0 truncate text-xs text-muted-foreground" title={context} translate="no">
            {context}
          </p>
        </div>
        {gitStatus && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
              gitStatus.bare
                ? 'bg-primary/15 text-primary'
                : gitStatus.clean
                  ? 'bg-success/15 text-success'
                  : 'bg-warning/15 text-warning'
            )}
          >
            {gitStatus.bare ? (
              <FolderGit2 aria-hidden className="h-3.5 w-3.5" />
            ) : gitStatus.clean ? (
              <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle aria-hidden className="h-3.5 w-3.5" />
            )}
            {gitStatus.bare
              ? t('projects.bareRepository')
              : gitStatus.clean
                ? t('projects.clean')
                : t('projects.changeCount', {
                    count: changedCount,
                    suffix: gitStatus.changedFilesTruncated ? '+' : '',
                  })}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          aria-label={t('projects.refresh')}
          title={t('projects.refresh')}
          onClick={() => {
            // Every per-project query key starts with byId(projectId); only active ones refetch.
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects.byId(projectId) });
          }}
          disabled={isFetching}
        >
          <RefreshCw aria-hidden className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </Button>
      </header>

      {gitStatusQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          {t('projects.loadingGit')}
        </div>
      ) : gitStatusQuery.isError ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
          <AlertCircle aria-hidden className="mb-3 h-8 w-8 text-destructive" />
          <p className="font-medium text-foreground">{t('projects.gitLoadFailed')}</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{gitStatusQuery.error.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void gitStatusQuery.refetch()}>
              {t('projects.retry')}
            </Button>
            {canInitializeRepository && (
              <Button variant="primary" size="sm" onClick={() => setInitRepositoryOpen(true)}>
                <FolderPlus aria-hidden className="mr-1.5 h-4 w-4" />
                {t('projects.initializeRepository')}
              </Button>
            )}
          </div>
        </div>
      ) : gitStatus ? (
        <>
          <RepositoryNavigation
            activeSection={repositorySection}
            changedFileCount={changedCount}
            changedFilesTruncated={gitStatus.changedFilesTruncated}
            bare={gitStatus.bare}
            onSectionChange={setRepositorySection}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            {repositorySection === 'overview' && (
              <div className="h-full overflow-y-auto">
                <RepositoryOverview
                  gitStatus={gitStatus}
                  formattedAuthoredAt={formattedAuthoredAt}
                  composeProject={project.compose_project}
                  composeStatus={{
                    isLoading: composeStatusQuery.isLoading,
                    error: composeStatusQuery.error,
                    data: composeStatusQuery.data,
                  }}
                  onOpenCommit={(commit) => {
                    setSelectedCommitHash(commit.hash);
                    setRepositorySection('history');
                  }}
                  onOpenChanges={() => setRepositorySection('changes')}
                  onOpenDocker={openDocker}
                />
                {repositoryCommands && (
                  <RepositoryAccessPanel
                    commands={repositoryCommands}
                    bare={gitStatus.bare}
                    copiedCommand={copiedCommand}
                    onCopy={copyRepositoryCommand}
                  />
                )}
              </div>
            )}
            {repositorySection === 'code' && (
              <ProjectCodeBrowser
                key={projectId}
                projectId={projectId}
                hasHead={Boolean(gitStatus.lastCommit)}
                rootPath={gitStatus.rootPath}
                bare={gitStatus.bare}
              />
            )}
            {repositorySection === 'changes' && !gitStatus.bare && (
              <RepositoryChanges
                projectId={projectId}
                gitStatus={gitStatus}
                selection={diffSelection}
                selectedFile={selectedFile}
                diffQuery={gitDiffQuery}
                actions={workingTreeActions}
                commitMessage={commitMessage}
                actionPending={workingTreeActionPending}
                onSelectFile={(file) =>
                  setDiffSelection({
                    path: file.path,
                    scope: file.unstaged ? 'unstaged' : 'staged',
                  })
                }
                onScopeChange={(scope) =>
                  selectedFile && setDiffSelection({ path: selectedFile.path, scope })
                }
                onCommitMessageChange={setCommitMessage}
                onCreateCommit={handleCreateCommit}
                onStageFile={(file) =>
                  workingTreeActions.stageFile.mutate(file.path, {
                    onSuccess: () => {
                      if (diffSelection?.path === file.path) {
                        setDiffSelection({ path: file.path, scope: 'staged' });
                      }
                    },
                  })
                }
                onUnstageFile={(file) =>
                  workingTreeActions.unstageFile.mutate(file.path, {
                    onSuccess: () => {
                      if (diffSelection?.path === file.path) {
                        setDiffSelection({ path: file.path, scope: 'unstaged' });
                      }
                    },
                  })
                }
              />
            )}
            {repositorySection === 'history' && (
              <RepositoryHistory
                projectId={projectId}
                selectedCommitHash={selectedCommitHash}
                onSelectCommit={setSelectedCommitHash}
              />
            )}
            {repositorySection === 'branches' && (
              <RepositoryBranches
                gitStatus={gitStatus}
                query={gitBranchesQuery}
                actions={branchActions}
                newBranch={newBranch}
                branchActionPending={branchActionPending}
                onNewBranchChange={setNewBranch}
                onCreateBranch={handleCreateBranch}
                onDeleteBranch={setBranchToDelete}
                onCheckoutRemoteBranch={setRemoteBranchToCheckout}
                onBranchSwitched={() => setDiffSelection(null)}
              />
            )}
          </div>
        </>
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(branchToDelete)}
        title={t('projects.deleteBranchTitle')}
        message={t('projects.deleteBranchConfirm', { name: branchToDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isLoading={branchActions.deleteBranch.isPending}
        onConfirm={() => {
          if (!branchToDelete) return;
          branchActions.deleteBranch.mutate(branchToDelete.name, {
            onSuccess: () => setBranchToDelete(null),
          });
        }}
        onCancel={() => setBranchToDelete(null)}
      />
      <ConfirmDialog
        isOpen={Boolean(remoteBranchToCheckout)}
        title={t('projects.checkoutRemoteBranchTitle')}
        message={t('projects.checkoutRemoteBranchConfirm', {
          name: remoteBranchToCheckout?.name ?? '',
          local: remoteBranchToCheckout?.name.slice(remoteBranchToCheckout.name.indexOf('/') + 1) ?? '',
          path: project.repository_path,
        })}
        confirmLabel={t('projects.checkoutRemoteBranch')}
        cancelLabel={t('common.cancel')}
        isLoading={branchActions.checkoutRemoteBranch.isPending}
        onConfirm={() => {
          if (!remoteBranchToCheckout) return;
          branchActions.checkoutRemoteBranch.mutate(remoteBranchToCheckout.name, {
            onSuccess: () => {
              setRemoteBranchToCheckout(null);
              setDiffSelection(null);
            },
          });
        }}
        onCancel={() => setRemoteBranchToCheckout(null)}
      />
      <ConfirmDialog
        isOpen={initRepositoryOpen}
        title={t('projects.initializeRepositoryTitle')}
        message={t('projects.initializeRepositoryConfirm', {
          path: project.repository_path,
        })}
        confirmLabel={t('projects.initializeRepository')}
        cancelLabel={t('common.cancel')}
        isLoading={initRepository.isPending}
        onConfirm={() =>
          initRepository.mutate(undefined, {
            onSuccess: () => setInitRepositoryOpen(false),
          })
        }
        onCancel={() => setInitRepositoryOpen(false)}
      />
    </div>
  );
};

interface RepositoryNavigationProps {
  activeSection: RepositorySection;
  changedFileCount: number;
  changedFilesTruncated: boolean;
  bare: boolean;
  onSectionChange: (section: RepositorySection) => void;
}

const RepositoryNavigation: React.FC<RepositoryNavigationProps> = ({
  activeSection,
  changedFileCount,
  changedFilesTruncated,
  bare,
  onSectionChange,
}) => {
  const { t } = useTranslation();

  return (
    <nav
      className="shrink-0 border-b border-border bg-surface px-2"
      aria-label={t('projects.repositoryNavigation')}
    >
      <div className="flex min-w-0 gap-1 overflow-x-auto">
        <RepositoryTab
          section="overview"
          activeSection={activeSection}
          icon={LayoutDashboard}
          label={t('projects.repositoryOverview')}
          onSelect={onSectionChange}
        />
        {!bare && (
          <RepositoryTab
            section="changes"
            activeSection={activeSection}
            icon={Files}
            label={t('projects.repositoryChanges')}
            count={`${changedFileCount}${changedFilesTruncated ? '+' : ''}`}
            onSelect={onSectionChange}
          />
        )}
        <RepositoryTab
          section="code"
          activeSection={activeSection}
          icon={FileCode2}
          label={t('projects.repositoryCode')}
          onSelect={onSectionChange}
        />
        <RepositoryTab
          section="history"
          activeSection={activeSection}
          icon={History}
          label={t('projects.commitHistory')}
          onSelect={onSectionChange}
        />
        <RepositoryTab
          section="branches"
          activeSection={activeSection}
          icon={GitBranch}
          label={t('projects.manageBranches')}
          onSelect={onSectionChange}
        />
      </div>
    </nav>
  );
};

interface RepositoryTabProps {
  section: RepositorySection;
  activeSection: RepositorySection;
  icon: React.FC<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  count?: string;
  onSelect: (section: RepositorySection) => void;
}

const RepositoryTab: React.FC<RepositoryTabProps> = ({
  section,
  activeSection,
  icon: Icon,
  label,
  count,
  onSelect,
}) => {
  const active = section === activeSection;

  return (
    <button
      id={`repository-tab-${section}`}
      type="button"
      aria-pressed={active}
      aria-controls={`repository-panel-${section}`}
      onClick={() => onSelect(section)}
      className={cn(
        '-mb-px inline-flex h-9 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
      )}
    >
      <Icon aria-hidden className={cn('h-4 w-4', active && 'text-primary')} />
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] tabular-nums',
            active ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
};

export default ProjectView;
