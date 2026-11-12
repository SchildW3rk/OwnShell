import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GitBranchInfo } from '@ownshell/core';
import {
  AlertCircle,
  CheckCircle2,
  Container,
  FileCode2,
  Files,
  FolderGit2,
  FolderPlus,
  GitBranch,
  History,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Server,
} from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, PageHeader, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { queryKeys } from '../../lib/queryClient';
import { useHostStore } from '../../stores/useHostStore';
import {
  ProjectGitStatusError,
  type GitDiffSelection,
  useInitProjectGitRepository,
  useProject,
  useProjectGitBranchActions,
  useProjectGitBranches,
  useProjectGitCommitDetails,
  useProjectGitDiff,
  useProjectGitHistory,
  useProjectGitStatus,
  useProjectGitWorkingTreeActions,
} from './useProjectQueries';
import { ProjectCodeBrowser } from './ProjectCodeBrowser';
import { buildProjectGitCommands } from './repositoryCommands';
import { RepositoryAccessPanel, RepositoryOverview } from './ProjectOverviewTab';
import { RepositoryHistory } from './ProjectHistoryTab';
import { RepositoryChanges } from './ProjectChangesTab';
import { RepositoryBranches } from './ProjectBranchesTab';

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
  const [initRepositoryOpen, setInitRepositoryOpen] = React.useState(false);
  const [copiedCommand, setCopiedCommand] = React.useState<'clone' | 'remote' | null>(null);
  const projectQuery = useProject(projectId);
  const gitStatusQuery = useProjectGitStatus(projectId);
  const gitDiffQuery = useProjectGitDiff(projectId, diffSelection);
  const gitHistoryQuery = useProjectGitHistory(
    projectId,
    repositorySection === 'history' && Boolean(gitStatusQuery.data)
  );
  const gitCommitDetailsQuery = useProjectGitCommitDetails(
    projectId,
    repositorySection === 'history' ? selectedCommitHash : null
  );
  const gitBranchesQuery = useProjectGitBranches(
    projectId,
    repositorySection === 'branches' && Boolean(gitStatusQuery.data)
  );
  const branchActions = useProjectGitBranchActions(projectId);
  const workingTreeActions = useProjectGitWorkingTreeActions(projectId);
  const initRepository = useInitProjectGitRepository(projectId);
  const host = useHostStore((state) =>
    state.hosts.find((item) => item.id === projectQuery.data?.host_id)
  );

  React.useEffect(() => {
    if (
      repositorySection === 'history' &&
      !selectedCommitHash &&
      gitHistoryQuery.data?.commits[0]
    ) {
      setSelectedCommitHash(gitHistoryQuery.data.commits[0].hash);
    }
  }, [gitHistoryQuery.data, repositorySection, selectedCommitHash]);

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
  const authoredAt = gitStatus?.lastCommit?.authoredAt
    ? new Date(gitStatus.lastCommit.authoredAt)
    : null;
  const formattedAuthoredAt =
    authoredAt && !Number.isNaN(authoredAt.getTime())
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(authoredAt)
      : null;
  const branchActionPending =
    branchActions.createBranch.isPending ||
    branchActions.switchBranch.isPending ||
    branchActions.deleteBranch.isPending;
  const workingTreeActionPending =
    workingTreeActions.stageFile.isPending ||
    workingTreeActions.unstageFile.isPending ||
    workingTreeActions.createCommit.isPending;
  const canInitializeRepository =
    gitStatusQuery.error instanceof ProjectGitStatusError &&
    gitStatusQuery.error.code === 'NOT_A_REPOSITORY';

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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <PageHeader
        icon={FolderGit2}
        title={project.name}
        subtitle={t('projects.projectSubtitle')}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              // Every per-project query key starts with byId(projectId); only active ones refetch.
              void queryClient.invalidateQueries({ queryKey: queryKeys.projects.byId(projectId) });
            }}
            disabled={
              gitStatusQuery.isFetching ||
              gitDiffQuery.isFetching ||
              gitHistoryQuery.isFetching ||
              gitCommitDetailsQuery.isFetching ||
              gitBranchesQuery.isFetching
            }
          >
            <RefreshCw
              className={cn(
                'mr-2 h-4 w-4',
                (gitStatusQuery.isFetching ||
                  gitDiffQuery.isFetching ||
                  gitHistoryQuery.isFetching ||
                  gitCommitDetailsQuery.isFetching ||
                  gitBranchesQuery.isFetching) &&
                  'animate-spin'
              )}
            />
            {t('projects.refresh')}
          </Button>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard
              icon={Server}
              label={t('projects.sshHost')}
              value={
                host ? `${host.label} · ${host.username}@${host.hostname}` : t('projects.noHost')
              }
            />
            <InfoCard
              icon={FileCode2}
              label={t('projects.repositoryPath')}
              value={project.repository_path}
              monospace
            />
            <InfoCard
              icon={Container}
              label={t('projects.composeProject')}
              value={project.compose_project || t('projects.notLinked')}
            />
          </div>

          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">{t('projects.repository')}</h2>
              </div>
              {gitStatus && (
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                    gitStatus.bare
                      ? 'bg-primary/15 text-primary'
                      : gitStatus.clean
                        ? 'bg-success/15 text-success'
                        : 'bg-warning/15 text-warning'
                  )}
                >
                  {gitStatus.bare ? (
                    <FolderGit2 className="h-3.5 w-3.5" />
                  ) : gitStatus.clean ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                  {gitStatus.bare
                    ? t('projects.bareRepository')
                    : gitStatus.clean
                      ? t('projects.clean')
                      : t('projects.changes')}
                </div>
              )}
            </div>

            {gitStatusQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('projects.loadingGit')}
              </div>
            ) : gitStatusQuery.isError ? (
              <div className="px-5 py-8 text-center">
                <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
                <p className="font-medium text-foreground">{t('projects.gitLoadFailed')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{gitStatusQuery.error.message}</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void gitStatusQuery.refetch()}
                  >
                    {t('projects.retry')}
                  </Button>
                  {canInitializeRepository && (
                    <Button variant="primary" size="sm" onClick={() => setInitRepositoryOpen(true)}>
                      <FolderPlus className="mr-1.5 h-4 w-4" />
                      {t('projects.initializeRepository')}
                    </Button>
                  )}
                </div>
              </div>
            ) : gitStatus ? (
              <>
                <RepositoryNavigation
                  activeSection={repositorySection}
                  changedFileCount={gitStatus.changedFiles.length}
                  changedFilesTruncated={gitStatus.changedFilesTruncated}
                  bare={gitStatus.bare}
                  onSectionChange={setRepositorySection}
                />
                {repositorySection === 'overview' && (
                  <>
                    <RepositoryOverview
                      gitStatus={gitStatus}
                      formattedAuthoredAt={formattedAuthoredAt}
                      onOpenCommit={(commit) => {
                        setSelectedCommitHash(commit.hash);
                        setRepositorySection('history');
                      }}
                    />
                    {repositoryCommands && (
                      <RepositoryAccessPanel
                        commands={repositoryCommands}
                        bare={gitStatus.bare}
                        copiedCommand={copiedCommand}
                        onCopy={copyRepositoryCommand}
                      />
                    )}
                  </>
                )}
                {repositorySection === 'code' && (
                  <ProjectCodeBrowser
                    key={projectId}
                    projectId={projectId}
                    active
                    hasHead={Boolean(gitStatus.lastCommit)}
                  />
                )}
                {repositorySection === 'changes' && !gitStatus.bare && (
                  <RepositoryChanges
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
                    historyQuery={gitHistoryQuery}
                    detailsQuery={gitCommitDetailsQuery}
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
                    onBranchSwitched={() => setDiffSelection(null)}
                  />
                )}
              </>
            ) : null}
          </section>
        </div>
      </div>

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
    <nav className="border-b border-border px-5" aria-label={t('projects.repositoryNavigation')}>
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
        '-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
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

interface InfoCardProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  monospace?: boolean;
}

const InfoCard = React.memo<InfoCardProps>(function InfoCard({
  icon: Icon,
  label,
  value,
  monospace,
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className={cn('truncate text-sm font-medium text-foreground', monospace && 'font-mono')}>
        {value}
      </p>
    </div>
  );
});

export default ProjectView;
