/**
 * HostItem Component (v1.18.0)
 *
 * Compact host item in the sidebar list
 * Shows only icon + name + sublabel (details are in the modal)
 * Supports slim mode (icon-only with tooltip)
 */

import React from 'react';
import { HostsTable } from '@ownshell/core';
import { Server, Key, FolderOpen } from 'lucide-react';
import { cn } from '@ownshell/ui';
import type { DropdownMenuItem } from '@ownshell/ui';
import {
  SidebarItemActionsMenu,
  useSidebarItemContextMenu,
} from './sidebar/SidebarItemActionsMenu';

export interface HostItemProps {
  host: HostsTable;
  hosts: HostsTable[]; // All hosts for looking up jump host label
  isActive?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  folderMenuItems?: DropdownMenuItem[];
  /** Slim mode: show icon-only with tooltip */
  isSlim?: boolean;
}

export const HostItem: React.FC<HostItemProps> = ({
  host,
  hosts,
  isActive,
  onClick,
  onEdit,
  onDelete,
  isFavorite,
  onToggleFavorite,
  folderMenuItems,
  isSlim,
}) => {
  const hasActions = Boolean(onToggleFavorite || folderMenuItems?.length || onEdit || onDelete);
  const actionContextMenu = useSidebarItemContextMenu(hasActions);

  // Find jump host label if this host uses one (for tooltip)
  const jumpHost = host.jump_host_id ? hosts.find((h) => h.id === host.jump_host_id) : null;

  // Get the appropriate icon
  const IconComponent =
    host.connection_type === 'sftp_only' ? FolderOpen : host.auth_type === 'key' ? Key : Server;

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
            <IconComponent className="w-3 h-3" />
          </div>
        </button>

        {/* Tooltip with full details */}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1.5 bg-shell-panel border border-shell-panel-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg min-w-[150px]">
          <div className="font-medium text-shell-panel-foreground">{host.label}</div>
          <div className="text-shell-panel-muted mt-0.5">
            {host.username}@{host.hostname}
            {host.port !== 22 && `:${host.port}`}
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] px-1 py-0.5 rounded bg-info/30 text-info">
              {host.auth_type}
            </span>
            {host.connection_type === 'sftp_only' && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-warning/20 text-warning">
                SFTP
              </span>
            )}
            {jumpHost && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-warning/30 text-warning">
                via {jumpHost.label}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Expanded mode: Compact item (icon + name + sublabel only)
  return (
    <div
      className={cn(
        'group w-full flex items-center gap-2 p-2 rounded-md transition-colors no-drag cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-focus-soft',
        isActive
          ? 'bg-shell-panel-active/10 border border-shell-panel-active'
          : 'hover:bg-shell-panel-hover text-shell-panel-foreground'
      )}
      onClick={onClick}
      onContextMenu={actionContextMenu.handleContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded flex items-center justify-center',
          isActive
            ? 'bg-shell-control-active text-shell-control-active-foreground'
            : 'bg-shell-control text-shell-control-foreground'
        )}
      >
        <IconComponent className="w-3.5 h-3.5" />
      </div>

      {/* Name only */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-shell-panel-foreground truncate">{host.label}</div>
      </div>

      {hasActions && (
        <SidebarItemActionsMenu
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          folderMenuItems={folderMenuItems}
          onEdit={onEdit}
          onDelete={onDelete}
          contextMenuPosition={actionContextMenu.contextMenuPosition}
          onCloseContextMenu={actionContextMenu.closeContextMenu}
        />
      )}
    </div>
  );
};
