import React from 'react';
import type { GitBranchInfo, GitRepositoryStatus } from '@ownshell/core';
import { GitBranch, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button, FormInput, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { useProjectGitBranchActions, useProjectGitBranches } from './useProjectQueries';

interface RepositoryBranchesProps {
  gitStatus: GitRepositoryStatus;
  query: ReturnType<typeof useProjectGitBranches>;
  actions: ReturnType<typeof useProjectGitBranchActions>;
  newBranch: string;
  branchActionPending: boolean;
  onNewBranchChange: (branch: string) => void;
  onCreateBranch: (event: React.FormEvent) => void;
  onDeleteBranch: (branch: GitBranchInfo) => void;
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
  onBranchSwitched,
}) => {
  const { t } = useTranslation();

  return (
    <div
      id="repository-panel-branches"
      role="region"
      aria-labelledby="repository-tab-branches"
      className="px-5 py-5"
    >
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">{t('projects.localBranches')}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(
            gitStatus.bare ? 'projects.bareBranchManagementHint' : 'projects.branchManagementHint'
          )}
        </p>
      </div>

      <form onSubmit={onCreateBranch} className="mb-4 flex max-w-xl gap-2">
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
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="h-10 shrink-0"
          disabled={!newBranch.trim() || branchActionPending}
        >
          {actions.createBranch.isPending ? (
            <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Plus aria-hidden className="mr-1.5 h-4 w-4" />
          )}
          {t('projects.createBranch')}
        </Button>
      </form>

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
      ) : query.data?.branches.length ? (
        <div className="max-h-[30rem] space-y-1 overflow-y-auto pr-1">
          {query.data.branches.map((branch) => (
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
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {branch.upstream}
                  </p>
                )}
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
          {query.data.truncated && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t('projects.branchesTruncated')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('projects.noBranches')}</p>
      )}
    </div>
  );
};
