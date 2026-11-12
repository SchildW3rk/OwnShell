import React from 'react';
import { useTranslation } from 'react-i18next';
import { FolderInput, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import { DropdownMenu, cn } from '@ownshell/ui';
import type { DropdownMenuItem } from '@ownshell/ui';

interface SidebarItemActionsMenuProps {
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  folderMenuItems?: DropdownMenuItem[];
  onEdit?: () => void;
  onDelete?: () => void;
  contextMenuPosition?: { x: number; y: number } | null;
  onCloseContextMenu?: () => void;
  className?: string;
}

export function useSidebarItemContextMenu(enabled: boolean) {
  const [contextMenuPosition, setContextMenuPosition] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent) => {
      if (!enabled) return;

      event.preventDefault();
      event.stopPropagation();
      setContextMenuPosition({ x: event.clientX, y: event.clientY });
    },
    [enabled]
  );

  const closeContextMenu = React.useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  return {
    contextMenuPosition,
    handleContextMenu,
    closeContextMenu,
  };
}

export const SidebarItemActionsMenu: React.FC<SidebarItemActionsMenuProps> = ({
  isFavorite,
  onToggleFavorite,
  folderMenuItems,
  onEdit,
  onDelete,
  contextMenuPosition,
  onCloseContextMenu,
  className,
}) => {
  const { t } = useTranslation();

  const items: DropdownMenuItem[] = [];

  if (onToggleFavorite) {
    items.push({
      id: 'favorite',
      label: isFavorite
        ? t('sidebar.removeFavorite', 'Remove favorite')
        : t('sidebar.addFavorite', 'Add favorite'),
      icon: (
        <Star
          className={cn(
            'h-4 w-4',
            isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-shell-panel-muted'
          )}
        />
      ),
      onClick: onToggleFavorite,
    });
  }

  if (folderMenuItems?.length) {
    items.push(
      ...folderMenuItems.map((item) => ({
        ...item,
        id: `folder-${item.id}`,
        icon: item.icon ?? <FolderInput className="h-4 w-4" />,
      }))
    );
  }

  if (onEdit) {
    items.push({
      id: 'edit',
      label: t('common.edit', 'Edit'),
      icon: <Pencil className="h-4 w-4" />,
      onClick: onEdit,
    });
  }

  if (onDelete) {
    items.push({
      id: 'delete',
      label: t('common.delete', 'Delete'),
      icon: <Trash2 className="h-4 w-4" />,
      variant: 'danger',
      onClick: onDelete,
    });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'pointer-events-none flex-shrink-0 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100',
        contextMenuPosition && 'pointer-events-auto opacity-100',
        className
      )}
    >
      <DropdownMenu
        items={items}
        align="right"
        trigger={<MoreHorizontal className="h-4 w-4" />}
        triggerClassName="no-drag flex h-6 w-6 items-center justify-center rounded text-shell-panel-muted hover:bg-shell-panel-hover hover:text-shell-panel-foreground"
      />
      {contextMenuPosition && onCloseContextMenu && (
        <SidebarFloatingActionMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          items={items}
          onClose={onCloseContextMenu}
        />
      )}
    </div>
  );
};

interface SidebarFloatingActionMenuProps {
  x: number;
  y: number;
  items: DropdownMenuItem[];
  onClose: () => void;
}

const SidebarFloatingActionMenu: React.FC<SidebarFloatingActionMenuProps> = ({
  x,
  y,
  items,
  onClose,
}) => {
  React.useEffect(() => {
    const handleClick = () => onClose();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const menuWidth = 224;
  const menuHeight = Math.max(40, items.length * 36 + 8);
  const left =
    typeof window === 'undefined'
      ? x
      : Math.min(x, Math.max(8, window.innerWidth - menuWidth - 8));
  const top =
    typeof window === 'undefined'
      ? y
      : Math.min(y, Math.max(8, window.innerHeight - menuHeight - 8));

  return (
    <div
      className="fixed z-50 w-56 rounded-lg border border-border bg-card py-1 shadow-xl"
      style={{ left, top }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            item.onClick();
            onClose();
          }}
          className={cn(
            'flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-sm transition-colors duration-200',
            item.variant === 'danger'
              ? 'text-destructive hover:bg-secondary'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          )}
        >
          {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
};
