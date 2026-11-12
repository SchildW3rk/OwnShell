/**
 * Workspace View (v1.20.0 - Dynamic Grid Layout)
 *
 * Multi-view workspace with dynamic tiling algorithm
 * Supports any number of panes with automatic grid calculation
 *
 * Layout rules:
 * - 1 pane: Fullscreen
 * - 2 panes: Split (configurable horizontal/vertical)
 * - 3+ panes: Automatic grid with centered incomplete rows
 */

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Panel, Group, Separator } from 'react-resizable-panels';
import {
  useWorkspaceStore,
  calculateGridStructure,
  getPanesForRow,
  WorkspacePane,
  GridStructure,
} from '../../stores/useWorkspaceStore';
import { PaneContent } from './PaneContent';
import { useTranslation } from 'react-i18next';

const PaneContainersContext = React.createContext<Map<string, HTMLDivElement> | null>(null);

// Layout slots move a pane's existing host; its portal and feature state stay mounted.
const PaneSlot: React.FC<{ pane: WorkspacePane }> = ({ pane }) => {
  const slotRef = React.useRef<HTMLDivElement>(null);
  const container = React.useContext(PaneContainersContext)!.get(pane.id)!;

  React.useLayoutEffect(() => {
    const slot = slotRef.current!;
    slot.appendChild(container);
    return () => {
      if (container.parentElement === slot) container.remove();
    };
  }, [container]);

  return <div ref={slotRef} className="h-full w-full min-h-0 min-w-0" />;
};

/**
 * Empty State Component
 */
const EmptyState: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="h-full w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-muted-foreground text-sm">{t('workspace.empty')}</p>
      </div>
    </div>
  );
};

/**
 * Single Pane Component
 */
const SinglePane: React.FC<{ pane: WorkspacePane }> = ({ pane }) => (
  <div className="h-full w-full bg-background">
    <PaneSlot pane={pane} />
  </div>
);

/**
 * Split View Component (2 panes)
 */
const SplitView = React.memo<{
  panes: WorkspacePane[];
  orientation: 'horizontal' | 'vertical';
}>(function SplitView({ panes, orientation }) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <Group orientation={isHorizontal ? 'horizontal' : 'vertical'} className="h-full w-full">
      <Panel defaultSize={50} minSize={20} className="h-full w-full">
        <PaneSlot pane={panes[0]} />
      </Panel>
      <Separator
        className={
          isHorizontal
            ? 'w-px bg-border hover:bg-primary/70 transition-colors cursor-col-resize'
            : 'h-px bg-border hover:bg-primary/70 transition-colors cursor-row-resize'
        }
      />
      <Panel defaultSize={50} minSize={20} className="h-full w-full">
        <PaneSlot pane={panes[1]} />
      </Panel>
    </Group>
  );
});

const ThreePaneView = React.memo<{ panes: WorkspacePane[] }>(function ThreePaneView({ panes }) {
  return (
    <Group orientation="horizontal" className="h-full w-full">
      <Panel defaultSize={54} minSize={25} className="h-full w-full">
        <PaneSlot pane={panes[0]} />
      </Panel>
      <Separator className="w-px bg-border hover:bg-primary/70 transition-colors cursor-col-resize" />
      <Panel defaultSize={46} minSize={25} className="h-full w-full">
        <Group orientation="vertical" className="h-full w-full">
          <Panel defaultSize={50} minSize={20} className="h-full w-full">
            <PaneSlot pane={panes[1]} />
          </Panel>
          <Separator className="h-px bg-border hover:bg-primary/70 transition-colors cursor-row-resize" />
          <Panel defaultSize={50} minSize={20} className="h-full w-full">
            <PaneSlot pane={panes[2]} />
          </Panel>
        </Group>
      </Panel>
    </Group>
  );
});

/**
 * Grid Row Component
 * Renders a single row of panes - incomplete rows stretch to fill available space
 */
const GridRow = React.memo<{
  rowPanes: WorkspacePane[];
  gridStructure: GridStructure;
  isLastRow: boolean;
  rowIndex: number;
}>(function GridRow({ rowPanes, gridStructure, isLastRow, rowIndex }) {
  const { cols } = gridStructure;
  const paneCount = rowPanes.length;

  // For incomplete rows: panes stretch to fill the row (100% / actual pane count)
  // For complete rows: equal distribution based on column count
  const isIncompleteRow = isLastRow && paneCount < cols;
  const paneSize = isIncompleteRow ? 100 / paneCount : 100 / cols;

  return (
    <Group orientation="horizontal" className="h-full w-full">
      {rowPanes.map((pane, colIndex) => (
        <React.Fragment key={pane.id}>
          <Panel
            defaultSize={paneSize}
            minSize={15}
            className="h-full w-full"
            id={`panel-${rowIndex}-${colIndex}`}
          >
            <PaneSlot pane={pane} />
          </Panel>
          {colIndex < paneCount - 1 && (
            <Separator className="w-px bg-border hover:bg-primary/70 transition-colors cursor-col-resize" />
          )}
        </React.Fragment>
      ))}
    </Group>
  );
});

/**
 * Grid View Component (3+ panes)
 * Renders a dynamic grid with rows and columns
 */
const GridView = React.memo<{
  panes: WorkspacePane[];
  gridStructure: GridStructure;
}>(function GridView({ panes, gridStructure }) {
  const { rows } = gridStructure;
  const rowSize = 100 / rows;

  // Memoize row data to avoid re-slicing arrays on every render
  const rowDataList = useMemo(
    () =>
      Array.from({ length: rows }, (_, rowIndex) => ({
        rowPanes: getPanesForRow(panes, rowIndex, gridStructure),
        isLastRow: rowIndex === rows - 1,
        rowIndex,
      })),
    [panes, rows, gridStructure]
  );

  return (
    <Group orientation="vertical" className="h-full w-full">
      {rowDataList.map(({ rowPanes, isLastRow, rowIndex }) => (
        <React.Fragment key={`row-${rowIndex}`}>
          <Panel defaultSize={rowSize} minSize={15} className="h-full w-full">
            <GridRow
              rowPanes={rowPanes}
              gridStructure={gridStructure}
              isLastRow={isLastRow}
              rowIndex={rowIndex}
            />
          </Panel>
          {rowIndex < rows - 1 && (
            <Separator className="h-px bg-border hover:bg-primary/70 transition-colors cursor-row-resize" />
          )}
        </React.Fragment>
      ))}
    </Group>
  );
});

/**
 * Main Workspace View Component
 */
export const WorkspaceView: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
  const panes = useWorkspaceStore((state) => state.panes);
  const twoPaneOrientation = useWorkspaceStore((state) => state.twoPaneOrientation);
  const containersRef = React.useRef<Map<string, HTMLDivElement> | null>(null);
  if (!containersRef.current) containersRef.current = new Map();
  const containers = containersRef.current;

  for (const pane of panes) {
    if (!containers.has(pane.id)) {
      const container = document.createElement('div');
      container.className = 'h-full w-full min-h-0 min-w-0';
      containers.set(pane.id, container);
    }
  }

  React.useEffect(() => {
    const activeIds = new Set(panes.map((pane) => pane.id));
    for (const [id, container] of containers) {
      if (!activeIds.has(id)) {
        container.remove();
        containers.delete(id);
      }
    }
  }, [containers, panes]);

  const gridStructure = useMemo(
    () => calculateGridStructure(panes.length, twoPaneOrientation),
    [panes.length, twoPaneOrientation]
  );

  let layout: React.ReactNode;
  if (panes.length === 3) {
    layout = <ThreePaneView panes={panes} />;
  } else {
    switch (gridStructure.type) {
      case 'single':
        layout = <SinglePane pane={panes[0]} />;
        break;
      case 'split':
        layout = <SplitView panes={panes} orientation={twoPaneOrientation} />;
        break;
      case 'grid':
        layout = <GridView panes={panes} gridStructure={gridStructure} />;
        break;
      default:
        layout = <EmptyState />;
    }
  }

  return (
    <PaneContainersContext.Provider value={containers}>
      {layout}
      {panes.map((pane) =>
        createPortal(
          <PaneContent pane={pane} isVisible={isVisible} />,
          containers.get(pane.id)!,
          pane.id
        )
      )}
    </PaneContainersContext.Provider>
  );
};
