/**
 * Environments Table (v1.17.0 - Refactored with DataTable)
 *
 * Compact table view for environment variables using TanStack Table
 * - Higher data density than cards
 * - Sortable columns
 * - Actions menu (3-dot)
 * - Sorting & Pagination
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Edit2, Trash2, Upload, Clock, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { VaultEnvironmentsTable } from '@ownshell/core';
import { DataTable, DropdownMenu, TooltipButton } from '@ownshell/ui';
import type { ColumnDef } from '@tanstack/react-table';
import type { DropdownMenuItem } from '@ownshell/ui';
import { createFavoriteColumn } from './table-utils';

interface EnvironmentsTableProps {
  environments: VaultEnvironmentsTable[];
  hosts: Array<{ id: string; label: string }>;
  onEdit: (env: VaultEnvironmentsTable) => void;
  onDelete: (id: string) => void;
  onDeploy: (env: VaultEnvironmentsTable) => void;
  onToggleFavorite: (id: string, currentFavorite: number) => void;
  onAdd: () => void;
}

export const EnvironmentsTable: React.FC<EnvironmentsTableProps> = ({
  environments,
  hosts,
  onEdit,
  onDelete,
  onDeploy,
  onToggleFavorite,
  onAdd,
}) => {
  const { t, i18n } = useTranslation();
  const [pageSize, setPageSize] = useState(25);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

  // Load column visibility from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('environmentsTable_columnVisibility');
    if (saved) {
      try {
        setColumnVisibility(JSON.parse(saved));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Save column visibility to localStorage
  useEffect(() => {
    if (Object.keys(columnVisibility).length > 0) {
      localStorage.setItem('environmentsTable_columnVisibility', JSON.stringify(columnVisibility));
    }
  }, [columnVisibility]);

  const getHostName = (hostId: string | null) => {
    if (!hostId) return '-';
    const host = hosts.find((h) => h.id === hostId);
    return host?.label || '-';
  };

  const formatLastDeployed = (timestamp: number | null) => {
    if (!timestamp) return t('vault.neverDeployed');
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return i18n.language === 'de' ? 'gerade eben' : 'just now';
      if (diffMins < 60) return i18n.language === 'de' ? `vor ${diffMins}min` : `${diffMins}m ago`;
      if (diffHours < 24) return i18n.language === 'de' ? `vor ${diffHours}h` : `${diffHours}h ago`;
      if (diffDays < 7) return i18n.language === 'de' ? `vor ${diffDays}d` : `${diffDays}d ago`;

      // Older than 7 days, show date
      return date.toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  // Column definitions with custom cell renderers
  const columns = useMemo<ColumnDef<VaultEnvironmentsTable>[]>(
    () => [
      // Favorite Star
      createFavoriteColumn<VaultEnvironmentsTable>(onToggleFavorite, { enableHiding: false }),
      // Project Badge
      {
        id: 'project',
        header: t('vault.project'),
        accessorKey: 'project',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="inline-block rounded-md bg-secondary px-2 py-1 text-xs text-foreground transition-colors duration-200">
            {row.original.project}
          </span>
        ),
      },
      // Name + Description
      {
        id: 'name',
        header: t('vault.envName'),
        accessorKey: 'name',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-foreground">{row.original.name}</div>
            {row.original.description && (
              <div className="truncate text-xs text-muted-foreground max-w-md">
                {row.original.description}
              </div>
            )}
          </div>
        ),
      },
      // Host
      {
        id: 'host',
        header: t('vault.linkedHost'),
        accessorKey: 'host_id',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-foreground">{getHostName(row.original.host_id)}</div>
        ),
      },
      // Last Deployed (with Clock icon in header)
      {
        id: 'last_deployed',
        header: () => (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {t('vault.lastDeployed')}
          </div>
        ),
        meta: {
          displayName: t('vault.lastDeployed'),
        },
        accessorKey: 'last_deployed_at',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            {formatLastDeployed(row.original.last_deployed_at)}
          </div>
        ),
      },

      // Actions Menu (DropdownMenu)
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        size: 50,
        cell: ({ row }) => {
          const menuItems: DropdownMenuItem[] = [
            {
              id: 'edit',
              label: t('vault.editEnvironment'),
              icon: <Edit2 className="h-4 w-4" />,
              onClick: () => onEdit(row.original),
            },
          ];

          // Add Deploy option if host_id exists
          if (row.original.host_id) {
            menuItems.push({
              id: 'deploy',
              label: t('vault.deployToSftp'),
              icon: <Upload className="h-4 w-4" />,
              onClick: () => onDeploy(row.original),
            });
          }

          // Add Delete option (always last, danger variant)
          menuItems.push({
            id: 'delete',
            label: t('vault.deleteEnvironment'),
            icon: <Trash2 className="h-4 w-4" />,
            variant: 'danger',
            onClick: () => onDelete(row.original.id),
          });

          return <DropdownMenu items={menuItems} align="right" />;
        },
      },
    ],
    [t, hosts, onToggleFavorite, onEdit, onDeploy, onDelete]
  );

  return (
    <DataTable
      data={environments}
      columns={columns}
      pageSize={pageSize}
      onPageSizeChange={setPageSize}
      globalFilter={globalFilter}
      onGlobalFilterChange={setGlobalFilter}
      enableGlobalFilter={true}
      globalFilterPlaceholder={t('vault.searchEnvironments')}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      enableColumnVisibility={true}
      columnVisibilityButtonText={t('vault.columns')}
      enableSorting={true}
      enableStriped={true}
      stickyHeader={true}
      emptyMessage={t('vault.noEnvironments')}
      toolbarLeft={
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {t('vault.environmentCount', { count: environments.length })}
        </div>
      }
      toolbarRight={
        <TooltipButton
          onClick={onAdd}
          icon={<Plus className="h-4 w-4" />}
          tooltip={t('vault.addEnvironment')}
        />
      }
    />
  );
};
