/**
 * SFTP Pane - Reusable File Browser Component
 *
 * A single file browser pane that can be used standalone or in a dual-pane layout.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useChmod,
  useCreateDirectory,
  useDeleteFile,
  useDownloadFile,
  useReadFile,
  useRenameFile,
  useSFTPFiles,
  useUploadFile,
  useWriteFile,
} from '../../hooks/sftp';
import type { SFTPFileEntry } from '@ownshell/core';
import { Loader2 } from 'lucide-react';
import { PermissionsModal } from './PermissionsModal';
import { FileEditor } from './FileEditor';
import { SFTPPaneContextMenu } from './pane/SFTPPaneContextMenu';
import {
  CreateFileDialog,
  DeleteDialog,
  MkdirDialog,
  RenameDialog,
} from './pane/SFTPPaneDialogs';
import { SFTPPaneFileTable } from './pane/SFTPPaneFileTable';
import { SFTPPaneHeader } from './pane/SFTPPaneHeader';
import type {
  SFTPContextMenuState,
  SFTPPaneProps,
  SFTPRenameDialogState,
} from './pane/types';
import { isTextFile, joinRemotePath } from './pane/utils';
import toast from 'react-hot-toast';

export type { SFTPPaneProps } from './pane/types';

export const SFTPPane: React.FC<SFTPPaneProps> = ({
  sshSessionId,
  paneId,
  compact = false,
  sessionLabel: _sessionLabel,
  onFileDragStart,
  onFileDrop,
  isDropTarget = false,
  onCopyToOtherPane,
  dualPaneMode = false,
  onPathChange,
}) => {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState<string>('.');
  const [isDragOver, setIsDragOver] = useState(false);

  const filesQuery = useSFTPFiles(sshSessionId, currentPath);
  const downloadMutation = useDownloadFile(sshSessionId);
  const uploadMutation = useUploadFile(sshSessionId, currentPath);
  const deleteMutation = useDeleteFile(sshSessionId, currentPath);
  const mkdirMutation = useCreateDirectory(sshSessionId, currentPath);
  const renameMutation = useRenameFile(sshSessionId, currentPath);
  const chmodMutation = useChmod(sshSessionId, currentPath);
  const readFileMutation = useReadFile(sshSessionId);
  const writeFileMutation = useWriteFile(sshSessionId, currentPath);

  const [contextMenu, setContextMenu] = useState<SFTPContextMenuState | null>(null);
  const [renameDialog, setRenameDialog] = useState<SFTPRenameDialogState | null>(null);
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

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const updateCurrentPath = useCallback(
    (path: string) => {
      setCurrentPath(path);
      onPathChange?.(path);
    },
    [onPathChange]
  );

  const navigateToPath = useCallback((path: string) => {
    updateCurrentPath(path);
  }, [updateCurrentPath]);

  const navigateUp = useCallback(() => {
    if (currentPath === '/' || currentPath === '.') return;
    const parts = currentPath.split('/').filter((part) => part);
    parts.pop();
    const parentPath = currentPath.startsWith('/')
      ? parts.length > 0
        ? '/' + parts.join('/')
        : '/'
      : parts.length > 0
        ? parts.join('/')
        : '.';
    updateCurrentPath(parentPath);
  }, [currentPath, updateCurrentPath]);

  const navigateInto = useCallback(
    (dirName: string) => {
      const newPath = currentPath.endsWith('/')
        ? `${currentPath}${dirName}`
        : `${currentPath}/${dirName}`;
      updateCurrentPath(newPath);
    },
    [currentPath, updateCurrentPath]
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
      readFileMutation.mutate(
        { path: file.path, maxSize },
        {
          onSuccess: ({ content, encoding }) => {
            setEditorContent(content);
            setEditorEncoding(encoding);
          },
          onError: (error) => setEditorLoadError(error.message),
        }
      );
    },
    [readFileMutation, t]
  );

  const handleFileDoubleClick = useCallback(
    (file: SFTPFileEntry) => {
      if (file.type === 'directory') {
        navigateInto(file.name);
      } else if (isTextFile(file.name)) {
        openFileEditor(file);
      } else {
        downloadMutation.mutate(file);
      }
    },
    [navigateInto, openFileEditor, downloadMutation]
  );

  const handleContextMenu = useCallback((event: React.MouseEvent, file: SFTPFileEntry) => {
    event.preventDefault();
    const menuWidth = 180;
    const menuHeight = 200;
    let x = event.clientX;
    let y = event.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    setContextMenu({ x, y, file });
  }, []);

  const handleDragStart = useCallback(
    (event: React.DragEvent, file: SFTPFileEntry) => {
      event.dataTransfer.setData(
        'application/json',
        JSON.stringify({
          type: 'remote',
          file,
          sourcePath: currentPath,
          sourcePane: paneId,
          sshSessionId,
        })
      );
      event.dataTransfer.effectAllowed = 'copy';
      onFileDragStart?.(file, currentPath);
    },
    [currentPath, paneId, sshSessionId, onFileDragStart]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (isDropTarget) {
        event.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
      }
    },
    [isDropTarget]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);

      if (!isDropTarget) return;

      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'));
        if (data.sourcePane !== paneId) {
          onFileDrop?.(data.file, data.sourcePath, currentPath);
        }
      } catch (error) {
        console.error('Drop parse error:', error);
      }
    },
    [isDropTarget, paneId, currentPath, onFileDrop]
  );

  const closeMkdirDialog = () => {
    setShowMkdirDialog(false);
    setMkdirName('New Folder');
  };

  const createDirectory = () => {
    if (mkdirName.trim()) {
      mkdirMutation.mutate(mkdirName.trim(), { onSuccess: closeMkdirDialog });
    }
  };

  const closeCreateFileDialog = () => {
    setShowCreateFileDialog(false);
    setNewFileName('new-file.txt');
  };

  const createFile = () => {
    const fileName = newFileName.trim();
    if (!fileName) return;

    if (files.some((file) => file.name === fileName)) {
      toast.error(t('files.alreadyExists', { name: fileName }));
      return;
    }

    writeFileMutation.mutate(
      { path: joinRemotePath(currentPath, fileName), content: '', encoding: 'utf-8' },
      { onSuccess: closeCreateFileDialog }
    );
  };

  const renameFile = () => {
    if (renameDialog?.newName.trim()) {
      renameMutation.mutate({
        file: renameDialog.file,
        newName: renameDialog.newName.trim(),
      });
      setRenameDialog(null);
    }
  };

  const closeEditor = () => {
    setEditorFile(null);
    setEditorContent('');
    setEditorLoadError(null);
  };

  if (!sshSessionId) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t('files.establishingConnection')}</p>
        </div>
      </div>
    );
  }

  const files = filesQuery.data || [];
  const isLoading = filesQuery.isFetching;
  const error = filesQuery.error?.message;
  const isInitialized = filesQuery.isSuccess || filesQuery.isError;

  return (
    <div
      className={`flex flex-col h-full bg-background ${isDragOver ? 'ring-2 ring-primary ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <SFTPPaneHeader
        currentPath={currentPath}
        compact={compact}
        isLoading={isLoading}
        isUploading={uploadMutation.isPending}
        onNavigateToPath={navigateToPath}
        onNavigateUp={navigateUp}
        onRefresh={() => filesQuery.refetch()}
        onUpload={() => uploadMutation.mutate()}
        onOpenCreateFileDialog={() => {
          setNewFileName('new-file.txt');
          setShowCreateFileDialog(true);
        }}
        onOpenMkdirDialog={() => {
          setMkdirName('New Folder');
          setShowMkdirDialog(true);
        }}
      />

      <div className="flex-1 min-h-0 overflow-auto">
        <SFTPPaneFileTable
          files={files}
          currentPath={currentPath}
          compact={compact}
          dualPaneMode={dualPaneMode}
          isLoading={isLoading}
          isInitialized={isInitialized}
          error={error}
          onRetry={() => filesQuery.refetch()}
          onNavigateUp={navigateUp}
          onFileDoubleClick={handleFileDoubleClick}
          onContextMenu={handleContextMenu}
          onDragStart={handleDragStart}
        />
      </div>

      {contextMenu && (
        <SFTPPaneContextMenu
          contextMenu={contextMenu}
          currentPath={currentPath}
          dualPaneMode={dualPaneMode}
          onDownload={(file) => {
            downloadMutation.mutate(file);
            setContextMenu(null);
          }}
          onCopyToOtherPane={(file, path) => {
            onCopyToOtherPane?.(file, path);
            setContextMenu(null);
          }}
          onEdit={(file) => {
            openFileEditor(file);
            setContextMenu(null);
          }}
          onRename={(file) => {
            setRenameDialog({ file, newName: file.name });
            setContextMenu(null);
          }}
          onPermissions={(file) => {
            setPermissionsFile(file);
            setContextMenu(null);
          }}
          onDelete={(file) => {
            setDeleteConfirm(file);
            setContextMenu(null);
          }}
        />
      )}

      <RenameDialog
        renameDialog={renameDialog}
        isPending={renameMutation.isPending}
        onClose={() => setRenameDialog(null)}
        onNameChange={(newName) =>
          renameDialog && setRenameDialog({ ...renameDialog, newName })
        }
        onSave={renameFile}
      />

      <MkdirDialog
        isOpen={showMkdirDialog}
        mkdirName={mkdirName}
        isPending={mkdirMutation.isPending}
        onClose={closeMkdirDialog}
        onNameChange={setMkdirName}
        onCreate={createDirectory}
      />

      <CreateFileDialog
        isOpen={showCreateFileDialog}
        fileName={newFileName}
        isPending={writeFileMutation.isPending}
        onClose={closeCreateFileDialog}
        onNameChange={setNewFileName}
        onCreate={createFile}
      />

      <DeleteDialog
        file={deleteConfirm}
        isPending={deleteMutation.isPending}
        onClose={() => setDeleteConfirm(null)}
        onDelete={() => {
          if (deleteConfirm) {
            deleteMutation.mutate(deleteConfirm);
            setDeleteConfirm(null);
          }
        }}
      />

      {permissionsFile && (
        <PermissionsModal
          file={permissionsFile}
          isOpen={!!permissionsFile}
          onClose={() => setPermissionsFile(null)}
          onSave={(mode) => {
            chmodMutation.mutate(
              { file: permissionsFile, mode },
              { onSuccess: () => setPermissionsFile(null) }
            );
          }}
          isPending={chmodMutation.isPending}
        />
      )}

      {editorFile && (
        <FileEditor
          file={editorFile}
          isOpen={!!editorFile}
          onClose={closeEditor}
          onSave={(content) => {
            writeFileMutation.mutate(
              { path: editorFile.path, content, encoding: editorEncoding },
              { onSuccess: closeEditor }
            );
          }}
          initialContent={editorContent}
          encoding={editorEncoding}
          isLoading={readFileMutation.isPending}
          isSaving={writeFileMutation.isPending}
          loadError={editorLoadError}
        />
      )}
    </div>
  );
};
