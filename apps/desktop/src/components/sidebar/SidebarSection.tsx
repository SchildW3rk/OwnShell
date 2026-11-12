/**
 * Sidebar Section (v1.18.0)
 *
 * Full-height section content panel
 * Shows title + add button + scrollable items
 */

import React from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@ownshell/ui';

interface SidebarSectionProps {
  /** Section title */
  title: string;
  /** Add button click handler */
  onAdd?: () => void;
  /** Custom header actions */
  headerActions?: React.ReactNode;
  /** Section children (items) */
  children: React.ReactNode;
  /** Empty state message */
  emptyMessage?: string;
  /** Loading state */
  isLoading?: boolean;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  title,
  onAdd,
  children,
  emptyMessage,
  isLoading,
  headerActions,
}) => {
  return (
    <div className="flex flex-col h-full">
      {/* Section Header - Fixed height h-10 (40px) */}
      <div className="flex-shrink-0 h-10 flex items-center justify-between px-3 border-b border-shell-panel-border">
        <span className="text-xs font-semibold text-shell-panel-muted uppercase tracking-wider">
          {title}
        </span>

        {/* Placeholder to keep consistent height even without add button */}
        <div className="min-w-6 h-6 flex items-center justify-center">
          {headerActions ||
            (onAdd && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAdd}
              className="no-drag h-6 w-6 p-0 text-shell-panel-muted hover:text-shell-panel-foreground"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          ))}
        </div>
      </div>

      {/* Section Content - Scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-shell-panel-muted" />
          </div>
        ) : React.Children.count(children) === 0 && emptyMessage ? (
          <div className="text-center py-8">
            <p className="text-xs text-shell-panel-muted">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-1">{children}</div>
        )}
      </div>
    </div>
  );
};
