import React from 'react';
import type { GitCodeEntry, GitCodeErrorCode } from '@ownshell/core';
import {
  AlertCircle,
  Box,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  Loader2,
} from 'lucide-react';
import { Button, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { ProjectGitCodeError, useProjectGitCodeDirectory, useProjectGitCodeFile } from './useProjectQueries';

interface ProjectCodeBrowserProps {
  projectId: string;
  active: boolean;
  hasHead: boolean;
}

const codeErrorKeys: Record<GitCodeErrorCode, string> = {
  DIRECTORY_READ_FAILED: 'projects.codeDirectoryReadFailed',
  FILE_READ_FAILED: 'projects.codeFileReadFailed',
  NOT_A_FILE: 'projects.codeNotFile',
  FILE_TOO_LARGE: 'projects.codeFileTooLarge',
  BINARY_FILE: 'projects.codeBinaryFile',
};

export const ProjectCodeBrowser: React.FC<ProjectCodeBrowserProps> = ({
  projectId,
  active,
  hasHead,
}) => {
  const { t } = useTranslation();
  const [directoryPath, setDirectoryPath] = React.useState('');
  const [selectedFilePath, setSelectedFilePath] = React.useState<string | null>(null);
  const directoryQuery = useProjectGitCodeDirectory(projectId, directoryPath, active && hasHead);
  const fileQuery = useProjectGitCodeFile(
    projectId,
    active && hasHead ? selectedFilePath : null
  );
  const pathSegments = directoryPath ? directoryPath.split('/') : [];

  React.useEffect(() => {
    setDirectoryPath('');
    setSelectedFilePath(null);
  }, [projectId]);

  const openEntry = (entry: GitCodeEntry) => {
    if (entry.kind === 'directory') {
      setDirectoryPath(entry.path);
      setSelectedFilePath(null);
      return;
    }
    if (entry.kind === 'file') setSelectedFilePath(entry.path);
  };

  if (!hasHead) {
    return (
      <div
        id="repository-panel-code"
        role="region"
        aria-labelledby="repository-tab-code"
        className="flex min-h-[32rem] flex-col items-center justify-center px-6 text-center"
      >
        <div className="rounded-xl border border-border bg-secondary/30 p-4">
          <FileCode2 className="h-8 w-8 text-primary" />
        </div>
        <h3 className="mt-4 font-medium text-foreground">{t('projects.codeNoCommits')}</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {t('projects.codeNoCommitsDescription')}
        </p>
      </div>
    );
  }

  return (
    <div
      id="repository-panel-code"
      role="region"
      aria-labelledby="repository-tab-code"
      className="min-h-[32rem]"
    >
      <div className="flex min-h-[32rem] flex-col lg:flex-row">
        <aside className="flex min-h-72 flex-col border-b border-border bg-secondary/15 lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex min-h-12 items-center gap-1 overflow-x-auto border-b border-border px-3">
            <button
              type="button"
              onClick={() => {
                setDirectoryPath('');
                setSelectedFilePath(null);
              }}
              className="shrink-0 rounded px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t('projects.codeRoot')}
            </button>
            {pathSegments.map((segment, index) => {
              const path = pathSegments.slice(0, index + 1).join('/');
              return (
                <React.Fragment key={path}>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => {
                      setDirectoryPath(path);
                      setSelectedFilePath(null);
                    }}
                    className="max-w-36 shrink-0 truncate rounded px-1.5 py-1 text-xs text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {segment}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {directoryQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('projects.codeLoading')}
              </div>
            ) : directoryQuery.isError ? (
              <div className="px-3 py-8 text-center">
                <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" />
                <p className="text-sm text-destructive">
                  {directoryQuery.error instanceof ProjectGitCodeError &&
                  directoryQuery.error.code &&
                  Object.prototype.hasOwnProperty.call(codeErrorKeys, directoryQuery.error.code)
                    ? t(codeErrorKeys[directoryQuery.error.code])
                    : directoryQuery.error.message}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => void directoryQuery.refetch()}
                >
                  {t('projects.retry')}
                </Button>
              </div>
            ) : directoryQuery.data?.entries.length ? (
              <div className="space-y-0.5">
                {directoryQuery.data.entries.map((entry) => {
                  const Icon =
                    entry.kind === 'directory'
                      ? Folder
                      : entry.kind === 'submodule'
                        ? Box
                        : FileCode2;
                  const disabled = entry.kind === 'submodule';
                  return (
                    <button
                      key={`${entry.kind}:${entry.path}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => openEntry(entry)}
                      title={disabled ? t('projects.codeSubmodule') : entry.path}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        selectedFilePath === entry.path
                          ? 'bg-primary/12 text-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                        disabled && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          entry.kind === 'directory' && 'text-primary'
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      {entry.kind === 'directory' && (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  );
                })}
                {directoryQuery.data.truncated && (
                  <p className="px-2.5 py-2 text-xs text-warning">
                    {t('projects.codeDirectoryTruncated')}
                  </p>
                )}
              </div>
            ) : (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                <FolderOpen className="mx-auto mb-2 h-7 w-7" />
                {t('projects.codeDirectoryEmpty')}
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 flex-1 bg-background">
          {selectedFilePath ? (
            <>
              <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <FileCode2 className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate font-mono text-xs text-foreground" translate="no">
                    {selectedFilePath}
                  </span>
                </div>
                {fileQuery.data && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {t('projects.codeFileSize', { bytes: fileQuery.data.byteLength })}
                  </span>
                )}
              </div>
              {fileQuery.isLoading ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('projects.codeFileLoading')}
                </div>
              ) : fileQuery.isError ? (
                <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
                  <AlertCircle className="mb-2 h-7 w-7 text-destructive" />
                  <p className="max-w-xl text-sm text-destructive">
                    {fileQuery.error instanceof ProjectGitCodeError &&
                    fileQuery.error.code &&
                    Object.prototype.hasOwnProperty.call(codeErrorKeys, fileQuery.error.code)
                      ? t(codeErrorKeys[fileQuery.error.code])
                      : fileQuery.error.message}
                  </p>
                </div>
              ) : fileQuery.data ? (
                <div className="max-h-[42rem] overflow-auto">
                  <pre className="min-w-full w-max p-4 font-mono text-xs leading-5 text-foreground">
                    <code>{fileQuery.data.content}</code>
                  </pre>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-[32rem] flex-col items-center justify-center px-6 text-center">
              <div className="rounded-xl border border-border bg-secondary/30 p-4">
                <FileCode2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mt-4 font-medium text-foreground">{t('projects.codeSelectFile')}</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {t('projects.codeHeadDescription')}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
