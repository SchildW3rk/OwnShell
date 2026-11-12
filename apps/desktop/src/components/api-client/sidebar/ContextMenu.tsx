import React from 'react';
import { cn } from '@ownshell/ui';
import type { ContextMenuItem } from './types';

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  React.useEffect(() => {
    const handleClick = () => onClose();
    const handleEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            item.onClick();
            onClose();
          }}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors',
            item.variant === 'danger'
              ? 'text-destructive hover:bg-destructive/10'
              : 'text-foreground hover:bg-primary/10'
          )}
        >
          <span className="w-4 h-4">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
};
