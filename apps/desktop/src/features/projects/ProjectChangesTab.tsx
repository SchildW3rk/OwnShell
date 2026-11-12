import React from 'react';
import type { GitChangedFile, GitDiffFileStat, GitRepositoryStatus } from '@ownshell/core';
import { AlertCircle, CheckCircle2, FileCode2, GitCommitHorizontal, Loader2 } from 'lucide-react';
import { Button, FormInput, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import {
  type GitDiffSelection,
  useProjectGitDiff,
  useProjectGitNumstat,
  useProjectGitWorkingTreeActions,
} from './useProjectQueries';
import { DiffCounts, ProjectDiffView } from './ProjectDiffView';

interface RepositoryChangesProps {
  projectId: string;
  gitStatus: GitRepositoryStatus;
  selection: GitDiffSelection | null;
  selectedFile?: GitChangedFile;
  diffQuery: ReturnType<typeof useProjectGitDiff>;
  actions: ReturnType<typeof useProjectGitWorkingTreeActions>;
  commitMessage: string;
  actionPending: boolean;
  onSelectFile: (file: GitChangedFile) => void;
  onScopeChange: (scope: GitDiffSelection['scope']) => void;
  onCommitMessageChange: (message: string) => void;
  onCreateCommit: (event: React.FormEvent) => void;
  onStageFile: (file: GitChangedFile) => void;
  onUnstageFile: (file: GitChangedFile) => void;
}

export const RepositoryChanges: React.FC<RepositoryChangesProps> = ({
  projectId,
  gitStatus,
  selection,
  selectedFile,
  diffQuery,
  actions,
  commitMessage,
  actionPending,
  onSelectFile,
  onScopeChange,
  onCommitMessageChange,
  onCreateCommit,
  onStageFile,
  onUnstageFile,
}) => {
  const { t } = useTranslation();
  const stagedFileCount = gitStatus.changedFiles.filter((file) => file.staged).length;
  const numstatQuery = useProjectGitNumstat(projectId, gitStatus.changedFiles.length > 0);
  const statsFor = (file: GitChangedFile): GitDiffFileStat | undefined => {
    const find = (stats?: GitDiffFileStat[]) => stats?.find((stat) => stat.path === file.path);
    const staged = find(numstatQuery.data?.staged);
    const unstaged = find(numstatQuery.data?.unstaged);
    if (!staged || !unstaged) return staged ?? unstaged;
    if (staged.additions === null || unstaged.additions === null) {
      return { path: file.path, additions: null, deletions: null };
    }
    return {
      path: file.path,
      additions: staged.additions + unstaged.additions,
      deletions: (staged.deletions ?? 0) + (unstaged.deletions ?? 0),
    };
  };

  if (gitStatus.changedFiles.length === 0) {
    return (
      <div
        id="repository-panel-changes"
        role="region"
        aria-labelledby="repository-tab-changes"
        className="flex h-full flex-col items-center justify-center px-6 py-12 text-center"
      >
        <CheckCircle2 aria-hidden className="mb-3 h-8 w-8 text-success" />
        <p className="text-sm font-medium text-foreground">{t('projects.noChanges')}</p>
      </div>
    );
  }

  return (
    <div
      id="repository-panel-changes"
      role="region"
      aria-labelledby="repository-tab-changes"
      className="grid h-full min-h-0 grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)] overflow-hidden"
    >
      <section className="flex min-h-0 flex-col overflow-hidden border-r border-border">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">
            {t('projects.changedFiles', { count: gitStatus.changedFiles.length })}
            {gitStatus.changedFilesTruncated ? '+' : ''}
          </h3>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 font-mono text-xs">
          {gitStatus.changedFiles.map((file, index) => (
            <ChangedFileButton
              key={`${file.status}-${file.path}-${index}`}
              file={file}
              stat={statsFor(file)}
              selected={selection?.path === file.path}
              disabled={actionPending}
              stagePending={
                actions.stageFile.isPending && actions.stageFile.variables === file.path
              }
              unstagePending={
                actions.unstageFile.isPending && actions.unstageFile.variables === file.path
              }
              onSelect={() => onSelectFile(file)}
              onStage={() => onStageFile(file)}
              onUnstage={() => onUnstageFile(file)}
            />
          ))}
          {gitStatus.changedFilesTruncated && (
            <p className="px-2 py-2 font-sans text-muted-foreground">
              {t('projects.changedFilesTruncated')}
            </p>
          )}
        </div>
        <form className="shrink-0 border-t border-border p-3" onSubmit={onCreateCommit}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <GitCommitHorizontal aria-hidden className="h-4 w-4 text-muted-foreground" />
              {t('projects.createCommit')}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {t('projects.stagedFileCount', { count: stagedFileCount })}
            </span>
          </div>
          <div className="flex gap-2">
            <FormInput
              name="commit-message"
              value={commitMessage}
              onChange={(event) => onCommitMessageChange(event.target.value)}
              placeholder={t('projects.commitMessagePlaceholder')}
              aria-label={t('projects.commitMessage')}
              autoComplete="off"
              maxLength={500}
              disabled={actionPending || gitStatus.changedFilesTruncated}
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="h-10 shrink-0"
              disabled={
                actionPending ||
                stagedFileCount === 0 ||
                !commitMessage.trim() ||
                gitStatus.changedFilesTruncated
              }
            >
              {actions.createCommit.isPending && (
                <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {t('projects.commit')}
            </Button>
          </div>
          <p
            className={cn(
              'mt-1.5 text-[11px]',
              gitStatus.changedFilesTruncated ? 'text-warning' : 'text-muted-foreground'
            )}
          >
            {gitStatus.changedFilesTruncated
              ? t('projects.commitDisabledTruncated')
              : stagedFileCount === 0
                ? t('projects.stageFilesToCommit')
                : t('projects.commitOnlyStaged')}
          </p>
        </form>
      </section>

      <section className="min-h-0 min-w-0 overflow-hidden">
        {selection && selectedFile ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-foreground">{t('projects.fileDiff')}</h3>
                <p
                  className="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                  translate="no"
                  title={selectedFile.path}
                >
                  {selectedFile.path}
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-md bg-secondary/50 p-1">
                {selectedFile.unstaged && (
                  <DiffScopeButton
                    active={selection.scope === 'unstaged'}
                    onClick={() => onScopeChange('unstaged')}
                  >
                    {t('projects.unstaged')}
                  </DiffScopeButton>
                )}
                {selectedFile.staged && (
                  <DiffScopeButton
                    active={selection.scope === 'staged'}
                    onClick={() => onScopeChange('staged')}
                  >
                    {t('projects.staged')}
                  </DiffScopeButton>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {diffQuery.isLoading || diffQuery.isFetching ? (
                <div className="flex h-full items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  {t('projects.loadingDiff')}
                </div>
              ) : diffQuery.isError ? (
                <div className="flex h-full flex-col items-center justify-center p-5 text-center">
                  <AlertCircle aria-hidden className="mb-2 h-6 w-6 text-destructive" />
                  <p className="text-sm font-medium text-foreground">
                    {t('projects.diffLoadFailed')}
                  </p>
                  <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                    {diffQuery.error.message}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => void diffQuery.refetch()}
                  >
                    {t('projects.retry')}
                  </Button>
                </div>
              ) : (
                <ProjectDiffView
                  content={diffQuery.data?.content ?? ''}
                  truncated={diffQuery.data?.truncated ?? false}
                  emptyLabel={t('projects.noTextDiff')}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-secondary/40">
              <FileCode2 aria-hidden className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">{t('projects.selectFileForDiff')}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {t('projects.selectFileForDiffHint')}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

interface ChangedFileButtonProps {
  file: GitChangedFile;
  stat?: GitDiffFileStat;
  selected: boolean;
  disabled: boolean;
  stagePending: boolean;
  unstagePending: boolean;
  onSelect: () => void;
  onStage: () => void;
  onUnstage: () => void;
}

const ChangedFileButton = React.memo<ChangedFileButtonProps>(function ChangedFileButton({
  file,
  stat,
  selected,
  disabled,
  stagePending,
  unstagePending,
  onSelect,
  onStage,
  onUnstage,
}) {
  const { t } = useTranslation();

  return (
    <div
      title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}
      className={cn(
        'flex w-full items-center rounded border transition-colors',
        selected ? 'border-primary/50 bg-primary/10' : 'border-transparent hover:bg-secondary/50'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={t('projects.openDiff', { path: file.path })}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-start gap-2 rounded px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-60"
      >
        <span className="w-5 shrink-0 font-semibold text-warning">{file.status}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-foreground" translate="no">
            {file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}
          </span>
          <span className="mt-1 flex items-center gap-1 font-sans">
            {file.unstaged && (
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                {t('projects.unstaged')}
              </span>
            )}
            {file.staged && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {t('projects.staged')}
              </span>
            )}
            {stat && (
              <span className="ml-auto">
                <DiffCounts additions={stat.additions} deletions={stat.deletions} />
              </span>
            )}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 flex-col gap-1 pr-2 font-sans">
        {file.unstaged && (
          <button
            type="button"
            onClick={onStage}
            disabled={disabled}
            aria-label={t('projects.stageFile', { path: file.path })}
            className="inline-flex min-w-14 items-center justify-center rounded px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-success/10 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success disabled:opacity-50"
          >
            {stagePending ? (
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
            ) : (
              t('projects.stage')
            )}
          </button>
        )}
        {file.staged && (
          <button
            type="button"
            onClick={onUnstage}
            disabled={disabled}
            aria-label={t('projects.unstageFile', { path: file.path })}
            className="inline-flex min-w-14 items-center justify-center rounded px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-warning/10 hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning disabled:opacity-50"
          >
            {unstagePending ? (
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
            ) : (
              t('projects.unstage')
            )}
          </button>
        )}
      </div>
    </div>
  );
});

interface DiffScopeButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const DiffScopeButton: React.FC<DiffScopeButtonProps> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      active
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'
    )}
  >
    {children}
  </button>
);
