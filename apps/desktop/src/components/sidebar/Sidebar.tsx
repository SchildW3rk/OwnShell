/**
 * Sidebar (v1.18.0)
 *
 * VS Code-style sidebar with icon navigation + content panel
 * - Left: Vertical icon nav bar
 * - Right: Active section content (full height)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@ownshell/ui';
import { useSidebar } from './SidebarContext';
import { SidebarNav, SidebarNavItem, SidebarSectionId } from './SidebarNav';

interface SidebarProps {
  /** Navigation items */
  navItems: SidebarNavItem[];
  /** Active section */
  activeSection: SidebarSectionId;
  /** Section change handler */
  onSectionChange: (section: SidebarSectionId) => void;
  /** Content for each section (render only active) */
  children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  navItems,
  activeSection,
  onSectionChange,
  children,
}) => {
  const { t } = useTranslation();
  const { mode, setMode } = useSidebar();
  const isPanelOpen = mode === 'expanded';
  const handleSectionChange = React.useCallback(
    (section: SidebarSectionId) => {
      onSectionChange(section);
      if (mode === 'collapsed') {
        setMode('expanded');
      }
    },
    [mode, onSectionChange, setMode]
  );

  return (
    <aside className="flex min-w-12 flex-shrink-0 bg-shell-rail">
      {/* Icon Navigation */}
      <SidebarNav
        items={navItems}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />

      {/* Content Panel */}
      <div
        className={cn(
          'min-w-0 flex flex-col overflow-hidden bg-shell-panel border-r border-shell-panel-border transition-[width,opacity,border-color] duration-200 ease-out',
          isPanelOpen ? 'w-80 opacity-100' : 'w-0 border-transparent opacity-0'
        )}
        aria-hidden={!isPanelOpen}
      >
        <div
          className={cn(
            'flex-1 min-h-0 w-80 overflow-hidden transition-opacity duration-150',
            !isPanelOpen && 'pointer-events-none'
          )}
        >
          {children}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setMode(isPanelOpen ? 'collapsed' : 'expanded')}
        className="group flex w-3 flex-shrink-0 items-center justify-center border-r border-shell-rail-border bg-shell-rail text-shell-rail-muted transition-colors hover:bg-shell-rail-hover hover:text-shell-rail-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-shell-focus-soft"
        title={isPanelOpen ? t('sidebar.collapse') : t('sidebar.expand')}
        aria-label={isPanelOpen ? t('sidebar.collapse') : t('sidebar.expand')}
      >
        <ChevronLeft
          className={cn(
            'h-3 w-3 transition-transform duration-200 group-hover:scale-110',
            !isPanelOpen && 'rotate-180'
          )}
        />
      </button>
    </aside>
  );
};
