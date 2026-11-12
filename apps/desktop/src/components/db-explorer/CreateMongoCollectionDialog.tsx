import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppCheckbox, Button, Input, Modal } from '@ownshell/ui';
import { FolderPlus, Loader2 } from 'lucide-react';

interface CreateMongoCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, options?: { capped?: boolean; size?: number }) => void;
  isLoading?: boolean;
}

function isValidCollectionName(value: string): boolean {
  const name = value.trim();
  return (
    name.length > 0 &&
    name.length <= 120 &&
    !name.includes('\0') &&
    !name.includes('$') &&
    !name.startsWith('.') &&
    !name.endsWith('.') &&
    !name.startsWith('system.')
  );
}

export const CreateMongoCollectionDialog: React.FC<CreateMongoCollectionDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [isCapped, setIsCapped] = useState(false);
  const [sizeMb, setSizeMb] = useState('10');

  const isNameValid = isValidCollectionName(name);
  const parsedSizeMb = Number(sizeMb);
  const isSizeValid = !isCapped || (Number.isFinite(parsedSizeMb) && parsedSizeMb > 0);
  const canSubmit = isNameValid && isSizeValid && !isLoading;

  const handleClose = () => {
    setName('');
    setIsCapped(false);
    setSizeMb('10');
    onClose();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    onConfirm(
      name.trim(),
      isCapped ? { capped: true, size: Math.round(parsedSizeMb * 1024 * 1024) } : undefined
    );
  };

  const nameError =
    name.length > 0 && !isNameValid
      ? t(
          'db.mongoCollectionNameError',
          'Collection name cannot be empty, use $, start/end with a dot, or start with system.'
        )
      : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('db.createCollection', 'Create Collection')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="mongo-collection-name"
            className="block text-sm font-medium text-foreground mb-1"
          >
            {t('db.collectionName', 'Collection Name')} *
          </label>
          <Input
            id="mongo-collection-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="events"
            required
            autoFocus
            className={nameError ? 'border-destructive' : ''}
          />
          {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
        </div>

        <div className="space-y-2 rounded border border-border bg-surface/40 p-3">
          <AppCheckbox
            checked={isCapped}
            onCheckedChange={setIsCapped}
            label={t('db.cappedCollection', 'Capped collection')}
          />
          {isCapped && (
            <div>
              <label
                htmlFor="mongo-collection-size"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {t('db.maxSizeMb', 'Max size (MB)')} *
              </label>
              <Input
                id="mongo-collection-size"
                type="number"
                min={1}
                step={1}
                value={sizeMb}
                onChange={(event) => setSizeMb(event.target.value)}
                className={!isSizeValid ? 'border-destructive' : ''}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FolderPlus className="w-4 h-4 mr-2" />
            )}
            {isLoading ? t('common.creating', 'Creating...') : t('common.create', 'Create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
