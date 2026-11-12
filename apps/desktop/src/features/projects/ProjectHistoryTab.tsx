import React from 'react';
import type { GitHistorySearchField } from '@ownshell/core';
import { AlertCircle, History, Loader2, Search, X } from 'lucide-react';
import { AppSelect, Button, FormInput, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import {
  type GitHistorySearch,
  useProjectGitCommitDetails,
  useProjectGitHistory,
} from './useProjectQueries';
import { ProjectDiffView } from './ProjectDiffView';
import { formatAbsoluteDate, formatRelativeDate } from './gitFormat';

interface RepositoryHistoryProps {
  projectId: string;
  selectedCommitHash: string | null;
  onSelectCommit: (hash: string) => void;
}

// Search runs server-side (git log --grep/--author, fixed-string, case-insensitive) so it
// covers the whole history, not just the pages that happen to be loaded.
export const RepositoryHistory: React.FC<RepositoryHistoryProps> = ({
  projectId,
  selectedCommitHash,
  onSelectCommit,
}) => {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = React.useState('');
  const [field, setField] = React.useState<GitHistorySearchField>('message');
  const [search, setSearch] = React.useState<GitHistorySearch>({ query: '', field: 'message' });
  const historyQuery = useProjectGitHistory(projectId, true, search);
  const detailsQuery = useProjectGitCommitDetails(projectId, selectedCommitHash);
  const commits = React.useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.commits) ?? [],
    [historyQuery.data]
  );

  React.useEffect(() => {
    if (!selectedCommitHash && commits[0]) onSelectCommit(commits[0].hash);
  }, [commits, onSelectCommit, selectedCommitHash]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearch({ query: draft.trim(), field });
  };

  const commitDetails = detailsQuery.data;

  return (
    <div
      id="repository-panel-history"
      role="region"
      aria-labelledby="repository-tab-history"
      className="grid h-full min-h-0 grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)] overflow-hidden"
    >
      <section className="flex min-h-0 flex-col overflow-hidden border-r border-border">
        <form onSubmit={submitSearch} className="flex shrink-0 gap-1.5 border-b border-border p-2">
          <div className="relative min-w-0 flex-1">
            <FormInput
              name="history-search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('projects.historySearchPlaceholder')}
              aria-label={t('projects.historySearch')}
              autoComplete="off"
              spellCheck={false}
              maxLength={200}
              className="h-8 pr-7 text-xs"
            />
            {(draft || search.query) && (
              <button
                type="button"
                aria-label={t('projects.historySearchClear')}
                onClick={() => {
                  setDraft('');
                  setSearch({ query: '', field });
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <AppSelect
            value={field}
            onChange={(value) => setField(value as GitHistorySearchField)}
            options={[
              { value: 'message', label: t('projects.historySearchMessage') },
              { value: 'author', label: t('projects.historySearchAuthor') },
            ]}
            className="w-28 shrink-0"
            triggerClassName="h-8 text-xs"
          />
          <Button type="submit" variant="secondary" size="sm" className="h-8 shrink-0 px-2" aria-label={t('projects.historySearch')}>
            <Search aria-hidden className="h-3.5 w-3.5" />
          </Button>
        </form>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {historyQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              {t('projects.loadingHistory')}
            </div>
          ) : historyQuery.isError ? (
            <div className="px-3 py-8 text-center">
              <AlertCircle aria-hidden className="mx-auto mb-2 h-6 w-6 text-destructive" />
              <p className="text-sm font-medium text-foreground">{t('projects.historyLoadFailed')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{historyQuery.error.message}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => void historyQuery.refetch()}>
                {t('projects.retry')}
              </Button>
            </div>
          ) : commits.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <History aria-hidden className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search.query ? t('projects.historyNoMatches') : t('projects.noCommitHistory')}
              </p>
            </div>
          ) : (
            <>
              {commits.map((commit) => {
                const selected = commit.hash === selectedCommitHash;
                return (
                  <button
                    key={commit.hash}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectCommit(commit.hash)}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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
                      <span aria-hidden>·</span>
                      <time
                        className="shrink-0"
                        dateTime={commit.authoredAt}
                        title={formatAbsoluteDate(commit.authoredAt, i18n.language)}
                      >
                        {formatRelativeDate(commit.authoredAt, i18n.language)}
                      </time>
                    </p>
                  </button>
                );
              })}
              {historyQuery.hasNextPage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  disabled={historyQuery.isFetchingNextPage}
                  onClick={() => void historyQuery.fetchNextPage()}
                >
                  {historyQuery.isFetchingNextPage && (
                    <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  {t('projects.historyLoadMore')}
                </Button>
              )}
            </>
          )}
        </div>
      </section>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {!selectedCommitHash ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <History aria-hidden className="mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{t('projects.selectCommit')}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t('projects.selectCommitHint')}</p>
          </div>
        ) : detailsQuery.isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            {t('projects.loadingCommitDetails')}
          </div>
        ) : detailsQuery.isError ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <AlertCircle aria-hidden className="mb-2 h-6 w-6 text-destructive" />
            <p className="text-sm font-medium text-foreground">{t('projects.commitDetailsLoadFailed')}</p>
            <p className="mt-1 max-w-lg text-xs text-muted-foreground">{detailsQuery.error.message}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void detailsQuery.refetch()}>
              {t('projects.retry')}
            </Button>
          </div>
        ) : commitDetails ? (
          <>
            <div className="shrink-0 border-b border-border px-4 py-2">
              <h3 className="truncate text-sm font-medium text-foreground" title={commitDetails.commit.subject}>
                {commitDetails.commit.subject}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-mono text-primary" translate="no">
                  {commitDetails.commit.shortHash}
                </span>{' '}
                · {commitDetails.commit.author} ·{' '}
                <time
                  dateTime={commitDetails.commit.authoredAt}
                  title={formatAbsoluteDate(commitDetails.commit.authoredAt, i18n.language)}
                >
                  {formatRelativeDate(commitDetails.commit.authoredAt, i18n.language)}
                </time>
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ProjectDiffView
                content={commitDetails.diff}
                truncated={commitDetails.truncated}
                stats={commitDetails.files}
                statsTruncated={commitDetails.filesTruncated}
                emptyLabel={t('projects.noCommitDiff')}
              />
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
};
