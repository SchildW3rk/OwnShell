/**
 * S3 Object Browser
 *
 * Displays objects within a bucket with breadcrumbs, context menu,
 * image preview tooltip, and file operations.
 */

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderOpen,
  File,
  Trash2,
  RefreshCw,
  Loader2,
  ChevronRight,
  Settings,
  ArrowLeft,
  ExternalLink,
  Download,
  Copy,
  MoreVertical,
} from 'lucide-react';
import { Button, Tabs, cn, formatBytes } from '@ownshell/ui';
import { S3Object } from '@ownshell/core';
import { S3CORSEditor } from '../S3CORSEditor';
import { UseMutationResult } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { S3ObjectsQuery } from '../../hooks/s3/useS3Queries';
import { isImageFile, formatDate } from './s3-utils';

type S3Tab = 'files' | 'settings';
const EMPTY_OBJECTS: S3Object[] = [];

interface S3ObjectBrowserProps {
  connectionId: string;
  currentBucket: string;
  currentPrefix: string;
  objectsQuery: S3ObjectsQuery;
  deleteMutation: UseMutationResult<{ deleted: number; errors: number }, Error, string[]>;
  presignedUrlMutation: UseMutationResult<string, Error, string>;
  onPrefixChange: (prefix: string) => void;
  onBackToBuckets: () => void;
}

export const S3ObjectBrowser: React.FC<S3ObjectBrowserProps> = ({
  connectionId,
  currentBucket,
  currentPrefix,
  objectsQuery,
  deleteMutation,
  presignedUrlMutation,
  onPrefixChange,
  onBackToBuckets,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<S3Tab>('files');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    obj: { key: string; name: string; isFolder: boolean };
  } | null>(null);

  // Image preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequest = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Navigation-owned UI must not survive into a frame for another bucket or prefix.
  useLayoutEffect(() => {
    previewRequest.current++;
    setPreviewUrl(null);
    setPreviewPosition(null);
    setPreviewLoading(false);
    setContextMenu(null);
    setSelectedKeys((keys) => keys.size === 0 ? keys : new Set<string>());
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
    return () => { previewRequest.current++; };
  }, [connectionId, currentBucket, currentPrefix]);

  // Computed breadcrumbs
  const breadcrumbs = useMemo(() => {
    if (!currentPrefix) return [];
    return currentPrefix.split('/').filter(Boolean);
  }, [currentPrefix]);

  const objects = objectsQuery.data?.objects ?? EMPTY_OBJECTS;
  const isLoadingObjects = objectsQuery.isFetching;
  const virtualizer = useVirtualizer({
    count: objects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 49,
    overscan: 10,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = virtualRows.length
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  // Navigation functions
  const navigateToFolder = (prefix: string) => {
    onPrefixChange(prefix);
  };

  const navigateUp = () => {
    if (!currentPrefix) return;
    const parts = currentPrefix.split('/').filter(Boolean);
    parts.pop();
    const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
    onPrefixChange(newPrefix);
  };

  const navigateToBreadcrumb = (index: number) => {
    if (index < 0) {
      onPrefixChange('');
    } else {
      const newPrefix = breadcrumbs.slice(0, index + 1).join('/') + '/';
      onPrefixChange(newPrefix);
    }
  };

  const handleObjectClick = (obj: { key: string; isFolder: boolean }) => {
    if (obj.isFolder) {
      navigateToFolder(obj.key);
    }
  };

  const handleObjectDoubleClick = async (obj: { key: string; isFolder: boolean }) => {
    if (obj.isFolder) {
      navigateToFolder(obj.key);
    } else {
      const url = await presignedUrlMutation.mutateAsync(obj.key);
      if (url) {
        window.open(url, '_blank');
      }
    }
  };

  const handleSelectToggle = (key: string, isFolder: boolean) => {
    if (isFolder) return;

    const newSelection = new Set(selectedKeys);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    setSelectedKeys(newSelection);
  };

  const handleDelete = async () => {
    if (selectedKeys.size === 0) return;

    const count = selectedKeys.size;
    if (!confirm(t('s3.deleteObjectsConfirm', { count }))) {
      return;
    }

    await deleteMutation.mutateAsync(Array.from(selectedKeys));
    setSelectedKeys(new Set());
  };

  const handleRefresh = () => {
    objectsQuery.refetch();
  };

  // Context menu handlers
  const handleContextMenu = (
    e: React.MouseEvent,
    obj: { key: string; name: string; isFolder: boolean }
  ) => {
    if (obj.isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, obj });
  };

  const handleContextMenuAction = async (action: 'open' | 'copy') => {
    if (!contextMenu) return;

    const url = await presignedUrlMutation.mutateAsync(contextMenu.obj.key);
    if (url) {
      if (action === 'open') {
        window.open(url, '_blank');
      } else {
        await navigator.clipboard.writeText(url);
      }
    }
    setContextMenu(null);
  };

  // Image preview handlers
  const handleImageHover = async (
    e: React.MouseEvent,
    obj: { key: string; name: string; isFolder: boolean }
  ) => {
    if (obj.isFolder || !isImageFile(obj.name)) return;

    const request = ++previewRequest.current;
    const rect = e.currentTarget.getBoundingClientRect();
    setPreviewUrl(null);
    setPreviewPosition({ x: rect.right + 10, y: rect.top });
    setPreviewLoading(true);

    try {
      const url = await presignedUrlMutation.mutateAsync(obj.key);
      if (request === previewRequest.current) setPreviewUrl(url);
    } catch {
      // The mutation reports signing errors; an older request must not change the current preview.
    } finally {
      if (request === previewRequest.current) setPreviewLoading(false);
    }
  };

  const handleImageLeave = () => {
    previewRequest.current++;
    setPreviewUrl(null);
    setPreviewPosition(null);
    setPreviewLoading(false);
  };

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null);
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
    return undefined;
  }, [contextMenu]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header with Breadcrumbs */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBackToBuckets}
            className="no-drag flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-1 text-sm min-w-0 overflow-hidden">
            <button
              type="button"
              onClick={() => navigateToBreadcrumb(-1)}
              className="text-primary hover:underline flex-shrink-0"
            >
              {currentBucket}
            </button>
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={breadcrumbs.slice(0, idx + 1).join('/')}>
                <ChevronRight className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
                <button
                  type="button"
                  onClick={() => navigateToBreadcrumb(idx)}
                  className={cn(
                    'truncate',
                    idx === breadcrumbs.length - 1
                      ? 'text-foreground'
                      : 'text-primary hover:underline'
                  )}
                >
                  {crumb}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedKeys.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="no-drag text-destructive"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1" />
                  {t('common.delete')} ({selectedKeys.size})
                </>
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoadingObjects}
            className="no-drag"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingObjects ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'files', label: t('tabs.files'), icon: <FolderOpen className="w-4 h-4" /> },
          { id: 'settings', label: t('common.settings'), icon: <Settings className="w-4 h-4" /> },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as S3Tab)}
        className="bg-surface no-drag"
      />

      {/* Tab Content */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'files' ? (
          isLoadingObjects && objects.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : objects.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">{t('s3.folderEmpty')}</p>
              </div>
            </div>
          ) : (
            <table className="w-full" aria-rowcount={objects.length + 1 + (currentPrefix ? 1 : 0)}>
              <thead className="sticky top-0 bg-surface text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="w-10 px-2 py-2" />
                  <th className="text-left px-4 py-2 font-medium">{t('files.name')}</th>
                  <th className="text-right px-4 py-2 font-medium w-24">{t('files.size')}</th>
                  <th className="text-right px-4 py-2 font-medium min-w-[180px]">{t('files.modified')}</th>
                  <th className="w-20 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {currentPrefix && (
                  <tr className="hover:bg-surface cursor-pointer" onClick={() => navigateUp()}>
                    <td className="px-2 py-2 align-middle" />
                    <td className="px-4 py-2 align-middle">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-[#DCAD5A]" />
                        <span className="text-sm text-foreground">..</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-muted-foreground/60 align-middle">
                      -
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-muted-foreground/60 align-middle whitespace-nowrap">
                      -
                    </td>
                    <td className="px-2 py-2 align-middle" />
                  </tr>
                )}
                {paddingTop > 0 && (
                  <tr aria-hidden="true" style={{ border: 0 }}>
                    <td colSpan={5} style={{ height: paddingTop, padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualRows.map((row) => {
                  const obj = objects[row.index];
                  return (
                  <tr
                    key={obj.key}
                    data-index={row.index}
                    aria-rowindex={row.index + 2 + (currentPrefix ? 1 : 0)}
                    ref={virtualizer.measureElement}
                    className={cn(
                      'hover:bg-surface cursor-pointer transition-colors',
                      selectedKeys.has(obj.key) && 'bg-primary/20'
                    )}
                    onClick={() => handleObjectClick(obj)}
                    onDoubleClick={() => handleObjectDoubleClick(obj)}
                    onContextMenu={(e) => handleContextMenu(e, obj)}
                  >
                    <td className="px-2 py-2 align-middle">
                      <div className="flex items-center justify-center h-full">
                        {!obj.isFolder && (
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(obj.key)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleSelectToggle(obj.key, obj.isFolder);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <div
                        className="flex items-center gap-2"
                        onMouseEnter={(e) => handleImageHover(e, obj)}
                        onMouseLeave={handleImageLeave}
                      >
                        {obj.isFolder ? (
                          <FolderOpen className="w-4 h-4 text-[#DCAD5A]" />
                        ) : (
                          <File className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span
                          className="text-sm text-foreground truncate max-w-[300px]"
                          title={obj.name}
                        >
                          {obj.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-muted-foreground align-middle">
                      {obj.isFolder ? '-' : formatBytes(obj.size)}
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-muted-foreground align-middle whitespace-nowrap">
                      {obj.isFolder ? '-' : formatDate(obj.lastModified)}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      {!obj.isFolder && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const url = await presignedUrlMutation.mutateAsync(obj.key);
                              if (url) window.open(url, '_blank');
                            }}
                            className="no-drag"
                            title={t('s3.openInBrowser')}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleContextMenu(e, obj)}
                            className="no-drag"
                            title={t('snippets.moreActions')}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true" style={{ border: 0 }}>
                    <td colSpan={5} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          )
        ) : (
          <S3CORSEditor connectionId={connectionId} bucket={currentBucket} />
        )}
      </div>
      {activeTab === 'files' && (
        <>
          {objectsQuery.isError && (
            <div role="alert" className="px-4 py-2 text-sm text-destructive border-t border-border">
              {objectsQuery.error.message}
              {!objectsQuery.hasNextPage && (
                <Button variant="ghost" size="sm" onClick={() => objectsQuery.refetch()}>
                  {t('s3.retry')}
                </Button>
              )}
            </div>
          )}
          {objectsQuery.hasNextPage && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border text-sm">
              <span className="text-muted-foreground">{t('s3.objectCount', { count: objects.length })}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={objectsQuery.isFetching}
                onClick={() => objectsQuery.fetchNextPage()}
              >
                {objectsQuery.isFetchingNextPage ? t('s3.loadingMore') : t('s3.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          role="menu"
          className="fixed bg-surface border border-border rounded-md shadow-xl py-1 z-50 w-48"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - 100),
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.key === 'Escape' && setContextMenu(null)}
        >
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-primary hover:text-white transition-colors text-left"
            onClick={() => handleContextMenuAction('open')}
          >
            <Download className="w-4 h-4" />
            {t('s3.downloadOpen')}
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-primary hover:text-white transition-colors text-left"
            onClick={() => handleContextMenuAction('copy')}
          >
            <Copy className="w-4 h-4" />
            {t('s3.copyUrl')}
          </button>
        </div>
      )}

      {/* Image Preview Tooltip */}
      {previewPosition && (previewLoading || previewUrl) && (
        <div
          className="fixed pointer-events-none bg-surface border border-border rounded-lg shadow-xl p-2 z-50"
          style={{
            left: Math.min(previewPosition.x, window.innerWidth - 220),
            top: Math.min(previewPosition.y, window.innerHeight - 220),
          }}
        >
          {previewLoading ? (
            <div className="w-48 h-48 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : previewUrl ? (
            <img
              key={previewUrl}
              src={previewUrl}
              alt="Preview"
              className="max-w-48 max-h-48 object-contain rounded"
              onError={() => setPreviewUrl(null)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
};
