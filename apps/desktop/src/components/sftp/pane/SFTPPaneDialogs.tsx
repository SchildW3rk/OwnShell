import React from 'react';
import type { SFTPFileEntry } from '@ownshell/core';
import { Loader2 } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import type { SFTPRenameDialogState } from './types';

interface RenameDialogProps {
  renameDialog: SFTPRenameDialogState | null;
  isPending: boolean;
  onClose: () => void;
  onNameChange: (newName: string) => void;
  onSave: () => void;
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
  renameDialog,
  isPending,
  onClose,
  onNameChange,
  onSave,
}) => {
  const { t } = useTranslation();
  if (!renameDialog) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded p-4 w-80">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('files.rename')}</h3>
        <input
          type="text"
          value={renameDialog.newName}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary mb-3"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && renameDialog.newName.trim()) onSave();
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} className="no-drag">
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={isPending}
            className="no-drag"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

interface MkdirDialogProps {
  isOpen: boolean;
  mkdirName: string;
  isPending: boolean;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onCreate: () => void;
}

export const MkdirDialog: React.FC<MkdirDialogProps> = ({
  isOpen,
  mkdirName,
  isPending,
  onClose,
  onNameChange,
  onCreate,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded p-4 w-80">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('files.newFolder')}</h3>
        <input
          type="text"
          value={mkdirName}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary mb-3"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && mkdirName.trim()) onCreate();
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} className="no-drag">
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onCreate}
            disabled={isPending}
            className="no-drag"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('files.create')}
          </Button>
        </div>
      </div>
    </div>
  );
};

interface CreateFileDialogProps {
  isOpen: boolean;
  fileName: string;
  isPending: boolean;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onCreate: () => void;
}

export const CreateFileDialog: React.FC<CreateFileDialogProps> = ({
  isOpen,
  fileName,
  isPending,
  onClose,
  onNameChange,
  onCreate,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded p-4 w-80">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('files.newFile')}</h3>
        <input
          type="text"
          value={fileName}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary mb-3"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && fileName.trim()) onCreate();
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} className="no-drag">
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onCreate}
            disabled={isPending}
            className="no-drag"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('files.create')}
          </Button>
        </div>
      </div>
    </div>
  );
};

interface DeleteDialogProps {
  file: SFTPFileEntry | null;
  isPending: boolean;
  onClose: () => void;
  onDelete: () => void;
}

export const DeleteDialog: React.FC<DeleteDialogProps> = ({
  file,
  isPending,
  onClose,
  onDelete,
}) => {
  const { t } = useTranslation();
  if (!file) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded p-4 w-80">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {t('files.deleteTitle', {
            type: file.type === 'directory' ? t('files.deleteFolder') : t('files.deleteFile'),
          })}
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          {t('files.deleteConfirm')}{' '}
          <span className="text-foreground font-medium">{file.name}</span>?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} className="no-drag">
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onDelete}
            disabled={isPending}
            className="no-drag bg-destructive hover:bg-destructive/80"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('files.delete')}
          </Button>
        </div>
      </div>
    </div>
  );
};
