/**
 * SSH Keys Tab (v1.19.0)
 *
 * Manage SSH private keys for authentication
 * Moved from Settings to Vault (security hub)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@ownshell/ui';
import { DataTable } from '@ownshell/ui';
import { KeysTable } from '@ownshell/core';
import { Key, Upload, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { Modal, FormField, FormInput } from '@ownshell/ui';
import type { ColumnDef } from '@tanstack/react-table';

export const SSHKeysTab: React.FC = () => {
  const { t } = useTranslation();

  const [keys, setKeys] = useState<KeysTable[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importLabel, setImportLabel] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    content: string;
    type: 'rsa' | 'ed25519';
  } | null>(null);
  const [globalFilter, setGlobalFilter] = useState('');

  const loadKeys = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      const result = await window.electronAPI.keys.getAll();
      setKeys(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load keys on mount
  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleImportClick = async () => {
    try {
      setError('');
      const result = await window.electronAPI.filePicker.openSSHKey();

      if (result.canceled) return;

      if (!result.success) {
        setError(result.error?.message || 'Failed to read key file');
        return;
      }

      setSelectedFile({
        path: result.filePath,
        content: result.content,
        type: result.keyType,
      });
      setIsImporting(true);
      const filename = result.filePath.split('/').pop() || 'imported_key';
      setImportLabel(filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import key');
    }
  };

  const handleSaveImport = async () => {
    if (!selectedFile) return;

    if (!importLabel.trim()) {
      setError('Please enter a label for this key');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const publicKey = selectedFile.content.includes('PUBLIC KEY') ? selectedFile.content : 'N/A';

      await window.electronAPI.keys.create({
        label: importLabel,
        type: selectedFile.type,
        public_key: publicKey,
        private_key: selectedFile.content,
        passphrase: importPassphrase || null,
      });

      setIsImporting(false);
      setSelectedFile(null);
      setImportLabel('');
      setImportPassphrase('');
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteKey = useCallback(
    async (id: string) => {
      if (!confirm(t('settings.deleteKeyConfirm', 'Are you sure you want to delete this SSH key?')))
        return;

      try {
        setIsLoading(true);
        setError('');
        await window.electronAPI.keys.delete(id);
        await loadKeys();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete key');
      } finally {
        setIsLoading(false);
      }
    },
    [t, loadKeys]
  );

  const cancelImport = () => {
    setIsImporting(false);
    setSelectedFile(null);
    setImportLabel('');
    setImportPassphrase('');
    setError('');
  };

  // Table columns
  const columns = useMemo<ColumnDef<KeysTable>[]>(
    () => [
      {
        id: 'icon',
        header: '',
        size: 40,
        enableSorting: false,
        cell: () => (
          <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center">
            <Key className="w-4 h-4 text-muted-foreground" />
          </div>
        ),
      },
      {
        id: 'label',
        header: t('settings.keyLabel', 'Label'),
        accessorKey: 'label',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{row.original.label}</span>
            {row.original.passphrase_encrypted && (
              <span className="text-xs text-muted-foreground">
                ({t('settings.passphraseProtected')})
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'type',
        header: t('settings.type', 'Type'),
        accessorKey: 'type',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="inline-block rounded-md bg-secondary px-2 py-1 text-xs text-foreground">
            {row.original.type.toUpperCase()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 50,
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => handleDeleteKey(row.original.id)}
            disabled={isLoading}
            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ),
      },
    ],
    [t, isLoading, handleDeleteKey]
  );

  if (isLoading && keys.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 flex items-center gap-2 p-3 bg-destructive/10 border border-destructive rounded text-sm text-destructive">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Table with integrated toolbar */}
      <DataTable
        data={keys}
        columns={columns}
        enableGlobalFilter={true}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        globalFilterPlaceholder={t('settings.searchKeys', 'Search keys...')}
        enableSorting={true}
        enableStriped={true}
        stickyHeader={true}
        enablePagination={false}
        emptyMessage={t('settings.noKeys', 'No SSH keys imported yet')}
        toolbarLeft={
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {keys.length}{' '}
            {keys.length !== 1
              ? t('settings.keysPlural', 'keys')
              : t('settings.keySingular', 'key')}
          </div>
        }
        toolbarRight={
          <button
            type="button"
            onClick={handleImportClick}
            disabled={isLoading}
            className="relative group p-2 rounded border border-border bg-secondary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('settings.importKey', 'Import Private Key')}
          >
            <Upload className="w-4 h-4" />
            {/* Tooltip */}
            <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-popover border border-border rounded text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
              {t('settings.importKey', 'Import Private Key')}
            </div>
          </button>
        }
      />

      {/* Import Modal */}
      <Modal
        isOpen={isImporting && !!selectedFile}
        onClose={cancelImport}
        title={t('settings.importKeyTitle', 'Import SSH Key')}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={cancelImport} disabled={isLoading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveImport} isLoading={isLoading}>
              {t('settings.saveKey', 'Save Key')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground p-3 bg-card rounded border border-border">
            <div>
              <strong>{t('settings.file', 'File')}:</strong> {selectedFile?.path}
            </div>
            <div>
              <strong>{t('settings.type', 'Type')}:</strong> {selectedFile?.type.toUpperCase()}
            </div>
          </div>

          <FormField label={t('settings.keyLabel', 'Label')} required>
            <FormInput
              type="text"
              placeholder={t('settings.keyLabelPlaceholder', 'e.g., Work MacBook')}
              value={importLabel}
              onChange={(e) => setImportLabel(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField
            label={t('settings.passphrase', 'Passphrase')}
            hint={t('settings.passphraseHint', 'Leave empty if key has no passphrase')}
          >
            <FormInput
              type="password"
              placeholder={t('settings.passphrasePlaceholder', 'Enter passphrase if required')}
              value={importPassphrase}
              onChange={(e) => setImportPassphrase(e.target.value)}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
};
