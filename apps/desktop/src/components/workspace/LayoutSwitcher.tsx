/**
 * Layout Switcher (v1.20.0 - Dynamic Grid Layout)
 *
 * Simplified toggle for 2-pane orientation
 * Only visible when exactly 2 panes are present
 */

import React from 'react';
import { Columns2, Rows2 } from 'lucide-react';
import { Button, cn } from '@ownshell/ui';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';

export const LayoutSwitcher: React.FC = () => {
  const paneCount = useWorkspaceStore((state) => state.panes.length);
  const twoPaneOrientation = useWorkspaceStore((state) => state.twoPaneOrientation);
  const setTwoPaneOrientation = useWorkspaceStore((state) => state.setTwoPaneOrientation);

  // Only show when exactly 2 panes are present
  if (paneCount !== 2) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setTwoPaneOrientation('horizontal')}
        className={cn(
          'h-8 w-8 p-0',
          twoPaneOrientation === 'horizontal' &&
            'bg-primary text-primary-foreground hover:bg-primary'
        )}
        title="Split Horizontal (Side by Side)"
      >
        <Columns2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setTwoPaneOrientation('vertical')}
        className={cn(
          'h-8 w-8 p-0',
          twoPaneOrientation === 'vertical' && 'bg-primary text-primary-foreground hover:bg-primary'
        )}
        title="Split Vertical (Stacked)"
      >
        <Rows2 className="h-4 w-4" />
      </Button>
    </div>
  );
};
