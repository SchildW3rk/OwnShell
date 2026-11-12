/**
 * Tabs Component
 *
 * Theme-aware tab navigation with multiple visual variants:
 * - "underline": Bottom border indicator (default)
 * - "pills": Rounded pill/button style with filled active state
 *
 * Supports Dark/Light mode via CSS variables, icons, counts, and disabled state.
 */

import React from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Optional count badge displayed after the label */
  count?: number;
}

export type TabsVariant = 'underline' | 'pills';

export interface TabsProps {
  /** Tab items */
  tabs: Tab[];
  /** Currently active tab ID */
  activeTab: string;
  /** Callback when tab changes */
  onChange: (tabId: string) => void;
  /** Visual variant: "underline" (default) or "pills" */
  variant?: TabsVariant;
  /** Custom container class */
  className?: string;
  /** Additional content rendered after the tabs (e.g., info badges) */
  trailing?: React.ReactNode;
}

function getContainerClassName(variant: TabsVariant, className: string): string {
  const base = 'flex items-center';
  if (variant === 'pills') {
    return `${base} gap-1 ${className}`;
  }
  return `${base} gap-2 border-b border-border ${className}`;
}

function getButtonClassName(variant: TabsVariant, isActive: boolean, isDisabled: boolean): string {
  const base = 'flex items-center text-sm transition-colors';

  if (isDisabled) {
    return `${base} cursor-not-allowed text-muted-foreground opacity-50`;
  }

  if (variant === 'pills') {
    if (isActive) {
      return `${base} gap-1.5 px-3 py-1.5 rounded bg-primary text-white`;
    }
    return `${base} gap-1.5 px-3 py-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary`;
  }

  // underline
  if (isActive) {
    return `${base} gap-2 px-4 py-2 border-b-2 border-primary text-foreground`;
  }
  return `${base} gap-2 px-4 py-2 text-muted-foreground hover:text-foreground`;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
  trailing,
}) => {
  return (
    <div className={getContainerClassName(variant, className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const isDisabled = !!tab.disabled;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => !isDisabled && onChange(tab.id)}
            disabled={isDisabled}
            className={getButtonClassName(variant, isActive, isDisabled)}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-xs ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                ({tab.count})
              </span>
            )}
          </button>
        );
      })}
      {trailing}
    </div>
  );
};
