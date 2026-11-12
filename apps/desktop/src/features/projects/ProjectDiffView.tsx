import React from 'react';
import type { GitDiffFileStat } from '@ownshell/core';
import { AlertTriangle, ChevronDown, ChevronRight, Columns2, FileCode2, Rows3 } from 'lucide-react';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { getLanguage } from '../../lib/codemirror-languages';
import {
  type DiffFile,
  type DiffLine,
  diffWords,
  pairHunkLines,
  parseUnifiedDiff,
} from './gitDiff';
import { type TokenSpan, highlightLines, lineSegments } from './gitFormat';

type DiffMode = 'unified' | 'split';

const DIFF_MODE_STORAGE_KEY = 'ownshell.projects.diffMode';
const MAX_HIGHLIGHTED_FILE_LINES = 5000;
const AUTO_COLLAPSE_FILE_LINES = 1000;

function readDiffMode(): DiffMode {
  try {
    return localStorage.getItem(DIFF_MODE_STORAGE_KEY) === 'split' ? 'split' : 'unified';
  } catch {
    return 'unified';
  }
}

function filePath(file: Pick<DiffFile, 'oldPath' | 'newPath' | 'status'>): string {
  return file.status === 'deleted' ? file.oldPath : file.newPath;
}

const STATUS_LETTER: Record<DiffFile['status'], string> = {
  added: 'A',
  deleted: 'D',
  modified: 'M',
  renamed: 'R',
  copied: 'C',
};

export const DiffCounts: React.FC<{ additions: number | null; deletions: number | null }> = ({
  additions,
  deletions,
}) => {
  const { t } = useTranslation();
  if (additions === null || deletions === null) {
    return <span className="text-[11px] text-muted-foreground">{t('projects.diffBinary')}</span>;
  }
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums">
      <span className="text-success">+{additions}</span>{' '}
      <span className="text-destructive">−{deletions}</span>
    </span>
  );
};

interface ProjectDiffViewProps {
  content: string;
  /** Server-side byte limit was hit. */
  truncated: boolean;
  /** Optional complete file list (numstat) for commits. */
  stats?: GitDiffFileStat[];
  statsTruncated?: boolean;
  emptyLabel: string;
}

export const ProjectDiffView: React.FC<ProjectDiffViewProps> = ({
  content,
  truncated,
  stats,
  statsTruncated,
  emptyLabel,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = React.useState<DiffMode>(readDiffMode);
  const parsed = React.useMemo(() => parseUnifiedDiff(content), [content]);
  const sectionRefs = React.useRef(new Map<string, HTMLElement>());
  const tooLarge = truncated || parsed.truncated;
  const totals = parsed.files.reduce(
    (sum, file) => ({ additions: sum.additions + file.additions, deletions: sum.deletions + file.deletions }),
    { additions: 0, deletions: 0 }
  );

  const changeMode = (next: DiffMode) => {
    setMode(next);
    try {
      localStorage.setItem(DIFF_MODE_STORAGE_KEY, next);
    } catch {
      // Preference is a convenience only.
    }
  };

  if (!parsed.files.length && !stats?.length) {
    return <p className="p-5 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const shownPaths = new Set(parsed.files.map(filePath));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>{t('projects.diffFileCount', { count: stats?.length ?? parsed.files.length })}</span>
        <span className="font-mono tabular-nums">
          <span className="text-success">+{totals.additions}</span>{' '}
          <span className="text-destructive">−{totals.deletions}</span>
        </span>
        <div className="ml-auto flex items-center gap-0.5 rounded-md bg-secondary/50 p-0.5">
          {(
            [
              ['unified', Rows3, t('projects.diffUnified')],
              ['split', Columns2, t('projects.diffSplit')],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => changeMode(value)}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                mode === value ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'
              )}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tooLarge && (
          <p className="flex items-center gap-2 border-b border-border bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
            {t('projects.diffTooLarge')}
          </p>
        )}
        {stats && stats.length > 1 && (
          <ul className="border-b border-border py-1 text-xs">
            {stats.map((stat) => {
              const shown = shownPaths.has(stat.path);
              return (
                <li key={`${stat.originalPath ?? ''}:${stat.path}`}>
                  <button
                    type="button"
                    disabled={!shown}
                    onClick={() =>
                      sectionRefs.current.get(stat.path)?.scrollIntoView({ block: 'start' })
                    }
                    title={stat.originalPath ? `${stat.originalPath} → ${stat.path}` : stat.path}
                    className="flex w-full items-center gap-2 px-3 py-0.5 text-left hover:bg-secondary/50 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <FileCode2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono text-foreground" translate="no">
                      {stat.originalPath ? `${stat.originalPath} → ${stat.path}` : stat.path}
                    </span>
                    <DiffCounts additions={stat.additions} deletions={stat.deletions} />
                  </button>
                </li>
              );
            })}
            {statsTruncated && (
              <li className="px-3 py-0.5 text-warning">{t('projects.diffFileListTruncated')}</li>
            )}
          </ul>
        )}
        {parsed.files.map((file, index) => (
          <DiffFileSection
            key={`${index}:${filePath(file)}`}
            ref={(element) => {
              if (element) sectionRefs.current.set(filePath(file), element);
              else sectionRefs.current.delete(filePath(file));
            }}
            file={file}
            mode={mode}
          />
        ))}
      </div>
    </div>
  );
};

interface DiffFileSectionProps {
  file: DiffFile;
  mode: DiffMode;
}

const DiffFileSection = React.memo(
  React.forwardRef<HTMLElement, DiffFileSectionProps>(function DiffFileSection({ file, mode }, ref) {
    const { t } = useTranslation();
    const lineCount = file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
    const [collapsed, setCollapsed] = React.useState(lineCount > AUTO_COLLAPSE_FILE_LINES);
    const path = filePath(file);

    return (
      <section ref={ref} className="border-b border-border">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-left text-xs hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          {collapsed ? (
            <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="w-3 shrink-0 font-mono font-semibold text-warning">
            {STATUS_LETTER[file.status]}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-foreground" translate="no" title={path}>
            {file.status === 'renamed' || file.status === 'copied'
              ? `${file.oldPath} → ${file.newPath}`
              : path}
          </span>
          {!file.binary && <DiffCounts additions={file.additions} deletions={file.deletions} />}
        </button>
        {!collapsed &&
          (file.binary ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">{t('projects.diffBinaryFile')}</p>
          ) : file.hunks.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">{t('projects.diffNoContentChanges')}</p>
          ) : (
            <DiffFileBody file={file} mode={mode} />
          ))}
      </section>
    );
  })
);

type ChangedRanges = Array<[number, number]>;

function useFileDecorations(file: DiffFile) {
  return React.useMemo(() => {
    const syntax = new Map<DiffLine, TokenSpan[]>();
    const words = new Map<DiffLine, ChangedRanges>();
    const lineCount = file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
    const language = lineCount <= MAX_HIGHLIGHTED_FILE_LINES ? getLanguage(filePath(file)) : null;

    for (const hunk of file.hunks) {
      if (language) {
        for (const side of ['old', 'new'] as const) {
          const sideLines = hunk.lines.filter((line) =>
            side === 'old' ? line.type !== 'add' : line.type !== 'del'
          );
          highlightLines(
            language,
            sideLines.map((line) => line.content)
          ).forEach((spans, index) => {
            const line = sideLines[index];
            // Context lines appear on both sides; the new side wins.
            if (side === 'new' || line.type === 'del') syntax.set(line, spans);
          });
        }
      }
      for (const row of pairHunkLines(hunk.lines)) {
        if (row.left?.type !== 'del' || row.right?.type !== 'add') continue;
        const result = diffWords(row.left.content, row.right.content);
        if (!result) continue;
        const toRanges = (segments: typeof result.old): ChangedRanges => {
          const ranges: ChangedRanges = [];
          let offset = 0;
          for (const segment of segments) {
            if (segment.changed) ranges.push([offset, offset + segment.text.length]);
            offset += segment.text.length;
          }
          return ranges;
        };
        // Only mark when the lines share something; otherwise the whole line is the change.
        if (result.old.some((segment) => !segment.changed)) {
          words.set(row.left, toRanges(result.old));
          words.set(row.right, toRanges(result.new));
        }
      }
    }
    return { syntax, words };
  }, [file]);
}

function renderLineContent(line: DiffLine, spans: TokenSpan[] | undefined, changed: ChangedRanges | undefined) {
  const text = line.content;
  if (!text) return ' ';
  const changedClass = line.type === 'add' ? 'rounded-sm bg-success/30' : 'rounded-sm bg-destructive/30';
  const segments = lineSegments(text, spans, changed);
  if (segments.length === 1 && !segments[0].syntaxClass && !segments[0].changed) return text;
  return segments.map((segment) => (
    <span key={segment.from} className={cn(segment.syntaxClass, segment.changed && changedClass)}>
      {text.slice(segment.from, segment.to)}
    </span>
  ));
}

const LINE_BACKGROUND: Record<DiffLine['type'], string> = {
  add: 'bg-success/10',
  del: 'bg-destructive/10',
  context: '',
};

const SIGN: Record<DiffLine['type'], string> = { add: '+', del: '−', context: ' ' };

const DiffFileBody: React.FC<{ file: DiffFile; mode: DiffMode }> = ({ file, mode }) => {
  const { t } = useTranslation();
  const { syntax, words } = useFileDecorations(file);
  let nextOldLine = 1;

  const content = (line: DiffLine) => (
    <>
      {renderLineContent(line, syntax.get(line), words.get(line))}
      {line.noNewline && (
        <span className="ml-2 text-[10px] text-muted-foreground" title={t('projects.diffNoNewline')}>
          ⏎̸
        </span>
      )}
    </>
  );

  return (
    <div className="overflow-x-auto font-mono text-xs leading-5" translate="no">
      <div className={cn(mode === 'unified' && 'w-max min-w-full')}>
        {file.hunks.map((hunk, hunkIndex) => {
          const hidden = Math.max(0, hunk.oldStart - nextOldLine);
          const lastOld = [...hunk.lines].reverse().find((line) => line.oldNumber !== undefined);
          nextOldLine = (lastOld?.oldNumber ?? hunk.oldStart) + 1;
          return (
            <React.Fragment key={hunkIndex}>
              <div className="flex items-center gap-3 bg-primary/5 px-3 py-0.5 text-[11px] text-muted-foreground">
                {hidden > 0 && (
                  <span className="shrink-0">⋯ {t('projects.diffHiddenLines', { count: hidden })}</span>
                )}
                <span className="truncate">{hunk.header}</span>
              </div>
              {mode === 'unified'
                ? hunk.lines.map((line, index) => (
                    <div key={index} className={cn('flex', LINE_BACKGROUND[line.type])}>
                      <LineNumber value={line.oldNumber} />
                      <LineNumber value={line.newNumber} />
                      <span className="w-4 shrink-0 select-none text-center text-muted-foreground">
                        {SIGN[line.type]}
                      </span>
                      <span className="whitespace-pre pr-4 text-foreground">{content(line)}</span>
                    </div>
                  ))
                : pairHunkLines(hunk.lines).map((row, index) => (
                    <div key={index} className="grid grid-cols-2">
                      {[row.left, row.right].map((line, side) => (
                        <div
                          key={side}
                          className={cn(
                            'flex min-w-0',
                            side === 0 && 'border-r border-border',
                            line ? LINE_BACKGROUND[line.type] : 'bg-secondary/30'
                          )}
                        >
                          <LineNumber value={side === 0 ? line?.oldNumber : line?.newNumber} />
                          {line && (
                            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-3 text-foreground">
                              {content(line)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const LineNumber: React.FC<{ value?: number }> = ({ value }) => (
  <span className="w-11 shrink-0 select-none pr-2 text-right tabular-nums text-muted-foreground/70">
    {value ?? ''}
  </span>
);
