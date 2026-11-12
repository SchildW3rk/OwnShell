import { useTranslation } from 'react-i18next';
import { SFTPFileEntry } from '@ownshell/core';
import { Edit3, FileCode, Loader2, Shield, Trash2 } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { FileEditor } from '../FileEditor';
import { PermissionsModal } from '../PermissionsModal';
import { isTextFile } from './utils';
import { CreateFileDialog } from '../pane/SFTPPaneDialogs';

type Mutations = any;

interface ContextMenuState {
  x: number;
  y: number;
  file: SFTPFileEntry;
}

interface RenameDialogState {
  file: SFTPFileEntry;
  newName: string;
}

export interface RemotePaneOverlaysProps {
  contextMenu: ContextMenuState | null;
  setContextMenu: (value: ContextMenuState | null) => void;
  openFileEditor: (file: SFTPFileEntry) => void;
  renameDialog: RenameDialogState | null;
  setRenameDialog: (value: RenameDialogState | null) => void;
  showMkdirDialog: boolean;
  setShowMkdirDialog: (value: boolean) => void;
  mkdirName: string;
  setMkdirName: (value: string) => void;
  showCreateFileDialog: boolean;
  setShowCreateFileDialog: (value: boolean) => void;
  newFileName: string;
  setNewFileName: (value: string) => void;
  onCreateFile: () => void;
  deleteConfirm: SFTPFileEntry | null;
  setDeleteConfirm: (value: SFTPFileEntry | null) => void;
  permissionsFile: SFTPFileEntry | null;
  setPermissionsFile: (value: SFTPFileEntry | null) => void;
  editorFile: SFTPFileEntry | null;
  setEditorFile: (value: SFTPFileEntry | null) => void;
  editorContent: string;
  editorEncoding: 'utf-8' | 'latin1';
  setEditorContent: (value: string) => void;
  editorLoadError: string | null;
  setEditorLoadError: (value: string | null) => void;
  currentPath: string;
  mutations: Mutations;
}

export function RemotePaneOverlays({
  contextMenu,
  setContextMenu,
  openFileEditor,
  renameDialog,
  setRenameDialog,
  showMkdirDialog,
  setShowMkdirDialog,
  mkdirName,
  setMkdirName,
  showCreateFileDialog,
  setShowCreateFileDialog,
  newFileName,
  setNewFileName,
  onCreateFile,
  deleteConfirm,
  setDeleteConfirm,
  permissionsFile,
  setPermissionsFile,
  editorFile,
  setEditorFile,
  editorContent,
  editorEncoding,
  setEditorContent,
  editorLoadError,
  setEditorLoadError,
  currentPath,
  mutations,
}: RemotePaneOverlaysProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-surface border border-border rounded shadow-lg py-1 z-50"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          {contextMenu.file.type === 'file' && isTextFile(contextMenu.file.name) && (
            <button
              type="button"
              onClick={() => {
                openFileEditor(contextMenu.file);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-sm text-left text-foreground hover:bg-secondary flex items-center gap-2"
            >
              <FileCode className="w-4 h-4" />
              {t('files.edit')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setRenameDialog({ file: contextMenu.file, newName: contextMenu.file.name });
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-sm text-left text-foreground hover:bg-secondary flex items-center gap-2"
          >
            <Edit3 className="w-4 h-4" />
            {t('files.rename')}
          </button>
          <button
            type="button"
            onClick={() => {
              setPermissionsFile(contextMenu.file);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-sm text-left text-foreground hover:bg-secondary flex items-center gap-2"
          >
            <Shield className="w-4 h-4" />
            {t('permissions.editPermissions')}
          </button>
          <div className="border-t border-border my-1" />
          <button
            type="button"
            onClick={() => {
              setDeleteConfirm(contextMenu.file);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-sm text-left text-destructive hover:bg-destructive/10 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {t('files.delete')}
          </button>
        </div>
      )}

      {/* Rename Dialog */}
      {renameDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded p-4 w-80">
            <h3 className="text-sm font-semibold text-foreground mb-3">{t('files.rename')}</h3>
            {/* biome-ignore lint/a11y/noAutofocus: dialog focus management */}
            <input
              type="text"
              value={renameDialog.newName}
              onChange={(e) => setRenameDialog({ ...renameDialog, newName: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary mb-3"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameDialog.newName.trim()) {
                  const oldPath = renameDialog.file.path;
                  const newPath =
                    oldPath.substring(0, oldPath.lastIndexOf('/') + 1) +
                    renameDialog.newName.trim();
                  mutations.rename.mutate({ oldPath, newPath });
                  setRenameDialog(null);
                }
                if (e.key === 'Escape') setRenameDialog(null);
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRenameDialog(null)}
                className="no-drag"
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (renameDialog.newName.trim()) {
                    const oldPath = renameDialog.file.path;
                    const newPath =
                      oldPath.substring(0, oldPath.lastIndexOf('/') + 1) +
                      renameDialog.newName.trim();
                    mutations.rename.mutate({ oldPath, newPath });
                    setRenameDialog(null);
                  }
                }}
                disabled={mutations.rename.isPending}
                className="no-drag"
              >
                {mutations.rename.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('common.save')
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mkdir Dialog */}
      {showMkdirDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded p-4 w-80">
            <h3 className="text-sm font-semibold text-foreground mb-3">{t('files.newFolder')}</h3>
            {/* biome-ignore lint/a11y/noAutofocus: dialog focus management */}
            <input
              type="text"
              value={mkdirName}
              onChange={(e) => setMkdirName(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary mb-3"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mkdirName.trim()) {
                  const newPath = currentPath.endsWith('/')
                    ? `${currentPath}${mkdirName.trim()}`
                    : `${currentPath}/${mkdirName.trim()}`;
                  mutations.mkdir.mutate(newPath);
                  setShowMkdirDialog(false);
                  setMkdirName('New Folder');
                }
                if (e.key === 'Escape') {
                  setShowMkdirDialog(false);
                  setMkdirName('New Folder');
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowMkdirDialog(false);
                  setMkdirName('New Folder');
                }}
                className="no-drag"
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (mkdirName.trim()) {
                    const newPath = currentPath.endsWith('/')
                      ? `${currentPath}${mkdirName.trim()}`
                      : `${currentPath}/${mkdirName.trim()}`;
                    mutations.mkdir.mutate(newPath);
                    setShowMkdirDialog(false);
                    setMkdirName('New Folder');
                  }
                }}
                disabled={mutations.mkdir.isPending}
                className="no-drag"
              >
                {mutations.mkdir.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('files.create')
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <CreateFileDialog
        isOpen={showCreateFileDialog}
        fileName={newFileName}
        isPending={mutations.writeFile.isPending}
        onClose={() => {
          setShowCreateFileDialog(false);
          setNewFileName('new-file.txt');
        }}
        onNameChange={setNewFileName}
        onCreate={onCreateFile}
      />

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded p-4 w-80">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              {t('files.deleteTitle', {
                type:
                  deleteConfirm.type === 'directory'
                    ? t('files.deleteFolder')
                    : t('files.deleteFile'),
              })}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {t('files.deleteConfirm')}{' '}
              <span className="text-foreground font-medium">{deleteConfirm.name}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteConfirm(null)}
                className="no-drag"
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  mutations.deleteFile.mutate(deleteConfirm.path);
                  setDeleteConfirm(null);
                }}
                disabled={mutations.deleteFile.isPending}
                className="no-drag bg-destructive hover:bg-destructive/80"
              >
                {mutations.deleteFile.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('files.delete')
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {permissionsFile && (
        <PermissionsModal
          file={permissionsFile}
          isOpen={!!permissionsFile}
          onClose={() => setPermissionsFile(null)}
          onSave={(mode) => {
            mutations.chmod.mutate(
              { path: permissionsFile.path, mode },
              { onSuccess: () => setPermissionsFile(null) }
            );
          }}
          isPending={mutations.chmod.isPending}
        />
      )}

      {/* File Editor */}
      {editorFile && (
        <FileEditor
          file={editorFile}
          isOpen={!!editorFile}
          onClose={() => {
            setEditorFile(null);
            setEditorContent('');
            setEditorLoadError(null);
          }}
          onSave={(content) => {
            mutations.writeFile.mutate(
              { path: editorFile.path, content, encoding: editorEncoding },
              {
                onSuccess: () => {
                  setEditorFile(null);
                  setEditorContent('');
                  setEditorLoadError(null);
                },
              }
            );
          }}
          initialContent={editorContent}
          encoding={editorEncoding}
          isLoading={mutations.readFile.isPending}
          isSaving={mutations.writeFile.isPending}
          loadError={editorLoadError}
        />
      )}

    </>
  );
}
