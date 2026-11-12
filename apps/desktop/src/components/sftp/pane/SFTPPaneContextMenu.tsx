import React from 'react';
import type { SFTPFileEntry } from '@ownshell/core';
import { Copy, Download, Edit3, FileCode, Shield, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { SFTPContextMenuState } from './types';
import { isTextFile } from './utils';

interface SFTPPaneContextMenuProps {
  contextMenu: SFTPContextMenuState;
  currentPath: string;
  dualPaneMode: boolean;
  onDownload: (file: SFTPFileEntry) => void;
  onCopyToOtherPane?: (file: SFTPFileEntry, currentPath: string) => void;
  onEdit: (file: SFTPFileEntry) => void;
  onRename: (file: SFTPFileEntry) => void;
  onPermissions: (file: SFTPFileEntry) => void;
  onDelete: (file: SFTPFileEntry) => void;
}

export const SFTPPaneContextMenu: React.FC<SFTPPaneContextMenuProps> = ({
  contextMenu,
  currentPath,
  dualPaneMode,
  onDownload,
  onCopyToOtherPane,
  onEdit,
  onRename,
  onPermissions,
  onDelete,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className="fixed bg-surface border border-border rounded shadow-lg py-1 z-50"
      style={{ top: contextMenu.y, left: contextMenu.x }}
    >
      <button
        onClick={() => onDownload(contextMenu.file)}
        className="w-full px-3 py-1.5 text-sm text-left text-foreground hover:bg-secondary flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        {t('files.download')}
      </button>

      {dualPaneMode && onCopyToOtherPane && (
        <button
          onClick={() => onCopyToOtherPane(contextMenu.file, currentPath)}
          className="w-full px-3 py-1.5 text-sm text-left text-foreground hover:bg-secondary flex items-center gap-2"
        >
          <Copy className="w-4 h-4" />
          {t('dualPane.copyToOther')}
        </button>
      )}

      {contextMenu.file.type === 'file' && isTextFile(contextMenu.file.name) && (
        <button
          onClick={() => onEdit(contextMenu.file)}
          className="w-full px-3 py-1.5 text-sm text-left text-foreground hover:bg-secondary flex items-center gap-2"
        >
          <FileCode className="w-4 h-4" />
          {t('files.edit')}
        </button>
      )}

      <button
        onClick={() => onRename(contextMenu.file)}
        className="w-full px-3 py-1.5 text-sm text-left text-foreground hover:bg-secondary flex items-center gap-2"
      >
        <Edit3 className="w-4 h-4" />
        {t('files.rename')}
      </button>

      <button
        onClick={() => onPermissions(contextMenu.file)}
        className="w-full px-3 py-1.5 text-sm text-left text-foreground hover:bg-secondary flex items-center gap-2"
      >
        <Shield className="w-4 h-4" />
        {t('permissions.editPermissions')}
      </button>

      <div className="border-t border-border my-1" />

      <button
        onClick={() => onDelete(contextMenu.file)}
        className="w-full px-3 py-1.5 text-sm text-left text-destructive hover:bg-destructive/10 flex items-center gap-2"
      >
        <Trash2 className="w-4 h-4" />
        {t('files.delete')}
      </button>
    </div>
  );
};
