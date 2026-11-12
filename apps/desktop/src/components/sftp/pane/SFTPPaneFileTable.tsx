import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SFTPFileEntry } from '@ownshell/core';
import { AlertCircle, ArrowDown, ArrowUp, File, Folder, Link, Loader2, Search } from 'lucide-react';
import { AppCheckbox, Button, cn, formatBytes } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';

import { formatDate } from './utils';

type SortKey = 'name' | 'size' | 'modifiedAt';

interface SFTPPaneFileTableProps {
  files: SFTPFileEntry[];
  currentPath: string;
  compact: boolean;
  dualPaneMode: boolean;
  defaultOrder?: 'name' | 'server';
  isLoading: boolean;
  isInitialized: boolean;
  error?: string;
  onRetry: () => void;
  onNavigateUp: () => void;
  onFileDoubleClick: (file: SFTPFileEntry) => void;
  onContextMenu: (event: React.MouseEvent, file: SFTPFileEntry) => void;
  onDragStart: (event: React.DragEvent, file: SFTPFileEntry) => void;
  selectedFiles?: Set<string>;
  onToggleSelect?: (path: string) => void;
  onSelectAll?: (paths: string[]) => void;
  onClearSelection?: () => void;
}

function getFileIcon(file: SFTPFileEntry) {
  if (file.type === 'directory') return <Folder className="w-4 h-4 text-accent" />;
  if (file.type === 'symlink') return <Link className="w-4 h-4 text-success" />;
  return <File className="w-4 h-4 text-info" />;
}

export const SFTPPaneFileTable: React.FC<SFTPPaneFileTableProps> = ({
  files,
  currentPath,
  compact,
  dualPaneMode,
  defaultOrder = 'name',
  isLoading,
  isInitialized,
  error,
  onRetry,
  onNavigateUp,
  onFileDoubleClick,
  onContextMenu,
  onDragStart,
  selectedFiles,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}) => {
  const renderStartedAt = performance.now();
  const { t } = useTranslation();
  const tableRef = useRef<HTMLTableElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const measuredFiles = useRef<SFTPFileEntry[] | null>(null);
  const [filter, setFilter] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey | null; descending: boolean }>({
    key: defaultOrder === 'name' ? 'name' : null,
    descending: false,
  });
  const [headerHeight, setHeaderHeight] = useState(compact ? 25 : 33);
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const hasParent = currentPath !== '/' && currentPath !== '.';
  const parentRows = hasParent ? 1 : 0;
  const selectionEnabled = !!selectedFiles && !!onToggleSelect && !!onSelectAll && !!onClearSelection;
  const columns = (compact ? 2 : 3) + (selectionEnabled ? 1 : 0);
  const rowHeight = compact ? 29 : 37;

  // Retain each browser's existing default order. Sorting/filtering derives from
  // the complete list, never from a viewport or a selected-row subset.
  const orderedFiles = useMemo(() => {
    let result = normalizedFilter
      ? files.filter(file => file.name.toLocaleLowerCase().includes(normalizedFilter))
      : files;
    if (sort.key !== null && (sort.key !== 'name' || sort.descending || defaultOrder === 'server')) {
      const startedAt = performance.now();
      result = [...result].sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        const primary = sort.key === 'size' ? a.size - b.size
          : sort.key === 'modifiedAt' ? a.modifiedAt.getTime() - b.modifiedAt.getTime()
          : a.name.localeCompare(b.name);
        const difference = primary || a.name.localeCompare(b.name);
        return sort.descending ? -difference : difference;
      });
      performance.clearMeasures('sftp:list:sort');
      performance.measure('sftp:list:sort', { start: startedAt, detail: { entries: result.length } });
    }
    return result;
  }, [files, normalizedFilter, sort, defaultOrder]);
  const allSelected = useMemo(
    () => orderedFiles.length > 0 && orderedFiles.every(file => selectedFiles?.has(file.path)),
    [orderedFiles, selectedFiles]
  );
  const getScrollElement = useCallback(() => tableRef.current?.parentElement ?? null, []);
  const estimateSize = useCallback(() => rowHeight, [rowHeight]);
  const getItemKey = useCallback(
    (index: number) => hasParent && index === 0 ? '..' : orderedFiles[index - parentRows].path,
    [hasParent, orderedFiles, parentRows]
  );
  const virtualizer = useVirtualizer<HTMLElement, HTMLTableRowElement>({
    count: orderedFiles.length + parentRows,
    getScrollElement,
    getItemKey,
    estimateSize,
    scrollMargin: headerHeight,
    overscan: 12,
  });
  const rows = virtualizer.getVirtualItems();
  const paddingTop = rows.length ? Math.max(0, rows[0].start - headerHeight) : 0;
  const paddingBottom = rows.length
    ? Math.max(0, virtualizer.getTotalSize() - rows[rows.length - 1].end + headerHeight)
    : virtualizer.getTotalSize();

  useLayoutEffect(() => {
    const height = headRef.current?.getBoundingClientRect().height;
    if (height) setHeaderHeight(height);
  }, [compact, isLoading, showFilter, files.length]);
  useLayoutEffect(() => {
    setFilter('');
    setShowFilter(false);
    if (tableRef.current?.parentElement) tableRef.current.parentElement.scrollTop = 0;
  }, [currentPath]);
  useLayoutEffect(() => {
    if (tableRef.current?.parentElement) tableRef.current.parentElement.scrollTop = 0;
  }, [normalizedFilter, sort]);
  useLayoutEffect(() => {
    if (showFilter) filterRef.current?.focus();
  }, [showFilter]);
  useLayoutEffect(() => {
    if (!isInitialized || error || !files.length || !rows.length || measuredFiles.current === files) return;
    measuredFiles.current = files;
    performance.clearMeasures('sftp:list:render');
    performance.measure('sftp:list:render', { start: renderStartedAt, detail: { entries: files.length } });
  }, [files, isInitialized, error, rows.length]);

  const sortHeader = (key: SortKey, label: string) => (
    <button
      type="button"
      aria-label={label}
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => setSort(current => ({ key, descending: current.key === key ? !current.descending : false }))}
    >
      {label}
      {sort.key === key && (sort.descending ? <ArrowDown className="w-3 h-3" aria-hidden /> : <ArrowUp className="w-3 h-3" aria-hidden />)}
    </button>
  );
  const sortDirection = (key: SortKey): React.AriaAttributes['aria-sort'] =>
    sort.key === key ? sort.descending ? 'descending' : 'ascending' : 'none';
  const cellPadding = compact ? 'px-2 py-1' : 'px-4 py-2';

  if (isLoading && !isInitialized) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-destructive mx-auto mb-2" />
          <p className="text-xs text-destructive">{t('files.failedToLoad')}</p>
          <Button variant="ghost" size="sm" onClick={onRetry} className="mt-2 no-drag">{t('files.retry')}</Button>
        </div>
      </div>
    );
  }

  // Narrow tiled panes scroll horizontally rather than overlapping the
  // Name/Search controls with the Size column.
  return (
    <table
      ref={tableRef}
      className={cn('w-full table-fixed', compact && (selectionEnabled ? 'min-w-64' : 'min-w-56'))}
      aria-rowcount={orderedFiles.length + parentRows + (showFilter ? 2 : 1)}
    >
      <thead ref={headRef} className="sticky top-0 bg-surface border-b border-border z-10">
        <tr>
          {selectionEnabled && (
            <th className="w-8 px-2 py-1 leading-none">
              <AppCheckbox checked={allSelected} className="inline-flex p-0" onCheckedChange={checked => {
                if (!selectedFiles || !onSelectAll) return;
                if (!normalizedFilter) {
                  if (checked) onSelectAll(orderedFiles.map(file => file.path));
                  else onClearSelection?.();
                } else {
                  const next = new Set(selectedFiles);
                  for (const file of orderedFiles) {
                    if (checked) next.add(file.path);
                    else next.delete(file.path);
                  }
                  onSelectAll([...next]);
                }
              }} />
            </th>
          )}
          <th className={`text-left text-xs font-semibold text-muted-foreground ${cellPadding}`} aria-sort={sortDirection('name')}>
            <div className="flex items-center gap-1">
              {sortHeader('name', t('files.name'))}
              {!!selectedFiles?.size && <span className="text-primary">({selectedFiles.size})</span>}
              <button type="button" aria-label={t('common.search')} title={t('common.search')} aria-expanded={showFilter} className="ml-auto p-0.5 hover:text-foreground" onClick={() => {
                if (showFilter) setFilter('');
                setShowFilter(value => !value);
              }}><Search className="w-3 h-3" /></button>
            </div>
          </th>
          <th className={`text-left text-xs font-semibold text-muted-foreground ${compact ? 'px-2 py-1 w-20' : 'px-4 py-2 w-24'}`} aria-sort={sortDirection('size')}>
            {sortHeader('size', t('files.size'))}
          </th>
          {!compact && <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2 w-36" aria-sort={sortDirection('modifiedAt')}>{sortHeader('modifiedAt', t('files.modified'))}</th>}
        </tr>
        {showFilter && <tr><th colSpan={columns} className="px-2 pb-1">
          <input ref={filterRef} type="search" aria-label={t('common.search')} placeholder={t('common.search')} value={filter} onChange={event => setFilter(event.target.value)} onKeyDown={event => {
            if (event.key === 'Escape') { setFilter(''); setShowFilter(false); }
          }} className="w-full rounded border border-border bg-background px-2 py-1 text-xs font-normal text-foreground" />
        </th></tr>}
      </thead>
      <tbody>
        {paddingTop > 0 && <tr aria-hidden><td colSpan={columns} style={{ height: paddingTop, padding: 0, border: 0 }} /></tr>}
        {rows.map(row => {
          if (hasParent && row.index === 0) return (
            <tr key={row.key} style={{ height: rowHeight }} className="border-b border-border hover:bg-secondary cursor-pointer" onDoubleClick={onNavigateUp}>
              {selectionEnabled && <td className={cellPadding} />}
              <td className={cellPadding}><div className="flex items-center gap-2"><Folder className="w-4 h-4 text-accent" /><span className="text-sm text-foreground">..</span></div></td>
              <td className={`${cellPadding} text-xs text-muted-foreground`}>-</td>
              {!compact && <td className="px-4 py-2 text-sm text-muted-foreground">-</td>}
            </tr>
          );
          const file = orderedFiles[row.index - parentRows];
          return (
            <tr key={row.key} aria-rowindex={row.index + (showFilter ? 3 : 2)} style={{ height: rowHeight }} className={cn('border-b border-border hover:bg-secondary cursor-pointer', selectedFiles?.has(file.path) && 'bg-primary')} draggable={dualPaneMode} onDragStart={event => onDragStart(event, file)} onDoubleClick={() => onFileDoubleClick(file)} onContextMenu={event => onContextMenu(event, file)}>
              {selectionEnabled && <td className="px-2 py-1 leading-none" onClick={event => event.stopPropagation()}><AppCheckbox checked={!!selectedFiles?.has(file.path)} onCheckedChange={() => onToggleSelect?.(file.path)} className="inline-flex p-0" /></td>}
              <td className={`${cellPadding} leading-none`}><div className="flex items-center gap-2 overflow-hidden">{getFileIcon(file)}<span title={file.name} className={`${compact ? 'text-xs' : 'text-sm'} text-foreground truncate`}>{file.name}</span></div></td>
              <td className={`${cellPadding} ${compact ? 'text-xs' : 'text-sm'} text-muted-foreground leading-none`}>{file.type === 'directory' ? '-' : formatBytes(file.size)}</td>
              {!compact && <td className="px-4 py-2 text-sm text-muted-foreground leading-none">{formatDate(file.modifiedAt)}</td>}
            </tr>
          );
        })}
        {paddingBottom > 0 && <tr aria-hidden><td colSpan={columns} style={{ height: paddingBottom, padding: 0, border: 0 }} /></tr>}
        {orderedFiles.length === 0 && <tr><td colSpan={columns} className="px-4 py-6 text-center text-sm text-muted-foreground">{t(files.length ? 'files.noMatches' : 'files.directoryEmpty')}</td></tr>}
      </tbody>
    </table>
  );
};
