/**
 * SidebarNav (v1.18.0)
 *
 * Vertical icon navigation bar (like VS Code)
 * Shows section icons with tooltips, highlights active section
 */

import React from 'react';
import { cn } from '@ownshell/ui';

export type SidebarSectionId =
  | 'projects'
  | 'servers'
  | 'databases'
  | 'filetransfer'
  | 'storage'
  | 'security'
  | 'api';

export interface SidebarNavItem {
  id: SidebarSectionId;
  icon: React.ReactNode;
  label: string;
  count?: number;
  disabled?: boolean;
}

interface SidebarNavProps {
  items: SidebarNavItem[];
  activeSection: SidebarSectionId;
  onSectionChange: (section: SidebarSectionId) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  items,
  activeSection,
  onSectionChange,
}) => {
  return (
    <div className="flex w-12 flex-shrink-0 flex-col border-r border-shell-rail-border bg-shell-rail">
      {/* Navigation Items */}
      {items.map((item) => {
        const isActive = activeSection === item.id;
        const isDisabled = item.disabled === true;

        return (
          <div key={item.id} className="relative group">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) onSectionChange(item.id);
              }}
              className={cn(
                'relative flex h-12 w-full items-center justify-center transition-colors',
                isActive
                  ? 'bg-shell-rail-hover text-shell-rail-active'
                  : 'text-shell-rail-muted hover:bg-shell-rail-hover hover:text-shell-rail-foreground',
                isDisabled && 'cursor-default opacity-35 hover:bg-transparent hover:text-shell-rail-muted'
              )}
              aria-label={item.label}
            >
              {/* Active indicator (left border) */}
              {isActive && (
                <div className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r bg-shell-rail-active" />
              )}

              {/* Icon */}
              <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>

              {/* Count badge */}
              {item.count !== undefined && item.count > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-shell-rail-border bg-shell-panel px-1 text-[10px] font-medium text-shell-rail-active shadow-sm">
                  {item.count > 99 ? '99+' : item.count}
                </span>
              )}
            </button>

            {/* Tooltip */}
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-shell-panel border border-shell-panel-border rounded text-xs text-shell-panel-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
              {item.label}
              {item.count !== undefined && (
                <span className="ml-1 text-shell-panel-muted">({item.count})</span>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex-1" />
    </div>
  );
};
