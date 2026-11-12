import React from 'react';
import { AlertCircle, History, Loader2 } from 'lucide-react';
import { Button, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { useProjectGitCommitDetails, useProjectGitHistory } from './useProjectQueries';
import { DiffViewer } from './ProjectChangesTab';

interface RepositoryHistoryProps {
  historyQuery: ReturnType<typeof useProjectGitHistory>;
  detailsQuery: ReturnType<typeof useProjectGitCommitDetails>;
  selectedCommitHash: string | null;
  onSelectCommit: (hash: string) => void;
}

export const RepositoryHistory: React.FC<RepositoryHistoryProps> = ({
  historyQuery,
  detailsQuery,
  selectedCommitHash,
  onSelectCommit,
}) => {
  const { t, i18n } = useTranslation();

  if (historyQuery.isLoading) {
    return (
      <div
        id="repository-panel-history"
        role="region"
        aria-labelledby="repository-tab-history"
        className="flex min-h-72 items-center justify-center gap-2 px-5 py-12 text-sm text-muted-foreground"
      >
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        {t('projects.loadingHistory')}
      </div>
    );
  }

  if (historyQuery.isError) {
    return (
      <div
        id="repository-panel-history"
        role="region"
        aria-labelledby="repository-tab-history"
        className="flex min-h-72 flex-col items-center justify-center px-5 py-12 text-center"
      >
        <AlertCircle aria-hidden className="mb-3 h-8 w-8 text-destructive" />
        <p className="font-medium text-foreground">{t('projects.historyLoadFailed')}</p>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{historyQuery.error.message}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => void historyQuery.refetch()}
        >
          {t('projects.retry')}
        </Button>
      </div>
    );
  }

  if (!historyQuery.data?.commits.length) {
    return (
      <div
        id="repository-panel-history"
        role="region"
        aria-labelledby="repository-tab-history"
        className="flex min-h-72 flex-col items-center justify-center px-5 py-12 text-center"
      >
        <History aria-hidden className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{t('projects.noCommitHistory')}</p>
      </div>
    );
  }

  const commitDetails = detailsQuery.data;

  return (
    <div
      id="repository-panel-history"
      role="region"
      aria-labelledby="repository-tab-history"
      className="grid min-h-[32rem] overflow-hidden lg:h-[36rem] lg:grid-cols-[22rem_minmax(0,1fr)]"
    >
      <section className="flex min-h-0 flex-col overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">
            {t('projects.commitHistoryCount', { count: historyQuery.data.commits.length })}
            {historyQuery.data.truncated ? '+' : ''}
          </h3>
        </div>
        <div className="max-h-80 min-h-0 flex-1 space-y-1 overflow-y-auto p-2 lg:max-h-none">
          {historyQuery.data.commits.map((commit) => {
            const selected = commit.hash === selectedCommitHash;
            return (
              <button
                key={commit.hash}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectCommit(commit.hash)}
                className={cn(
                  'w-full rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  selected
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-transparent hover:border-border hover:bg-secondary/40'
                )}
              >
                <p className="truncate text-sm font-medium text-foreground">{commit.subject}</p>
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="shrink-0 font-mono text-primary" translate="no">
                    {commit.shortHash}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{commit.author}</span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatCommitDate(commit.authoredAt, i18n.language)}
                </p>
              </button>
            );
          })}
          {historyQuery.data.truncated && (
            <p className="px-2 py-2 text-xs text-warning">{t('projects.historyTruncated')}</p>
          )}
        </div>
      </section>

      <section className="min-h-0 min-w-0 overflow-hidden bg-background/30 p-4">
        {selectedCommitHash ? (
          <div className="flex h-full min-h-0 flex-col">
            {detailsQuery.isLoading || detailsQuery.isFetching ? (
              <div className="flex h-full min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                {t('projects.loadingCommitDetails')}
              </div>
            ) : detailsQuery.isError ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                <AlertCircle aria-hidden className="mb-2 h-6 w-6 text-destructive" />
                <p className="text-sm font-medium text-foreground">
                  {t('projects.commitDetailsLoadFailed')}
                </p>
                <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                  {detailsQuery.error.message}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => void detailsQuery.refetch()}
                >
                  {t('projects.retry')}
                </Button>
              </div>
            ) : commitDetails ? (
              <>
                <div className="mb-3 shrink-0 border-b border-border pb-3">
                  <h3 className="text-sm font-medium text-foreground">
                    {commitDetails.commit.subject}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-mono text-primary" translate="no">
                      {commitDetails.commit.shortHash}
                    </span>{' '}
                    · {commitDetails.commit.author} ·{' '}
                    {formatCommitDate(commitDetails.commit.authoredAt, i18n.language)}
                  </p>
                </div>
                <div className="min-h-72 flex-1 overflow-hidden rounded-md border border-border bg-background lg:min-h-0">
                  {commitDetails.diff ? (
                    <DiffViewer content={commitDetails.diff} />
                  ) : (
                    <p className="p-5 text-sm text-muted-foreground">
                      {t('projects.noCommitDiff')}
                    </p>
                  )}
                </div>
                {commitDetails.truncated && (
                  <p className="mt-2 shrink-0 text-xs text-warning">
                    {t('projects.commitDiffTruncated')}
                  </p>
                )}
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-secondary/40">
              <History aria-hidden className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">{t('projects.selectCommit')}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {t('projects.selectCommitHint')}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

function formatCommitDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
