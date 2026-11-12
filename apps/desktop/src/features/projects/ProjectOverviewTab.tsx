import React from 'react';
import type { GitCommitSummary, GitRepositoryStatus } from '@ownshell/core';
import { ArrowDown, ArrowUp, Check, ChevronRight, Copy, GitBranch, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RepositoryAccessPanelProps {
  commands: { url: string; clone: string; remote: string };
  bare: boolean;
  copiedCommand: 'clone' | 'remote' | null;
  onCopy: (kind: 'clone' | 'remote', command: string) => void;
}

export const RepositoryAccessPanel: React.FC<RepositoryAccessPanelProps> = ({
  commands,
  bare,
  copiedCommand,
  onCopy,
}) => {
  const { t } = useTranslation();

  return (
    <div className="border-t border-border bg-secondary/10 px-5 py-5">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-foreground">{t('projects.repositoryAccess')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('projects.repositoryAccessDescription')}
        </p>
      </div>
      <div className="space-y-2">
        <RepositoryCommand
          label={t('projects.cloneCommand')}
          command={commands.clone}
          copied={copiedCommand === 'clone'}
          onCopy={() => onCopy('clone', commands.clone)}
        />
        <RepositoryCommand
          label={t('projects.remoteCommand')}
          command={commands.remote}
          copied={copiedCommand === 'remote'}
          onCopy={() => onCopy('remote', commands.remote)}
        />
      </div>
      <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground" translate="no">
        {commands.url}
      </p>
      <p className="mt-2 text-xs text-warning">{t('projects.ownshellRemoteNotAvailable')}</p>
      {!bare && <p className="mt-1 text-xs text-warning">{t('projects.nonBareRemoteWarning')}</p>}
    </div>
  );
};

interface RepositoryCommandProps {
  label: string;
  command: string;
  copied: boolean;
  onCopy: () => void;
}

const RepositoryCommand: React.FC<RepositoryCommandProps> = ({
  label,
  command,
  copied,
  onCopy,
}) => {
  const { t } = useTranslation();
  return (
    <div className="group overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t('projects.copyRepositoryCommand', { label })}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? t('projects.copied') : t('projects.copy')}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-xs text-foreground" translate="no">
        <code>{command}</code>
      </pre>
    </div>
  );
};

interface RepositoryOverviewProps {
  gitStatus: GitRepositoryStatus;
  formattedAuthoredAt: string | null;
  onOpenCommit: (commit: GitCommitSummary) => void;
}

export const RepositoryOverview: React.FC<RepositoryOverviewProps> = ({
  gitStatus,
  formattedAuthoredAt,
  onOpenCommit,
}) => {
  const { t } = useTranslation();

  return (
    <div
      id="repository-panel-overview"
      role="region"
      aria-labelledby="repository-tab-overview"
      className="divide-y divide-border"
    >
      <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t(gitStatus.bare ? 'projects.defaultBranch' : 'projects.branch')}
          </p>
          <p
            className="mt-1 flex min-w-0 items-center gap-2 font-mono text-sm text-foreground"
            translate="no"
          >
            <GitBranch aria-hidden className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{gitStatus.branch}</span>
            {gitStatus.bare && (
              <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 font-sans text-[10px] font-medium text-primary">
                {t('projects.bare')}
              </span>
            )}
            {gitStatus.detached && (
              <span className="shrink-0 text-xs text-warning">{t('projects.detached')}</span>
            )}
          </p>
          {gitStatus.upstream && (
            <div
              className="mt-1.5 flex flex-wrap items-center gap-2 pl-6 font-mono text-xs text-muted-foreground"
              translate="no"
            >
              <span>{gitStatus.upstream}</span>
              <span
                className="inline-flex items-center gap-0.5 tabular-nums"
                title={t('projects.ahead', { count: gitStatus.ahead })}
              >
                <ArrowUp aria-hidden className="h-3 w-3 text-primary" />
                {gitStatus.ahead}
              </span>
              <span
                className="inline-flex items-center gap-0.5 tabular-nums"
                title={t('projects.behind', { count: gitStatus.behind })}
              >
                <ArrowDown aria-hidden className="h-3 w-3 text-warning" />
                {gitStatus.behind}
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('projects.repositoryRoot')}
          </p>
          <p className="mt-1 truncate font-mono text-sm text-foreground" translate="no">
            {gitStatus.rootPath}
          </p>
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="mb-3 flex items-center gap-2">
          <History aria-hidden className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">{t('projects.latestCommit')}</h3>
        </div>
        {gitStatus.lastCommit ? (
          <button
            type="button"
            className="group flex w-full items-center gap-3 rounded-md bg-secondary/50 p-3 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t('projects.openCommit', { hash: gitStatus.lastCommit.shortHash })}
            onClick={() => gitStatus.lastCommit && onOpenCommit(gitStatus.lastCommit)}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {gitStatus.lastCommit.subject}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                <span className="font-mono text-primary" translate="no">
                  {gitStatus.lastCommit.shortHash}
                </span>{' '}
                · {gitStatus.lastCommit.author}
                {formattedAuthoredAt ? ` · ${formattedAuthoredAt}` : ''}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              {t('projects.commitDetailsAction')}
              <ChevronRight
                aria-hidden
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">{t('projects.noCommits')}</p>
        )}
      </div>
    </div>
  );
};
