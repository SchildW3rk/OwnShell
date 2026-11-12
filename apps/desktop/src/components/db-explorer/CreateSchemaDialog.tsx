/**
 * Create Schema Dialog
 *
 * Dialog for creating a new schema in a PostgreSQL database.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Input } from '@ownshell/ui';
import { FolderPlus, Loader2 } from 'lucide-react';

interface CreateSchemaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, options?: Record<string, unknown>) => void;
  isLoading?: boolean;
}

export const CreateSchemaDialog: React.FC<CreateSchemaDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    onConfirm(name.trim());
  };

  const handleClose = () => {
    setName('');
    onClose();
  };

  // Validate schema name (PostgreSQL naming rules)
  const isValidName = (value: string): boolean => {
    if (!value || value.length === 0) return false;
    if (value.length > 63) return false; // PostgreSQL limit
    // Must start with letter or underscore, then alphanumeric or underscore
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
  };

  const nameError =
    name.length > 0 && !isValidName(name)
      ? 'Schema name must start with a letter or underscore, followed by letters, numbers, or underscores'
      : undefined;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('db.createSchema', 'Create Schema')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Schema Name */}
        <div>
          <label htmlFor="schema-name" className="block text-sm font-medium text-foreground mb-1">
            {t('db.schemaName', 'Schema Name')} *
          </label>
          <Input
            id="schema-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my_schema"
            required
            autoFocus
            className={nameError ? 'border-destructive' : ''}
          />
          {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            Max 63 characters. Must start with letter or underscore.
          </p>
        </div>

        {/* Info Box */}
        <div className="p-3 bg-primary/10 border border-primary/30 rounded">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Tip:</strong> Schemas are logical namespaces for
            organizing tables, views, and other database objects.
          </p>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!isValidName(name) || isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isLoading ? (
              t('common.creating', 'Creating...')
            ) : (
              <>
                <FolderPlus className="w-4 h-4 mr-2" />
                {t('common.create', 'Create')}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
