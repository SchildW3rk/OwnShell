/**
 * Sidebar Components (v1.18.0)
 *
 * VS Code-style sidebar with icon navigation:
 * - SidebarNav: Stable vertical icon rail
 * - Sidebar: Main container (rail + animated content panel + edge handle)
 * - SidebarSection: Full-height content panel
 */

// Types
export * from './types';

// Context & Provider
export { SidebarProvider, useSidebar } from './SidebarContext';

// Components
export { Sidebar } from './Sidebar';
export { SidebarNav, type SidebarNavItem, type SidebarSectionId } from './SidebarNav';
export { SidebarSection } from './SidebarSection';
export { SidebarItem } from './SidebarItem';
