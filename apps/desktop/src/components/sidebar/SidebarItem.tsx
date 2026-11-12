/**
 * Sidebar Item (v1.18.0)
 *
 * Individual clickable item with icon, label, and actions
 * Unified active state: subtle background + border (matches HostItem, DBConnectionItem)
 * Supports slim mode (icon-only with tooltip)
 */

import React from 'react';
import { cn } from '@ownshell/ui';
import { useSidebar } from './SidebarContext';
import { SidebarItemProps } from './types';
import { SidebarItemActionsMenu, useSidebarItemContextMenu } from './SidebarItemActionsMenu';

/**
 * Badge variant colors
 */
const badgeVariants = {
  default: 'bg-shell-control text-shell-panel-muted',
  success: 'bg-success/20 text-success',
  info: 'bg-info/20 text-info',
  warning: 'bg-warning/20 text-warning',
};

export const SidebarItem: React.FC<SidebarItemProps> = ({
  label,
  sublabel,
  icon,
  isActive,
  onClick,
  onEdit,
  onDelete,
  badge,
  iconColorClass = 'text-shell-panel-muted',
  isFavorite,
  onToggleFavorite,
  folderMenuItems,
}) => {
  const { isSlim } = useSidebar();
  const hasActions = Boolean(onToggleFavorite || folderMenuItems?.length || onEdit || onDelete);
  const actionContextMenu = useSidebarItemContextMenu(hasActions);

  if (isSlim) {
    // Slim mode: Icon only with tooltip
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
            <span className={cn('w-3 h-3', isActive ? '' : iconColorClass)}>{icon}</span>
          </div>
        </button>

        {/* Tooltip */}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1.5 bg-shell-panel border border-shell-panel-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
          <div className="font-medium text-shell-panel-foreground">{label}</div>
          {sublabel && <div className="text-shell-panel-muted mt-0.5">{sublabel}</div>}
          {badge && (
            <span
              className={cn(
                'inline-block mt-1 px-1.5 py-0.5 rounded text-[10px]',
                badgeVariants[badge.variant]
              )}
            >
              {badge.label}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Expanded mode: Full item with label and actions
  return (
    // biome-ignore lint/a11y/useSemanticElements: can't use button due to nested buttons inside
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={actionContextMenu.handleContextMenu}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className={cn(
        'w-full group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors text-left',
        isActive
          ? 'bg-shell-panel-active/10 border border-shell-panel-active'
          : 'hover:bg-shell-panel-hover text-shell-panel-foreground'
      )}
    >
      {/* Icon Container */}
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded flex items-center justify-center',
          isActive
            ? 'bg-shell-control-active text-shell-control-active-foreground'
            : 'bg-shell-control text-shell-control-foreground'
        )}
      >
        <span className={cn('w-3.5 h-3.5', isActive ? '' : iconColorClass)}>{icon}</span>
      </div>

      {/* Name */}
      <p className="flex-1 text-sm font-medium text-shell-panel-foreground truncate">{label}</p>

      {/* Badge (right side) */}
      {badge && (
        <span
          className={cn(
            'flex-shrink-0 px-1.5 py-0.5 rounded text-[10px]',
            badgeVariants[badge.variant]
          )}
        >
          {badge.label}
        </span>
      )}

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
