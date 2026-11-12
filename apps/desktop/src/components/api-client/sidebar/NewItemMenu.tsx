import React from 'react';
import { Button } from '@ownshell/ui';
import { FileJson, FolderPlus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NewItemMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onCreateRequest: () => void;
  onCreateCollection: () => void;
}

export const NewItemMenu: React.FC<NewItemMenuProps> = ({
  isOpen,
  onToggle,
  onCreateRequest,
  onCreateCollection,
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={onToggle} className="no-drag h-6 w-6 p-0">
        <Plus className="w-3.5 h-3.5" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[140px] z-50">
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
        </div>
      )}
    </div>
  );
};
