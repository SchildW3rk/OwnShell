import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal } from '@ownshell/ui';

interface ResourceFolderDialogProps {
  isOpen: boolean;
  title: string;
  initialName?: string;
  isSaving?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export const ResourceFolderDialog: React.FC<ResourceFolderDialogProps> = ({
  isOpen,
  title,
  initialName = '',
  isSaving,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [name, setName] = React.useState(initialName);

  React.useEffect(() => {
    if (isOpen) {
      setName(initialName);
    }
  }, [initialName, isOpen]);

  const trimmedName = name.trim();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmedName || isSaving) return;
    onSubmit(trimmedName);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" form="resource-folder-form" disabled={!trimmedName || isSaving}>
            {t('common.save', 'Save')}
          </Button>
        </>
      }
    >
      <form id="resource-folder-form" onSubmit={handleSubmit}>
        <Input
          label={t('sidebar.folderName', 'Folder name')}
          value={name}
          autoFocus
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('sidebar.folderNamePlaceholder', 'Production')}
        />
      </form>
    </Modal>
  );
};
