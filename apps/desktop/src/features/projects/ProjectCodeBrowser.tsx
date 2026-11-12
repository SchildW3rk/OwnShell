import React from 'react';
import type { GitCodeEntry, GitCodeErrorCode } from '@ownshell/core';
import {
  AlertCircle,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  FileWarning,
  Folder,
  FolderOpen,
  Loader2,
  Search,
} from 'lucide-react';
import { Button, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { getLanguageExtension } from '../../lib/codemirror-languages';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { getCodeMirrorTheme } from '../../utils/codemirror-theme';
import { fuzzyScore } from './gitDiff';
import {
  ProjectGitCodeError,
  useProjectGitCodeDirectory,
  useProjectGitCodeFile,
  useProjectGitCodeFiles,
} from './useProjectQueries';

interface ProjectCodeBrowserProps {
  projectId: string;
  hasHead: boolean;
  rootPath: string;
  bare: boolean;
}

type Selection = { kind: 'file' | 'directory'; path: string };

const codeErrorKeys: Record<GitCodeErrorCode, string> = {
  DIRECTORY_READ_FAILED: 'projects.codeDirectoryReadFailed',
  FILE_READ_FAILED: 'projects.codeFileReadFailed',
  NOT_A_FILE: 'projects.codeNotFile',
  FILE_TOO_LARGE: 'projects.codeFileTooLarge',
  BINARY_FILE: 'projects.codeBinaryFile',
};

const PLACEHOLDER_CODES = new Set<GitCodeErrorCode>(['FILE_TOO_LARGE', 'BINARY_FILE']);
const MAX_QUICK_OPEN_RESULTS = 50;

function errorMessage(error: Error, t: (key: string) => string): string {
  return error instanceof ProjectGitCodeError &&
    error.code &&
    Object.prototype.hasOwnProperty.call(codeErrorKeys, error.code)
    ? t(codeErrorKeys[error.code])
    : error.message;
}

function parentDirectories(path: string): string[] {
  const segments = path.split('/');
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
}

export const ProjectCodeBrowser: React.FC<ProjectCodeBrowserProps> = ({
  projectId,
  hasHead,
  rootPath,
  bare,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(['']));
  const [selection, setSelection] = React.useState<Selection>({ kind: 'directory', path: '' });
  const [quickOpen, setQuickOpen] = React.useState(false);

  const toggleDirectory = (path: string) => {
    setSelection({ kind: 'directory', path });
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const openFile = (path: string) => {
    setExpanded((current) => new Set([...current, ...parentDirectories(path)]));
    setSelection({ kind: 'file', path });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      setQuickOpen(true);
    }
  };

  if (!hasHead) {
    return (
      <div
        id="repository-panel-code"
        role="region"
        aria-labelledby="repository-tab-code"
        className="flex h-full flex-col items-center justify-center px-6 text-center"
      >
        <FileCode2 aria-hidden className="h-8 w-8 text-muted-foreground" />
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
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="relative grid h-full min-h-0 grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] overflow-hidden focus:outline-none"
    >
      <aside className="flex min-h-0 flex-col border-r border-border">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-secondary/50 px-2 py-1 text-left text-xs text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Search aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">{t('projects.codeQuickOpen')}</span>
            <kbd className="shrink-0 font-sans text-[10px]">
              {navigator.platform.toLowerCase().includes('mac') ? '⌘P' : 'Ctrl+P'}
            </kbd>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1 text-sm" role="tree">
          <TreeDirectory
            projectId={projectId}
            path=""
            depth={0}
            expanded={expanded}
            selection={selection}
            onToggleDirectory={toggleDirectory}
            onOpenFile={openFile}
          />
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        {selection.kind === 'file' ? (
          <FileView projectId={projectId} path={selection.path} rootPath={rootPath} bare={bare} />
        ) : (
          <DirectoryReadme
            projectId={projectId}
            path={selection.path}
            rootPath={rootPath}
            bare={bare}
          />
        )}
      </section>

      {quickOpen && (
        <QuickOpen
          projectId={projectId}
          onClose={() => setQuickOpen(false)}
          onOpen={(path) => {
            setQuickOpen(false);
            openFile(path);
          }}
        />
      )}
    </div>
  );
};

interface TreeDirectoryProps {
  projectId: string;
  path: string;
  depth: number;
  expanded: Set<string>;
  selection: Selection;
  onToggleDirectory: (path: string) => void;
  onOpenFile: (path: string) => void;
}

const TreeDirectory: React.FC<TreeDirectoryProps> = (props) => {
  const { projectId, path, depth } = props;
  const { t } = useTranslation();
  const query = useProjectGitCodeDirectory(projectId, path, true);
  const indent = { paddingLeft: `${depth * 12 + 8}px` };

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground" style={indent}>
        <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
        {t('projects.codeLoading')}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="py-1 pr-2 text-xs text-destructive" style={indent}>
        {errorMessage(query.error, t)}{' '}
        <button type="button" className="underline" onClick={() => void query.refetch()}>
          {t('projects.retry')}
        </button>
      </div>
    );
  }
  if (!query.data?.entries.length) {
    return (
      <p className="py-1 text-xs text-muted-foreground" style={indent}>
        {t('projects.codeDirectoryEmpty')}
      </p>
    );
  }

  return (
    <>
      {query.data.entries.map((entry) => (
        <TreeEntry key={`${entry.kind}:${entry.path}`} entry={entry} {...props} />
      ))}
      {query.data.truncated && (
        <p className="py-1 text-xs text-warning" style={indent}>
          {t('projects.codeDirectoryTruncated')}
        </p>
      )}
    </>
  );
};

const TreeEntry: React.FC<TreeDirectoryProps & { entry: GitCodeEntry }> = ({ entry, ...props }) => {
  const { t } = useTranslation();
  const { depth, expanded, selection, onToggleDirectory, onOpenFile } = props;
  const isDirectory = entry.kind === 'directory';
  const isOpen = isDirectory && expanded.has(entry.path);
  const selected = selection.path === entry.path && selection.kind === (isDirectory ? 'directory' : 'file');
  const Icon = isDirectory ? (isOpen ? FolderOpen : Folder) : entry.kind === 'submodule' ? Box : FileCode2;

  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-expanded={isDirectory ? isOpen : undefined}
        aria-selected={selected}
        disabled={entry.kind === 'submodule'}
        title={entry.kind === 'submodule' ? t('projects.codeSubmodule') : entry.path}
        onClick={() => (isDirectory ? onToggleDirectory(entry.path) : onOpenFile(entry.path))}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        className={cn(
          'flex w-full items-center gap-1.5 py-1 pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60',
          selected
            ? 'bg-primary/12 text-foreground'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        )}
      >
        {isDirectory ? (
          isOpen ? (
            <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon aria-hidden className={cn('h-4 w-4 shrink-0', isDirectory && 'text-primary')} />
        <span className="min-w-0 flex-1 truncate" translate="no">
          {entry.name}
        </span>
      </button>
      {isOpen && <TreeDirectory {...props} path={entry.path} depth={depth + 1} />}
    </>
  );
};

interface FileViewProps {
  projectId: string;
  path: string;
  rootPath: string;
  bare: boolean;
  heading?: string;
}

const FileView: React.FC<FileViewProps> = ({ projectId, path, rootPath, bare, heading }) => {
  const { t } = useTranslation();
  const query = useProjectGitCodeFile(projectId, path);
  const [copied, setCopied] = React.useState(false);
  // Bare repositories have no checkout, so only the repository-relative path is meaningful.
  const copyValue = bare ? path : `${rootPath.replace(/\/$/, '')}/${path}`;

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('projects.repositoryCommandCopyFailed'));
    }
  };

  const placeholderCode =
    query.error instanceof ProjectGitCodeError && query.error.code && PLACEHOLDER_CODES.has(query.error.code)
      ? query.error.code
      : null;

  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border px-3">
        <FileCode2 aria-hidden className="h-4 w-4 shrink-0 text-primary" />
        {heading && <span className="shrink-0 text-xs font-medium text-foreground">{heading}</span>}
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" translate="no" title={path}>
          {path}
        </span>
        {query.data && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {t('projects.codeFileSize', { bytes: query.data.byteLength })}
          </span>
        )}
        <button
          type="button"
          onClick={() => void copyPath()}
          title={copyValue}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-success" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
          {copied ? t('projects.copied') : t('projects.codeCopyPath')}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {query.isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            {t('projects.codeFileLoading')}
          </div>
        ) : placeholderCode ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <FileWarning aria-hidden className="mb-2 h-7 w-7 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">{t(codeErrorKeys[placeholderCode])}</p>
          </div>
        ) : query.isError ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <AlertCircle aria-hidden className="mb-2 h-7 w-7 text-destructive" />
            <p className="max-w-xl text-sm text-destructive">{errorMessage(query.error, t)}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void query.refetch()}>
              {t('projects.retry')}
            </Button>
          </div>
        ) : query.data ? (
          <CodeViewer path={path} content={query.data.content} />
        ) : null}
      </div>
    </>
  );
};

const README_PATTERN = /^readme(\.md|\.markdown)?$/i;

// shortcut: README is shown as highlighted markdown source; no markdown renderer is installed.
const DirectoryReadme: React.FC<Omit<FileViewProps, 'heading'>> = ({ projectId, path, rootPath, bare }) => {
  const { t } = useTranslation();
  const query = useProjectGitCodeDirectory(projectId, path, true);
  const readme = query.data?.entries.find((entry) => entry.kind === 'file' && README_PATTERN.test(entry.name));

  if (readme) {
    return <FileView projectId={projectId} path={readme.path} rootPath={rootPath} bare={bare} heading="README" />;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <FileCode2 aria-hidden className="h-8 w-8 text-muted-foreground" />
      <h3 className="mt-4 font-medium text-foreground">{t('projects.codeSelectFile')}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('projects.codeHeadDescription')}</p>
    </div>
  );
};

const CodeViewer: React.FC<{ path: string; content: string }> = ({ path, content }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const themeCompartment = React.useRef(new Compartment());
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const editorFontFamily = useAppearanceStore((state) => state.editorFontFamily);
  const editorFontSize = useAppearanceStore((state) => state.editorFontSize);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const appearance = useAppearanceStore.getState();
    const language = getLanguageExtension(path);
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          // Read-only but focusable, so Cmd/Ctrl+F search and selection keep working.
          EditorState.readOnly.of(true),
          themeCompartment.current.of(
            getCodeMirrorTheme(useThemeStore.getState().getResolvedTheme(), {
              editorFontFamily: appearance.editorFontFamily,
              editorFontSize: appearance.editorFontSize,
            })
          ),
          EditorView.theme({ '&': { height: '100%' } }),
          ...(language ? [language] : []),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [path, content]);

  React.useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(
        getCodeMirrorTheme(resolvedTheme, { editorFontFamily, editorFontSize })
      ),
    });
  }, [resolvedTheme, editorFontFamily, editorFontSize]);

  return <div ref={containerRef} className="h-full" translate="no" />;
};

interface QuickOpenProps {
  projectId: string;
  onClose: () => void;
  onOpen: (path: string) => void;
}

const QuickOpen: React.FC<QuickOpenProps> = ({ projectId, onClose, onOpen }) => {
  const { t } = useTranslation();
  const filesQuery = useProjectGitCodeFiles(projectId, true);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const results = React.useMemo(() => {
    const paths = filesQuery.data?.paths ?? [];
    if (!query.trim()) return paths.slice(0, MAX_QUICK_OPEN_RESULTS);
    return paths
      .flatMap((path) => {
        const score = fuzzyScore(path, query);
        return score === null ? [] : [{ path, score }];
      })
      .sort((left, right) => left.score - right.score)
      .slice(0, MAX_QUICK_OPEN_RESULTS)
      .map((result) => result.path);
  }, [filesQuery.data, query]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      onOpen(results[active]);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex justify-center bg-background/40 pt-10" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t('projects.codeQuickOpen')}
        className="flex h-fit max-h-[70%] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('projects.codeQuickOpenPlaceholder')}
          aria-label={t('projects.codeQuickOpen')}
          spellCheck={false}
          className="w-full border-b border-border bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox">
          {filesQuery.isLoading ? (
            <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              {t('projects.codeLoading')}
            </p>
          ) : filesQuery.isError ? (
            <p className="px-3 py-2 text-xs text-destructive">{filesQuery.error.message}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t('projects.codeQuickOpenEmpty')}</p>
          ) : (
            results.map((path, index) => {
              const slash = path.lastIndexOf('/');
              return (
                <button
                  key={path}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onOpen(path)}
                  className={cn(
                    'flex w-full items-baseline gap-2 px-3 py-1 text-left text-sm',
                    index === active ? 'bg-primary/12 text-foreground' : 'text-muted-foreground'
                  )}
                  translate="no"
                >
                  <span className="shrink-0 text-foreground">{path.slice(slash + 1)}</span>
                  <span className="min-w-0 truncate text-xs">{slash > 0 ? path.slice(0, slash) : ''}</span>
                </button>
              );
            })
          )}
          {filesQuery.data?.truncated && (
            <p className="px-3 py-1 text-[11px] text-warning">{t('projects.codeFileListTruncated')}</p>
          )}
        </div>
      </div>
    </div>
  );
};
