import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SFTPFileEntry } from '@ownshell/core';
import { useSFTPStandaloneFiles, useSFTPStandaloneMutations } from '../../../hooks/sftp';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  Home,
  Loader2,
  RefreshCw,
  Server,
} from 'lucide-react';
import { Button, cn } from '@ownshell/ui';
import toast from 'react-hot-toast';
import { RemotePaneOverlays } from './RemotePaneOverlays';
import { isTextFile, joinRemotePath } from './utils';
import { SFTPPaneFileTable } from '../pane/SFTPPaneFileTable';

/**
 * Remote SFTP Pane
 */
export const RemotePane: React.FC<{
  connectionId: string | null;
  isConnecting: boolean;
  connectionError: string | null;
  onFileDragStart: (file: SFTPFileEntry, path: string) => void;
  onDirectoryDragStart: (path: string, file: SFTPFileEntry) => void;
  isDropTarget: boolean;
  onDrop: (localPath: string, isDirectory: boolean) => void;
  currentPath: string;
  onPathChange: (path: string) => void;
  // Multi-select props (v1.16.0)
  selectedFiles: Set<string>;
  onToggleSelect: (path: string) => void;
  onSelectAll: (paths: string[]) => void;
  onClearSelection: () => void;
}> = ({
  connectionId,
  isConnecting,
  connectionError,
  onFileDragStart,
  onDirectoryDragStart,
  isDropTarget,
  onDrop,
  currentPath,
  onPathChange,
  selectedFiles,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}) => {
  const { t } = useTranslation();
  const filesQuery = useSFTPStandaloneFiles(connectionId, currentPath);
  const mutations = useSFTPStandaloneMutations(connectionId);
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: SFTPFileEntry;
  } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ file: SFTPFileEntry; newName: string } | null>(
    null
  );
  const [showMkdirDialog, setShowMkdirDialog] = useState(false);
  const [mkdirName, setMkdirName] = useState('New Folder');
  const [showCreateFileDialog, setShowCreateFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('new-file.txt');
  const [deleteConfirm, setDeleteConfirm] = useState<SFTPFileEntry | null>(null);
  const [permissionsFile, setPermissionsFile] = useState<SFTPFileEntry | null>(null);
  const [editorFile, setEditorFile] = useState<SFTPFileEntry | null>(null);
  const [editorContent, setEditorContent] = useState<string>('');
  const [editorEncoding, setEditorEncoding] = useState<'utf-8' | 'latin1'>('utf-8');
  const [editorLoadError, setEditorLoadError] = useState<string | null>(null);

  const files = filesQuery.data || [];
  const isLoading = filesQuery.isFetching;
  const error = filesQuery.error?.message;

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const navigateUp = useCallback(() => {
    if (currentPath === '/' || currentPath === '.') return;
    const parts = currentPath.split('/').filter((p) => p);
    parts.pop();
    const parentPath = currentPath.startsWith('/')
      ? parts.length > 0
        ? '/' + parts.join('/')
        : '/'
      : parts.length > 0
        ? parts.join('/')
        : '.';
    onPathChange(parentPath);
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

  const openFileEditor = useCallback(
    (file: SFTPFileEntry) => {
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        setEditorLoadError(t('editor.fileTooLarge'));
        setEditorFile(file);
        return;
      }
      setEditorFile(file);
      setEditorContent('');
      setEditorLoadError(null);
      mutations.readFile.mutate(
        { path: file.path, maxSize },
        {
          onSuccess: ({ content, encoding }) => {
            setEditorContent(content);
            setEditorEncoding(encoding);
          },
          onError: (err) => setEditorLoadError(err.message),
        }
      );
    },
    [mutations.readFile, t]
  );

  const handleDoubleClick = useCallback(
    (file: SFTPFileEntry) => {
      if (file.type === 'directory') {
        navigateInto(file.name);
      } else if (isTextFile(file.name)) {
        openFileEditor(file);
      }
    },
    [navigateInto, openFileEditor]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, file: SFTPFileEntry) => {
    e.preventDefault();
    const menuWidth = 180;
    const menuHeight = 200;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    setContextMenu({ x, y, file });
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent, file: SFTPFileEntry) => {
      e.dataTransfer.setData(
        'application/json',
        JSON.stringify({
          type: 'remote',
          file,
          sourcePath: currentPath,
        })
      );
      e.dataTransfer.effectAllowed = 'copy';
      if (file.type === 'directory') {
        onDirectoryDragStart(file.path, file);
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
        if (data.type === 'local') {
          onDrop(data.file.path, data.file.type === 'directory');
        }
      } catch (err) {
        console.error('Drop parse error:', err);
      }
    },
    [isDropTarget, onDrop]
  );

  const createFile = useCallback(() => {
    const fileName = newFileName.trim();
    if (!fileName) return;

    if (files.some((file) => file.name === fileName)) {
      toast.error(t('files.alreadyExists', { name: fileName }));
      return;
    }

    mutations.writeFile.mutate(
      { path: joinRemotePath(currentPath, fileName), content: '', encoding: 'utf-8' },
      {
        onSuccess: () => {
          setShowCreateFileDialog(false);
          setNewFileName('new-file.txt');
        },
      }
    );
  }, [currentPath, files, mutations.writeFile, newFileName, t]);

  const pathParts = currentPath.split('/').filter((p) => p && p !== '.');
  const breadcrumbs = pathParts.slice(-2);
  const actionButtonClass = 'no-drag relative group p-1';
  const tooltipClass =
    'pointer-events-none absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100';

  // Connecting state
  if (isConnecting) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t('files.establishingConnection')}</p>
        </div>
      </div>
    );
  }

  // Connection error
  if (connectionError) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive">{connectionError}</p>
        </div>
      </div>
    );
  }

  // Not connected yet
  if (!connectionId) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">{t('files.establishingConnection')}</p>
        </div>
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: drag-drop zone for remote files
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
          <Server className="w-4 h-4 text-primary flex-shrink-0" />
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
              <React.Fragment key={`remote-${part}`}>
                <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-foreground truncate">{part}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => filesQuery.refetch()}
            className={actionButtonClass}
            disabled={isLoading}
            title={t('files.refresh')}
            aria-label={t('files.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            <span className={tooltipClass}>{t('files.refresh')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNewFileName('new-file.txt');
              setShowCreateFileDialog(true);
            }}
            className={actionButtonClass}
            disabled={isLoading}
            title={t('files.newFile')}
            aria-label={t('files.newFile')}
          >
            <FilePlus2 className="w-4 h-4" />
            <span className={tooltipClass}>{t('files.newFile')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMkdirDialog(true)}
            className={actionButtonClass}
            disabled={isLoading}
            title={t('files.newFolder')}
            aria-label={t('files.newFolder')}
          >
            <FolderPlus className="w-4 h-4" />
            <span className={tooltipClass}>{t('files.newFolder')}</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <SFTPPaneFileTable
          files={files}
          currentPath={currentPath}
          compact
          dualPaneMode
          defaultOrder="server"
          isLoading={isLoading}
          isInitialized={filesQuery.isSuccess || filesQuery.isError}
          error={error}
          onRetry={() => filesQuery.refetch()}
          onNavigateUp={navigateUp}
          onFileDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onDragStart={handleDragStart}
          selectedFiles={selectedFiles}
          onToggleSelect={onToggleSelect}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
        />
      </div>

      <RemotePaneOverlays
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        openFileEditor={openFileEditor}
        renameDialog={renameDialog}
        setRenameDialog={setRenameDialog}
        showMkdirDialog={showMkdirDialog}
        setShowMkdirDialog={setShowMkdirDialog}
        mkdirName={mkdirName}
        setMkdirName={setMkdirName}
        showCreateFileDialog={showCreateFileDialog}
        setShowCreateFileDialog={setShowCreateFileDialog}
        newFileName={newFileName}
        setNewFileName={setNewFileName}
        onCreateFile={createFile}
        deleteConfirm={deleteConfirm}
        setDeleteConfirm={setDeleteConfirm}
        permissionsFile={permissionsFile}
        setPermissionsFile={setPermissionsFile}
        editorFile={editorFile}
        setEditorFile={setEditorFile}
        editorContent={editorContent}
        editorEncoding={editorEncoding}
        setEditorContent={setEditorContent}
        editorLoadError={editorLoadError}
        setEditorLoadError={setEditorLoadError}
        currentPath={currentPath}
        mutations={mutations}
      />
    </div>
  );
};
