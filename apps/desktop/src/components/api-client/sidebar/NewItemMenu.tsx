import React from 'react';
import { Button } from '@ownshell/ui';
import { FileJson, FileUp, FolderPlus, Plus, Terminal, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NewItemMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onCreateRequest: () => void;
  onCreateCollection: () => void;
  onImportCurl: () => void;
  onImportPostman: () => void;
  onImportOwnShell: () => void;
}

export const NewItemMenu: React.FC<NewItemMenuProps> = ({
  isOpen,
  onToggle,
  onCreateRequest,
  onCreateCollection,
  onImportCurl,
  onImportPostman,
  onImportOwnShell,
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={onToggle} className="no-drag h-6 w-6 p-0">
        <Plus className="w-3.5 h-3.5" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[200px] z-50">
          <button
            type="button"
            onClick={onCreateRequest}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-primary/10"
          >
            <FileJson className="w-4 h-4" />
            {t('api.newRequest', 'New Request')}
          </button>
          <button
            type="button"
            onClick={onCreateCollection}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-primary/10"
          >
            <FolderPlus className="w-4 h-4" />
            {t('api.newFolder', 'New Folder')}
          </button>
          <button
            type="button"
            onClick={onImportCurl}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-primary/10"
          >
            <Terminal className="w-4 h-4" />
            {t('api.curl.importMenu')}
          </button>
          <button
            type="button"
            onClick={onImportPostman}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-primary/10"
          >
            <Upload className="w-4 h-4" />
            {t('api.transfer.importPostman')}
          </button>
          <button
            type="button"
            onClick={onImportOwnShell}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-primary/10"
          >
            <FileUp className="w-4 h-4" />
            {t('api.transfer.importOwnShell')}
          </button>
        </div>
      )}
    </div>
  );
};
