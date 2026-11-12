import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DropdownMenuItem } from '@ownshell/ui';
import { Button, DropdownMenu, cn } from '@ownshell/ui';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderX,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import type { SidebarFolderResourceType, SidebarFoldersTable } from '@ownshell/core';
import {
  useCreateSidebarFolder,
  useDeleteSidebarFolder,
  useSidebarFolders,
  useUpdateSidebarFolder,
} from '../../hooks/useSidebarFolders';
import { ResourceFolderDialog } from './ResourceFolderDialog';
import { SidebarSection } from './SidebarSection';

export interface SidebarItemOrganizationActions {
  isFavorite: boolean;
  onToggleFavorite: () => void;
  folderMenuItems: DropdownMenuItem[];
}

interface OrganizedItemMeta {
  id: string;
  label: string;
  favorite: number;
  folder_id: string | null;
  sort_order: number;
  created_at: number;
}

interface OrganizedSidebarSectionProps<TItem> {
  title: string;
  resourceType: SidebarFolderResourceType;
  items: TItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  addTitle: string;
  onAddItem: () => void;
  onRefreshItems?: () => void | Promise<void>;
  getItemMeta: (item: TItem) => OrganizedItemMeta;
  onUpdateItemOrganization: (
    item: TItem,
    update: { favorite?: number; folder_id?: string | null }
  ) => void | Promise<void>;
  renderItem: (item: TItem, actions: SidebarItemOrganizationActions) => React.ReactNode;
}

function sortItems<TItem>(items: TItem[], getItemMeta: (item: TItem) => OrganizedItemMeta) {
  return [...items].sort((a, b) => {
    const aMeta = getItemMeta(a);
    const bMeta = getItemMeta(b);

    if (aMeta.sort_order !== bMeta.sort_order) {
      return aMeta.sort_order - bMeta.sort_order;
    }

    if (aMeta.created_at !== bMeta.created_at) {
      return bMeta.created_at - aMeta.created_at;
    }

    return aMeta.label.localeCompare(bMeta.label);
  });
}

export function OrganizedSidebarSection<TItem>({
  title,
  resourceType,
  items,
  isLoading,
  emptyMessage,
  addTitle,
  onAddItem,
  onRefreshItems,
  getItemMeta,
  onUpdateItemOrganization,
  renderItem,
}: OrganizedSidebarSectionProps<TItem>) {
  const { t } = useTranslation();
  const { data: folders = [], isLoading: isLoadingFolders } = useSidebarFolders(resourceType);
  const createFolder = useCreateSidebarFolder(resourceType);
  const updateFolder = useUpdateSidebarFolder(resourceType);
  const deleteFolder = useDeleteSidebarFolder(resourceType);

  const [dialogState, setDialogState] = React.useState<
    | { mode: 'create'; folder?: undefined }
    | { mode: 'rename'; folder: SidebarFoldersTable }
    | null
  >(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = React.useState<Set<string>>(new Set());

  const favorites = sortItems(
    items.filter((item) => getItemMeta(item).favorite === 1),
    getItemMeta
  );
  const regularItems = items.filter((item) => getItemMeta(item).favorite !== 1);
  const ungroupedItems = sortItems(
    regularItems.filter((item) => !getItemMeta(item).folder_id),
    getItemMeta
  );

  const sortedFolders = [...folders].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });

  const folderItems = sortedFolders.map((folder) => ({
    folder,
    items: sortItems(
      regularItems.filter((item) => getItemMeta(item).folder_id === folder.id),
      getItemMeta
    ),
  }));

  const hasContent = items.length > 0 || folders.length > 0;
  const isBusy = isLoading || isLoadingFolders;

  const handleFolderSubmit = async (name: string) => {
    if (!dialogState) return;

    if (dialogState.mode === 'create') {
      await createFolder.mutateAsync(name);
    } else {
      await updateFolder.mutateAsync({
        id: dialogState.folder.id,
        update: { name },
      });
    }

    setDialogState(null);
  };

  const handleDeleteFolder = async (folder: SidebarFoldersTable) => {
    await deleteFolder.mutateAsync(folder.id);
    await onRefreshItems?.();
  };

  const toggleFolder = (folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const runOrganizationUpdate = (
    item: TItem,
    update: { favorite?: number; folder_id?: string | null }
  ) => {
    Promise.resolve(onUpdateItemOrganization(item, update)).catch((error) => {
      console.error('Failed to update sidebar item organization:', error);
    });
  };

  const createItemActions = (item: TItem): SidebarItemOrganizationActions => {
    const itemMeta = getItemMeta(item);
    const isFavorite = itemMeta.favorite === 1;

    const folderMenuItems: DropdownMenuItem[] = [
      {
        id: 'no-folder',
        label: t('sidebar.noFolder', 'No folder'),
        icon: <FolderX className="w-4 h-4" />,
        onClick: () => runOrganizationUpdate(item, { folder_id: null }),
      },
      ...sortedFolders.map((folder) => ({
        id: folder.id,
        label: folder.name,
        icon: <Folder className="w-4 h-4" />,
        onClick: () => runOrganizationUpdate(item, { folder_id: folder.id }),
      })),
    ];

    return {
      isFavorite,
      onToggleFavorite: () => runOrganizationUpdate(item, { favorite: isFavorite ? 0 : 1 }),
      folderMenuItems,
    };
  };

  const renderGroupItems = (groupItems: TItem[]) =>
    groupItems.map((item) => (
      <React.Fragment key={getItemMeta(item).id}>
        {renderItem(item, createItemActions(item))}
      </React.Fragment>
    ));

  const headerActions = (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setDialogState({ mode: 'create' })}
        className="no-drag h-6 w-6 p-0 text-shell-panel-muted hover:text-shell-panel-foreground"
        title={t('sidebar.newFolder', 'New folder')}
        aria-label={t('sidebar.newFolder', 'New folder')}
      >
        <FolderPlus className="w-3.5 h-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAddItem}
        className="no-drag h-6 w-6 p-0 text-shell-panel-muted hover:text-shell-panel-foreground"
        title={addTitle}
        aria-label={addTitle}
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  return (
    <>
      <SidebarSection
        title={title}
        emptyMessage={emptyMessage}
        isLoading={isBusy}
        headerActions={headerActions}
      >
        {!isBusy && !hasContent ? null : (
          <>
            {favorites.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-shell-panel-muted">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  {t('sidebar.favorites', 'Favorites')}
                </div>
                {renderGroupItems(favorites)}
              </div>
            )}

            {folderItems.map(({ folder, items: itemsInFolder }) => {
              const isCollapsed = collapsedFolderIds.has(folder.id);
              const folderMenuItems: DropdownMenuItem[] = [
                {
                  id: 'rename',
                  label: t('sidebar.renameFolder', 'Rename folder'),
                  icon: <Pencil className="w-4 h-4" />,
                  onClick: () => setDialogState({ mode: 'rename', folder }),
                },
                {
                  id: 'delete',
                  label: t('sidebar.deleteFolder', 'Delete folder'),
                  icon: <Trash2 className="w-4 h-4" />,
                  variant: 'danger',
                  onClick: () => void handleDeleteFolder(folder),
                },
              ];

              return (
                <div key={folder.id} className="space-y-1">
                  <div className="group flex items-center gap-1 rounded px-1 py-1 text-shell-panel-muted hover:bg-shell-panel-hover">
                    <button
                      type="button"
                      onClick={() => toggleFolder(folder.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      {isCollapsed ? (
                        <Folder className="h-3.5 w-3.5 flex-shrink-0" />
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      <span className="truncate text-xs font-medium text-shell-panel-foreground">
                        {folder.name}
                      </span>
                      <span className="text-[10px] text-shell-panel-muted">
                        {itemsInFolder.length}
                      </span>
                    </button>
                    <div className="opacity-0 transition-opacity group-hover:opacity-100">
                      <DropdownMenu
                        items={folderMenuItems}
                        align="right"
                        trigger={<MoreHorizontal className="h-3.5 w-3.5" />}
                        triggerClassName="no-drag flex h-6 w-6 items-center justify-center rounded text-shell-panel-muted hover:bg-shell-panel-hover hover:text-shell-panel-foreground"
                      />
                    </div>
                  </div>
                  {!isCollapsed && itemsInFolder.length > 0 && (
                    <div className="space-y-1">{renderGroupItems(itemsInFolder)}</div>
                  )}
                </div>
              );
            })}

            {ungroupedItems.length > 0 && (
              <div className={cn('space-y-1', favorites.length > 0 || folderItems.length > 0 ? 'pt-1' : '')}>
                {(favorites.length > 0 || folderItems.length > 0) && (
                  <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-shell-panel-muted">
                    {t('sidebar.noFolder', 'No folder')}
                  </div>
                )}
                {renderGroupItems(ungroupedItems)}
              </div>
            )}
          </>
        )}
      </SidebarSection>

      <ResourceFolderDialog
        isOpen={dialogState !== null}
        title={
          dialogState?.mode === 'rename'
            ? t('sidebar.renameFolder', 'Rename folder')
            : t('sidebar.newFolder', 'New folder')
        }
        initialName={dialogState?.mode === 'rename' ? dialogState.folder.name : ''}
        isSaving={createFolder.isPending || updateFolder.isPending}
        onClose={() => setDialogState(null)}
        onSubmit={handleFolderSubmit}
      />
    </>
  );
}
