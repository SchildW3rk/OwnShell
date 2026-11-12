/**
 * Create Database Dialog
 *
 * Dialog for creating a new database on a PostgreSQL/MySQL server.
 * Allows setting basic options like name, encoding (PostgreSQL), character set (MySQL).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Input } from '@ownshell/ui';
import { Database, Loader2 } from 'lucide-react';

interface CreateDatabaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, options?: Record<string, unknown>) => void;
  isLoading?: boolean;
  dbType: 'postgres' | 'mysql';
}

export const CreateDatabaseDialog: React.FC<CreateDatabaseDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  dbType,
}) => {
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [encoding, setEncoding] = useState('UTF8');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    // Build options based on DB type
    const options: Record<string, unknown> = {};

    if (dbType === 'postgres' && encoding !== 'UTF8') {
      options.encoding = encoding;
    }

    onConfirm(name.trim(), Object.keys(options).length > 0 ? options : undefined);
  };

  const handleClose = () => {
    setName('');
    setEncoding('UTF8');
    onClose();
  };

  // Validate database name
  const isValidName = (value: string): boolean => {
    if (!value || value.length === 0) return false;
    if (value.length > 63) return false; // PostgreSQL/MySQL limit
    // Basic check: only alphanumeric, underscore, hyphen
    return /^[a-zA-Z0-9_-]+$/.test(value);
  };

  const nameError =
    name.length > 0 && !isValidName(name)
      ? 'Name can only contain letters, numbers, underscore and hyphen'
      : undefined;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('db.createDatabase', 'Create Database')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Database Name */}
        <div>
          <label htmlFor="db-name" className="block text-sm font-medium text-foreground mb-1">
            {t('db.databaseName', 'Database Name')} *
          </label>
          <Input
            id="db-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my_database"
            required
            autoFocus
            className={nameError ? 'border-destructive' : ''}
          />
          {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            Max 63 characters. Only letters, numbers, underscore and hyphen.
          </p>
        </div>

        {/* Encoding (PostgreSQL only) */}
        {dbType === 'postgres' && (
          <div>
            <label htmlFor="db-encoding" className="block text-sm font-medium text-foreground mb-1">
              {t('db.encoding', 'Encoding')} (Optional)
            </label>
            <select
              id="db-encoding"
              value={encoding}
              onChange={(e) => setEncoding(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="UTF8">UTF8 (recommended)</option>
              <option value="SQL_ASCII">SQL_ASCII</option>
              <option value="LATIN1">LATIN1</option>
              <option value="LATIN2">LATIN2</option>
              <option value="WIN1252">WIN1252</option>
            </select>
          </div>
        )}

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
                <Database className="w-4 h-4 mr-2" />
                {t('common.create', 'Create')}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
