/**
 * Credentials Table (v1.17.0 - Refactored with DataTable)
 *
 * Compact table view for credentials using TanStack Table
 * - Higher data density than cards
 * - Inline password reveal/copy
 * - Actions menu (3-dot)
 * - Sorting & Pagination
 */

import React, { useState, useMemo } from 'react';
import { Edit2, Trash2, Eye, EyeOff, Copy, ExternalLink, Check, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { VaultCredentialsTable } from '@ownshell/core';
import { DataTable, DropdownMenu, TooltipButton } from '@ownshell/ui';
import type { ColumnDef } from '@tanstack/react-table';
import type { DropdownMenuItem } from '@ownshell/ui';
import { createFavoriteColumn } from './table-utils';

interface CredentialsTableProps {
  credentials: VaultCredentialsTable[];
  onEdit: (cred: VaultCredentialsTable) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string, currentFavorite: number) => void;
  onDecrypt: (id: string) => Promise<string>;
  onAdd: () => void;
}

export const CredentialsTable: React.FC<CredentialsTableProps> = ({
  credentials,
  onEdit,
  onDelete,
  onToggleFavorite,
  onDecrypt,
  onAdd,
}) => {
  const { t } = useTranslation();
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [globalFilter, setGlobalFilter] = useState('');

  const handleRevealPassword = async (id: string) => {
    if (revealedPasswords[id]) {
      // Hide password
      const { [id]: _, ...rest } = revealedPasswords;
      setRevealedPasswords(rest);
    } else {
      // Decrypt and reveal password
      try {
        const decrypted = await onDecrypt(id);
        setRevealedPasswords({ ...revealedPasswords, [id]: decrypted });
      } catch (error) {
        console.error('Failed to decrypt password:', error);
      }
    }
  };

  const handleCopyPassword = async (id: string) => {
    try {
      const password = revealedPasswords[id] || (await onDecrypt(id));
      await navigator.clipboard.writeText(password);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy password:', error);
    }
  };

  const handleOpenUrl = (url: string | null) => {
    if (!url) return;
    window.electronAPI.vault.credentials.openURL(url);
  };

  // Column definitions with custom cell renderers
  const columns = useMemo<ColumnDef<VaultCredentialsTable>[]>(
    () => [
      // Favorite Star
      createFavoriteColumn<VaultCredentialsTable>(onToggleFavorite),
      // Title + Notes
      {
        id: 'title',
        header: t('vault.title_field'),
        accessorKey: 'title',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-foreground">{row.original.title}</div>
            {row.original.notes && (
              <div className="truncate text-xs text-muted-foreground max-w-xs">
                {row.original.notes}
              </div>
            )}
          </div>
        ),
      },
      // Username
      {
        id: 'username',
        header: t('vault.username'),
        accessorKey: 'username',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="font-mono text-sm text-foreground truncate max-w-xs">
            {row.original.username}
          </div>
        ),
      },
      // Password (with Eye + Copy)
      {
        id: 'password',
        header: t('vault.password'),
        accessorKey: 'password_encrypted',
        enableSorting: false,
        size: 200,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="flex-1 font-mono text-sm text-foreground truncate">
              {revealedPasswords[row.original.id] || '••••••••'}
            </span>
            <button
              onClick={() => handleRevealPassword(row.original.id)}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors duration-200"
              title={
                revealedPasswords[row.original.id]
                  ? t('vault.hidePassword')
                  : t('vault.showPassword')
              }
            >
              {revealedPasswords[row.original.id] ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => handleCopyPassword(row.original.id)}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors duration-200"
              title={t('vault.copyPassword')}
            >
              {copiedId === row.original.id ? (
                <Check className="h-4 w-4 text-green-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        ),
      },
      // URL
      {
        id: 'url',
        header: t('vault.url'),
        accessorKey: 'url',
        enableSorting: true,
        cell: ({ row }) => {
          if (!row.original.url) {
            return <span className="text-muted-foreground">-</span>;
          }
          return (
            <button
              onClick={() => handleOpenUrl(row.original.url)}
              className="flex items-center gap-1 text-primary hover:underline truncate max-w-xs"
            >
              <span className="truncate">{row.original.url}</span>
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </button>
          );
        },
      },
      // Actions Menu (3-dot)
      // Actions Menu (DropdownMenu)
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        size: 50,
        cell: ({ row }) => {
          const menuItems: DropdownMenuItem[] = [
            {
              id: 'edit',
              label: t('vault.editCredential'),
              icon: <Edit2 className="h-4 w-4" />,
              onClick: () => onEdit(row.original),
            },
            {
              id: 'delete',
              label: t('vault.deleteCredential'),
              icon: <Trash2 className="h-4 w-4" />,
              variant: 'danger',
              onClick: () => onDelete(row.original.id),
            },
          ];

          return <DropdownMenu items={menuItems} align="right" />;
        },
      },
    ],
    [t, revealedPasswords, copiedId, onToggleFavorite, onEdit, onDelete]
  );

  return (
    <DataTable
      data={credentials}
      columns={columns}
      pageSize={pageSize}
      onPageSizeChange={setPageSize}
      globalFilter={globalFilter}
      onGlobalFilterChange={setGlobalFilter}
      enableGlobalFilter={true}
      globalFilterPlaceholder={t('vault.searchCredentials')}
      enableSorting={true}
      enableStriped={true}
      stickyHeader={true}
      emptyMessage={t('vault.noCredentials')}
      toolbarLeft={
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {credentials.length}{' '}
          {credentials.length !== 1 ? t('vault.credentialsPlural') : t('vault.credentialSingular')}
        </div>
      }
      toolbarRight={
        <TooltipButton
          onClick={onAdd}
          icon={<Plus className="h-4 w-4" />}
          tooltip={t('vault.addCredential')}
        />
      }
    />
  );
};
