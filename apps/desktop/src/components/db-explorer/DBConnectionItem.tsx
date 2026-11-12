/**
 * Database Connection Item (v1.18.0)
 *
 * Compact sidebar item for database connections.
 * Shows icon + name + badge (Local/SSH) in one line.
 * Supports slim mode (icon-only with tooltip).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Home, Globe, ShieldAlert } from 'lucide-react';
import { resolveSslMode } from '../../../electron/db-explorer/connection/ssl-mode';
import { cn } from '@ownshell/ui';
import type { DropdownMenuItem } from '@ownshell/ui';
import { DBConnectionsTable } from '@ownshell/core';
import {
  SidebarItemActionsMenu,
  useSidebarItemContextMenu,
} from '../sidebar/SidebarItemActionsMenu';

export interface DBConnectionItemProps {
  connection: DBConnectionsTable;
  hostName?: string; // Name of the linked SSH host (for SSH mode)
  isActive: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  folderMenuItems?: DropdownMenuItem[];
  /** Slim mode: show icon-only with tooltip */
  isSlim?: boolean;
}

export const DBConnectionItem: React.FC<DBConnectionItemProps> = ({
  connection,
  hostName,
  isActive,
  onClick,
  onEdit,
  onDelete,
  isFavorite,
  onToggleFavorite,
  folderMenuItems,
  isSlim,
}) => {
  const { t } = useTranslation();
  const isLocal = connection.connection_mode === 'local';
  const hasActions = Boolean(onToggleFavorite || folderMenuItems?.length || onEdit || onDelete);
  const actionContextMenu = useSidebarItemContextMenu(hasActions);

  // Slim mode: Icon only with tooltip
  if (isSlim) {
    return (
      <div className="relative group">
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'w-full flex items-center justify-center p-2 rounded-md transition-colors',
            isActive
              ? 'bg-shell-panel-active/10 border border-shell-panel-active'
              : 'text-shell-panel-foreground hover:bg-shell-panel-hover'
          )}
        >
          <div
            className={cn(
              'w-6 h-6 rounded flex items-center justify-center',
              isActive
                ? 'bg-shell-control-active text-shell-control-active-foreground'
                : 'bg-shell-control text-shell-control-foreground'
            )}
          >
            <Database className="w-3 h-3" />
          </div>
        </button>

        {/* Tooltip */}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1.5 bg-shell-panel border border-shell-panel-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg min-w-[150px]">
          <div className="font-medium text-shell-panel-foreground flex items-center gap-1.5">
            {connection.name}
            <span
              className={cn(
                'px-1 py-0.5 rounded text-[10px]',
                isLocal ? 'bg-success/20 text-success' : 'bg-info/20 text-info'
              )}
            >
              {isLocal ? t('sidebar.localBadge', 'Local') : t('sidebar.remoteBadge', 'SSH')}
            </span>
          </div>
          <div className="text-shell-panel-muted mt-0.5">
            {connection.database || connection.host}
            {hostName && !isLocal && <span className="ml-1">via {hostName}</span>}
          </div>
        </div>
      </div>
    );
  }

  // Expanded mode: Compact single line (icon + name + badge on right)
  return (
    // biome-ignore lint/a11y/useSemanticElements: can't use button due to nested buttons inside
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={actionContextMenu.handleContextMenu}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={cn(
        'w-full group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors text-left',
        isActive
          ? 'bg-shell-panel-active/10 border border-shell-panel-active'
          : 'hover:bg-shell-panel-hover text-shell-panel-foreground'
      )}
    >
      {/* Database Icon */}
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded flex items-center justify-center',
          isActive
            ? 'bg-shell-control-active text-shell-control-active-foreground'
            : 'bg-shell-control text-shell-control-foreground'
        )}
      >
        <Database className="w-3.5 h-3.5" />
      </div>

      {/* Name */}
      <p className="flex-1 text-sm font-medium text-shell-panel-foreground truncate">
        {connection.name}
      </p>

      {resolveSslMode(connection) === 'require-no-verify' && (
        <span className="flex-shrink-0 text-warning" title={t('database.ssl.noVerifyBadge')}>
          <ShieldAlert className="w-3.5 h-3.5" aria-label={t('database.ssl.noVerifyBadge')} />
        </span>
      )}

      {/* Connection Mode Badge (right side) */}
      <span
        className={cn(
          'flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium',
          isLocal ? 'bg-success/20 text-success' : 'bg-info/20 text-info'
        )}
      >
        {isLocal ? (
          <>
            <Home className="w-2.5 h-2.5" />
            {t('sidebar.localBadge', 'Local')}
          </>
        ) : (
          <>
            <Globe className="w-2.5 h-2.5" />
            {t('sidebar.remoteBadge', 'SSH')}
          </>
        )}
      </span>

      <SidebarItemActionsMenu
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        folderMenuItems={folderMenuItems}
        onEdit={onEdit}
        onDelete={onDelete}
        contextMenuPosition={actionContextMenu.contextMenuPosition}
        onCloseContextMenu={actionContextMenu.closeContextMenu}
      />
    </div>
  );
};

export default DBConnectionItem;
