import React, { useState } from 'react';
import type { ApiRequestsTable } from '@ownshell/core';
import { Button, cn } from '@ownshell/ui';
import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ContextMenu } from './ContextMenu';
import { methodColors, methodShort } from './method-badges';
import type { ContextMenuItem } from './types';

interface RequestItemProps {
  request: ApiRequestsTable;
  isActive: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (delta: -1 | 1) => void;
  depth?: number;
}

export const RequestItem: React.FC<RequestItemProps> = ({
  request,
  isActive,
  onClick,
  onEdit,
  onDelete,
  onDuplicate,
  onMove,
  depth = 0,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const { t } = useTranslation();
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const contextMenuItems: ContextMenuItem[] = [
    { label: t('common.edit'), icon: <Pencil className="w-4 h-4" />, onClick: onEdit },
    { label: t('common.duplicate'), icon: <Copy className="w-4 h-4" />, onClick: onDuplicate },
    { label: t('api.sidebar.moveUp'), icon: <ArrowUp className="w-4 h-4" />, onClick: () => onMove(-1) },
    { label: t('api.sidebar.moveDown'), icon: <ArrowDown className="w-4 h-4" />, onClick: () => onMove(1) },
    {
      label: t('common.delete'),
      icon: <Trash2 className="w-4 h-4" />,
      onClick: onDelete,
      variant: 'danger',
    },
  ];

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => event.key === 'Enter' && onClick()}
        onContextMenu={handleContextMenu}
        className={cn(
          'group flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors text-left',
          isActive ? 'bg-sidebar-accent/10 border border-primary' : 'hover:bg-sidebar-accent/10'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span
          className={cn(
            'flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold',
            request.kind === 'websocket' ? 'bg-teal-600 text-white' : methodColors[request.method]
          )}
        >
          {request.kind === 'websocket' ? 'WS' : methodShort[request.method]}
        </span>

        <span className="flex-1 text-sm text-foreground truncate">{request.name}</span>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              setContextMenu({ x: event.clientX, y: event.clientY });
            }}
            className="no-drag h-5 w-5 p-0"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};
