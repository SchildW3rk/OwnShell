import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronLeft, Home, RefreshCw, Loader2, AlertCircle, HardDrive, Folder } from 'lucide-react';
import { AppCheckbox, Button, cn, formatBytes } from '@ownshell/ui';
import { getLocalFileIcon, LocalFileEntry } from './utils';

/**
 * Local Filesystem Pane
 */
export const LocalPane: React.FC<{
  onFileDragStart: (file: LocalFileEntry, path: string) => void;
  onDirectoryDragStart: (path: string) => void;
  isDropTarget: boolean;
  onDrop: (remotePath: string) => void;
  currentPath: string;
  onPathChange: (path: string) => void;
  refreshToken?: number;
  // Multi-select props (v1.16.0)
  selectedFiles: Set<string>;
  onToggleSelect: (path: string) => void;
  onSelectAll: (paths: string[]) => void;
  onClearSelection: () => void;
}> = ({
  onFileDragStart,
  onDirectoryDragStart,
  isDropTarget,
  onDrop,
  currentPath,
  onPathChange,
  refreshToken,
  selectedFiles,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}) => {
  const { t } = useTranslation();
  const [files, setFiles] = useState<LocalFileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Load directory contents
  const loadDirectory = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.sftpStandalone.listLocalDirectory(path);
      if (result.success && result.files) {
        setFiles(
          result.files.map((f) => ({
            name: f.name,
            path: f.path,
            type: f.isDirectory ? 'directory' : 'file',
            size: f.size || 0,
            modifiedAt: new Date(f.modifiedAt || Date.now()),
          }))
        );
      } else {
        setError(result.error?.message || 'Failed to load directory');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath, refreshToken, loadDirectory]);

  const navigateUp = useCallback(() => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      onPathChange('/' + parts.join('/') || '/');
    }
  }, [currentPath, onPathChange]);

  const navigateInto = useCallback(
    (dirName: string) => {
      const newPath = currentPath.endsWith('/')
        ? `${currentPath}${dirName}`
        : `${currentPath}/${dirName}`;
      onPathChange(newPath);
    },
    [currentPath, onPathChange]
  );

  const handleDoubleClick = useCallback(
    (file: LocalFileEntry) => {
      if (file.type === 'directory') {
        navigateInto(file.name);
      }
    },
    [navigateInto]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, file: LocalFileEntry) => {
      e.dataTransfer.setData(
        'application/json',
        JSON.stringify({
          type: 'local',
          file,
          sourcePath: currentPath,
        })
      );
      e.dataTransfer.effectAllowed = 'copy';
      if (file.type === 'directory') {
        onDirectoryDragStart(file.path);
      } else {
        onFileDragStart(file, currentPath);
      }
    },
    [currentPath, onFileDragStart, onDirectoryDragStart]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (isDropTarget) {
        e.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
      }
    },
    [isDropTarget]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!isDropTarget) return;

      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.type === 'remote') {
          onDrop(data.file.path);
        }
      } catch (err) {
        console.error('Drop parse error:', err);
      }
    },
    [isDropTarget, onDrop]
  );

    const pathParts = currentPath.split('/').filter(Boolean);
  const breadcrumbs = pathParts.slice(-2);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: drag-drop zone for local files
    <div
      className={cn(
        'flex flex-col h-full bg-background',
        isDragOver && 'ring-2 ring-primary ring-inset'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-surface border-b border-border">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <HardDrive className="w-4 h-4 text-primary flex-shrink-0" />
          <Button
            variant="ghost"
            size="sm"
            onClick={navigateUp}
            disabled={isLoading || currentPath === '/'}
            className="no-drag p-1"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPathChange('/')}
            className="no-drag p-1"
            disabled={isLoading}
          >
            <Home className="w-3.5 h-3.5" />
          </Button>
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            {breadcrumbs.map((part) => (
              <React.Fragment key={`local-${part}`}>
                <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-foreground truncate">{part}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => loadDirectory(currentPath)}
          className="no-drag p-1"
          disabled={isLoading}
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* File List - Local */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center">
              <AlertCircle className="w-6 h-6 text-destructive mx-auto mb-2" />
              <p className="text-xs text-destructive">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadDirectory(currentPath)}
                className="mt-2 no-drag"
              >
                {t('files.retry')}
              </Button>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface border-b border-border z-10">
              <tr>
                <th className="w-8 px-2 py-1">
                  <AppCheckbox
                    checked={files.length > 0 && files.every((f) => selectedFiles.has(f.path))}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onSelectAll(files.map((f) => f.path));
                      } else {
                        onClearSelection();
                      }
                    }}
                    className="inline-flex p-0"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-2 py-1">
                  {t('files.name')}
                  {selectedFiles.size > 0 && (
                    <span className="ml-2 text-primary">({selectedFiles.size})</span>
                  )}
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-2 py-1 w-20">
                  {t('files.size')}
                </th>
              </tr>
            </thead>
            <tbody>
              {currentPath !== '/' && (
                <tr
                  className="border-b border-border hover:bg-secondary cursor-pointer"
                  onDoubleClick={navigateUp}
                >
                  <td className="px-2 py-1" />
                  <td className="px-2 py-1 flex items-center gap-2">
                    <Folder className="w-4 h-4 text-accent" />
                    <span className="text-sm text-foreground">..</span>
                  </td>
                  <td className="px-2 py-1 text-sm text-muted-foreground">-</td>
                </tr>
              )}
              {files.map((file) => (
                <tr
                  key={file.path}
                  className={cn(
                    'border-b border-border hover:bg-secondary cursor-pointer',
                    selectedFiles.has(file.path) && 'bg-primary'
                  )}
                  draggable
                  onDragStart={(e) => handleDragStart(e, file)}
                  onDoubleClick={() => handleDoubleClick(file)}
                >
                  <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                    <AppCheckbox
                      checked={selectedFiles.has(file.path)}
                      onCheckedChange={() => onToggleSelect(file.path)}
                      className="inline-flex p-0"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-2">
                      {getLocalFileIcon(file)}
                      <span className="text-xs text-foreground truncate">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1 text-xs text-muted-foreground">
                    {file.type === 'directory' ? '-' : formatBytes(file.size)}
                  </td>
                </tr>
              ))}
              {files.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('files.directoryEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
