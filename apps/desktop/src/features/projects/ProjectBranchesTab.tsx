import React from 'react';
import type { GitBranchInfo, GitRepositoryStatus } from '@ownshell/core';
import { ArrowDown, ArrowUp, Cloud, GitBranch, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button, FormInput, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { isValidGitBranchName } from '../../../electron/projects/git-ref-name';
import { useProjectGitBranchActions, useProjectGitBranches } from './useProjectQueries';
import { formatAbsoluteDate, formatRelativeDate } from './gitFormat';

interface RepositoryBranchesProps {
  gitStatus: GitRepositoryStatus;
  query: ReturnType<typeof useProjectGitBranches>;
  actions: ReturnType<typeof useProjectGitBranchActions>;
  newBranch: string;
  branchActionPending: boolean;
  onNewBranchChange: (branch: string) => void;
  onCreateBranch: (event: React.FormEvent) => void;
  onDeleteBranch: (branch: GitBranchInfo) => void;
  onCheckoutRemoteBranch: (branch: GitBranchInfo) => void;
  onBranchSwitched: () => void;
}

export const RepositoryBranches: React.FC<RepositoryBranchesProps> = ({
  gitStatus,
  query,
  actions,
  newBranch,
  branchActionPending,
  onNewBranchChange,
  onCreateBranch,
  onDeleteBranch,
  onCheckoutRemoteBranch,
  onBranchSwitched,
}) => {
  const { t, i18n } = useTranslation();
  const trimmedBranch = newBranch.trim();
  const branchNameInvalid = trimmedBranch.length > 0 && !isValidGitBranchName(trimmedBranch);
  const branches = query.data?.branches ?? [];
  const localBranches = branches.filter((branch) => !branch.remote);
  const remoteBranches = branches.filter((branch) => branch.remote);
  const localNames = new Set(localBranches.map((branch) => branch.name));

  const lastCommit = (branch: GitBranchInfo) =>
    branch.lastCommitSubject || branch.lastCommitDate ? (
      <p className="mt-0.5 flex min-w-0 gap-1.5 text-[11px] text-muted-foreground">
        <span className="truncate">{branch.lastCommitSubject}</span>
        {branch.lastCommitDate && (
          <time
            className="shrink-0"
            dateTime={branch.lastCommitDate}
            title={formatAbsoluteDate(branch.lastCommitDate, i18n.language)}
          >
            · {formatRelativeDate(branch.lastCommitDate, i18n.language)}
          </time>
        )}
      </p>
    ) : null;

  return (
    <div
      id="repository-panel-branches"
      role="region"
      aria-labelledby="repository-tab-branches"
      className="h-full overflow-y-auto px-4 py-4"
    >
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">{t('projects.localBranches')}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(
            gitStatus.bare ? 'projects.bareBranchManagementHint' : 'projects.branchManagementHint'
          )}
        </p>
      </div>

      <form onSubmit={onCreateBranch} className="mb-1 flex max-w-xl gap-2">
        <FormInput
          name="branch"
          autoComplete="off"
          spellCheck={false}
          value={newBranch}
          onChange={(event) => onNewBranchChange(event.target.value)}
          placeholder={t('projects.newBranchPlaceholder')}
          aria-label={t('projects.newBranch')}
          maxLength={255}
          disabled={branchActionPending}
          aria-invalid={branchNameInvalid}
          aria-describedby="branch-name-hint"
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="h-10 shrink-0"
          disabled={!trimmedBranch || branchNameInvalid || branchActionPending}
        >
          {actions.createBranch.isPending ? (
            <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Plus aria-hidden className="mr-1.5 h-4 w-4" />
          )}
          {t('projects.createBranch')}
        </Button>
      </form>
      <p
        id="branch-name-hint"
        className={cn('mb-4 text-[11px]', branchNameInvalid ? 'text-destructive' : 'invisible')}
      >
        {t('projects.branchNameInvalid')}
      </p>

      {query.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          {t('projects.loadingBranches')}
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">{t('projects.branchesLoadFailed')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{query.error.message}</p>
        </div>
      ) : localBranches.length ? (
        <div className="max-w-4xl space-y-1">
          {localBranches.map((branch) => (
            <div
              key={branch.name}
              className={cn(
                'flex items-center gap-3 rounded-md border px-3 py-2',
                branch.current
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-transparent bg-secondary/30'
              )}
            >
              <GitBranch
                aria-hidden
                className={cn(
                  'h-4 w-4 shrink-0',
                  branch.current ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <div className="min-w-0 flex-1" translate="no">
                <p className="truncate font-mono text-xs text-foreground">{branch.name}</p>
                {branch.upstream && (
                  <p className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                    <span className="truncate">{branch.upstream}</span>
                    {branch.upstreamGone ? (
                      <span className="shrink-0 font-sans text-warning">{t('projects.upstreamGone')}</span>
                    ) : (
                      <>
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5 tabular-nums"
                          title={t('projects.ahead', { count: branch.ahead })}
                        >
                          <ArrowUp aria-hidden className="h-3 w-3 text-primary" />
                          {branch.ahead}
                        </span>
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5 tabular-nums"
                          title={t('projects.behind', { count: branch.behind })}
                        >
                          <ArrowDown aria-hidden className="h-3 w-3 text-warning" />
                          {branch.behind}
                        </span>
                      </>
                    )}
                  </p>
                )}
                {lastCommit(branch)}
              </div>
              {branch.current ? (
                <span className="rounded bg-primary/15 px-2 py-1 text-[10px] font-medium text-primary">
                  {t(gitStatus.bare ? 'projects.defaultBranchBadge' : 'projects.currentBranch')}
                </span>
              ) : (
                <>
                  {!gitStatus.bare && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!gitStatus.clean || branchActionPending}
                      title={!gitStatus.clean ? t('projects.switchRequiresClean') : ''}
                      onClick={() =>
                        actions.switchBranch.mutate(branch.name, {
                          onSuccess: onBranchSwitched,
                        })
                      }
                    >
                      {actions.switchBranch.isPending &&
                      actions.switchBranch.variables === branch.name ? (
                        <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : null}
                      {t('projects.switchBranch')}
                    </Button>
                  )}
                  <button
                    type="button"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50"
                    aria-label={t('projects.deleteBranch', { name: branch.name })}
                    title={t('projects.deleteBranch', { name: branch.name })}
                    disabled={branchActionPending}
                    onClick={() => onDeleteBranch(branch)}
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('projects.noBranches')}</p>
      )}

      {remoteBranches.length > 0 && (
        <>
          <div className="mb-3 mt-6">
            <h3 className="text-sm font-medium text-foreground">{t('projects.remoteBranches')}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('projects.remoteBranchesHint')}</p>
          </div>
          <div className="max-w-4xl space-y-1">
            {remoteBranches.map((branch) => {
              const localName = branch.name.slice(branch.name.indexOf('/') + 1);
              const hasLocal = localNames.has(localName);
              return (
                <div
                  key={branch.name}
                  className="flex items-center gap-3 rounded-md bg-secondary/30 px-3 py-2"
                >
                  <Cloud aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1" translate="no">
                    <p className="truncate font-mono text-xs text-foreground">{branch.name}</p>
                    {lastCommit(branch)}
                  </div>
                  {!gitStatus.bare && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={hasLocal || !gitStatus.clean || branchActionPending}
                      title={
                        hasLocal
                          ? t('projects.remoteBranchHasLocal', { name: localName })
                          : !gitStatus.clean
                            ? t('projects.switchRequiresClean')
                            : ''
                      }
                      onClick={() => onCheckoutRemoteBranch(branch)}
                    >
                      {actions.checkoutRemoteBranch.isPending &&
                      actions.checkoutRemoteBranch.variables === branch.name ? (
                        <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : null}
                      {t('projects.checkoutRemoteBranch')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {query.data?.truncated && (
        <p className="px-2 py-2 text-xs text-muted-foreground">{t('projects.branchesTruncated')}</p>
      )}
    </div>
  );
};
