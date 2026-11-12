/**
 * Workspace Store (v1.20.0 - Dynamic Grid Layout)
 *
 * Manages multi-view workspace layout with dynamic tiling
 *
 * Features:
 * - Dynamic grid calculation based on pane count
 * - Automatic layout (1=single, 2=split, 3+=grid)
 * - Configurable 2-pane orientation
 * - Centered last row for incomplete grids
 */

import { create } from 'zustand';
import { useDBExplorerViewStore } from './useDBExplorerViewStore';

// DBExplorerView keys its per-pane state as `view:${pane.id}`.
function clearDBViewState(panes: WorkspacePane[]): void {
  const { clearViewState } = useDBExplorerViewStore.getState();
  for (const pane of panes) {
    if (pane.type === 'database') clearViewState(`view:${pane.id}`);
  }
}

/**
 * Pane Type
 * Defines what content is displayed in a pane
 */
export type PaneType =
  | 'project'
  | 'terminal'
  | 's3'
  | 'database'
  | 'sftp'
  | 'api'
  | 'vault'
  | 'docker';

/**
 * Workspace Pane
 * Represents a single panel in the workspace
 */
export interface WorkspacePane {
  id: string;
  type: PaneType;
  contentId: string;
  title: string;
}

/**
 * Two-Pane Orientation
 * Only applies when exactly 2 panes are present
 */
export type TwoPaneOrientation = 'horizontal' | 'vertical';

/**
 * Grid Structure
 * Calculated layout structure for rendering
 */
export interface GridStructure {
  type: 'empty' | 'single' | 'split' | 'grid';
  rows: number;
  cols: number;
  orientation?: TwoPaneOrientation;
  lastRowPaneCount: number; // How many panes in the last row (for centering)
}

/**
 * Calculate optimal grid dimensions for a given pane count
 * Returns rows and columns that minimize empty space
 */
function calculateGridDimensions(paneCount: number): { rows: number; cols: number } {
  if (paneCount <= 0) return { rows: 0, cols: 0 };
  if (paneCount === 1) return { rows: 1, cols: 1 };
  if (paneCount === 2) return { rows: 1, cols: 2 };

  // For 3+ panes: calculate optimal rectangle
  // Use ceiling of square root for columns, then calculate rows
  const cols = Math.ceil(Math.sqrt(paneCount));
  const rows = Math.ceil(paneCount / cols);

  return { rows, cols };
}

/**
 * Calculate the complete grid structure for rendering
 * Exported for use in WorkspaceView
 */
export function calculateGridStructure(
  paneCount: number,
  twoPaneOrientation: TwoPaneOrientation
): GridStructure {
  if (paneCount === 0) {
    return { type: 'empty', rows: 0, cols: 0, lastRowPaneCount: 0 };
  }

  if (paneCount === 1) {
    return { type: 'single', rows: 1, cols: 1, lastRowPaneCount: 1 };
  }

  if (paneCount === 2) {
    return {
      type: 'split',
      rows: twoPaneOrientation === 'vertical' ? 2 : 1,
      cols: twoPaneOrientation === 'horizontal' ? 2 : 1,
      orientation: twoPaneOrientation,
      lastRowPaneCount: twoPaneOrientation === 'vertical' ? 1 : 2,
    };
  }

  // 3+ panes: Grid layout
  const { rows, cols } = calculateGridDimensions(paneCount);
  const lastRowPaneCount = paneCount - (rows - 1) * cols;

  return {
    type: 'grid',
    rows,
    cols,
    lastRowPaneCount,
  };
}

/**
 * Get panes for a specific row in the grid
 * Exported for use in WorkspaceView
 */
export function getPanesForRow(
  panes: WorkspacePane[],
  rowIndex: number,
  gridStructure: GridStructure
): WorkspacePane[] {
  const { cols } = gridStructure;
  const startIndex = rowIndex * cols;
  const endIndex = startIndex + cols;

  return panes.slice(startIndex, endIndex);
}

/**
 * Workspace State
 */
interface WorkspaceState {
  panes: WorkspacePane[];
  activePaneId: string | null;
  twoPaneOrientation: TwoPaneOrientation;

  // Actions
  addPane: (pane: Omit<WorkspacePane, 'id'>) => string;
  removePane: (paneId: string) => void;
  updatePane: (paneId: string, updates: Partial<Omit<WorkspacePane, 'id'>>) => void;
  setActivePane: (paneId: string) => void;
  setTwoPaneOrientation: (orientation: TwoPaneOrientation) => void;
  clearAll: () => void;
}

/**
 * Workspace Store
 */
export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  panes: [],
  activePaneId: null,
  twoPaneOrientation: 'horizontal', // Default: side-by-side

  /**
   * Add pane to workspace
   * Layout is calculated dynamically based on pane count
   */
  addPane: (paneData: Omit<WorkspacePane, 'id'>) => {
    const id = `pane-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const pane: WorkspacePane = {
      id,
      ...paneData,
    };

    set((state) => ({
      panes: [...state.panes, pane],
      activePaneId: id, // Automatically focus new pane
    }));

    return id;
  },

  /**
   * Remove pane from workspace
   */
  removePane: (paneId: string) => {
    clearDBViewState(get().panes.filter((p) => p.id === paneId));
    set((state) => {
      const newPanes = state.panes.filter((p) => p.id !== paneId);

      // If removing active pane, switch to another
      let newActivePaneId = state.activePaneId;
      if (state.activePaneId === paneId) {
        newActivePaneId = newPanes.length > 0 ? newPanes[0].id : null;
      }

      return {
        panes: newPanes,
        activePaneId: newActivePaneId,
      };
    });
  },

  /**
   * Update pane properties
   */
  updatePane: (paneId: string, updates: Partial<Omit<WorkspacePane, 'id'>>) => {
    set((state) => ({
      panes: state.panes.map((pane) => (pane.id === paneId ? { ...pane, ...updates } : pane)),
    }));
  },

  /**
   * Set active pane
   */
  setActivePane: (paneId: string) => {
    set({ activePaneId: paneId });
  },

  /**
   * Set orientation for 2-pane layout
   */
  setTwoPaneOrientation: (orientation: TwoPaneOrientation) => {
    set({ twoPaneOrientation: orientation });
  },

  /**
   * Clear all panes
   */
  clearAll: () => {
    clearDBViewState(get().panes);
    set({ panes: [], activePaneId: null });
  },
}));
