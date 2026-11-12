/**
 * Sidebar Types (v1.15.0)
 *
 * Types for the collapsible sidebar system
 */

import type { DropdownMenuItem } from '@ownshell/ui';

/**
 * Sidebar display modes
 * - expanded: Icon rail plus full content panel
 * - slim: Icon rail only with tooltips
 * - collapsed: Icon rail only, content panel hidden
 */
export type SidebarMode = 'expanded' | 'slim' | 'collapsed';

/**
 * Sidebar context value
 */
export interface SidebarContextValue {
  /** Current sidebar mode */
  mode: SidebarMode;
  /** Set sidebar mode */
  setMode: (mode: SidebarMode) => void;
  /** Toggle between expanded and slim */
  toggleSlim: () => void;
  /** Toggle between current and collapsed */
  toggleCollapsed: () => void;
  /** Whether sidebar is in slim mode */
  isSlim: boolean;
  /** Whether sidebar is collapsed */
  isCollapsed: boolean;
  /** Whether sidebar is expanded */
  isExpanded: boolean;
}

/**
 * Sidebar section props
 */
export interface SidebarSectionProps {
  /** Section title */
  title: string;
  /** Item count badge */
  count?: number;
  /** Add button click handler */
  onAdd?: () => void;
  /** Section children (items) */
  children: React.ReactNode;
  /** Empty state message */
  emptyMessage?: string;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Sidebar item props
 */
export interface SidebarItemProps {
  /** Item label */
  label: string;
  /** Sublabel (e.g., hostname, bucket name) */
  sublabel?: string;
  /** Icon component */
  icon: React.ReactNode;
  /** Whether item is active/selected */
  isActive?: boolean;
  /** Click handler */
  onClick: () => void;
  /** Edit handler */
  onEdit?: () => void;
  /** Delete handler */
  onDelete?: () => void;
  /** Whether item is marked as favorite */
  isFavorite?: boolean;
  /** Favorite toggle handler */
  onToggleFavorite?: () => void;
  /** Folder move menu entries */
  folderMenuItems?: DropdownMenuItem[];
  /** Optional badge (e.g., "Local", "SSH") */
  badge?: {
    label: string;
    variant: 'default' | 'success' | 'info' | 'warning';
  };
  /** Custom icon color class */
  iconColorClass?: string;
}

/**
 * Sidebar widths for each mode
 */
export const SIDEBAR_WIDTHS = {
  rail: 48, // w-12
  handle: 12, // w-3
  panelExpanded: 320, // w-80
  panelCollapsed: 0, // w-0
} as const;

/**
 * LocalStorage key for sidebar state
 */
export const SIDEBAR_STORAGE_KEY = 'ownshell:sidebar:mode';
