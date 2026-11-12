import React, { useState } from 'react';
import type { ApiCollectionsTable, ApiRequestsTable } from '@ownshell/core';
import { Button } from '@ownshell/ui';
import {
  ArrowDown,
  ArrowDownAZ,
  ArrowUp,
  Braces,
  Download,
  ChevronDown,
  ChevronRight,
  FileJson,
  Folder,
  FolderOpen,
  FolderPlus,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CollectionAuthDialog } from './CollectionAuthDialog';
import { VariablesDialog } from './VariablesDialog';
import { ContextMenu } from './ContextMenu';
import { RequestItem } from './RequestItem';
import type { ApiCollectionTreeItem, ContextMenuItem } from './types';

interface CollectionItemProps {
  collection: ApiCollectionTreeItem;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  selectedRequestId: string | null;
  onSelectRequest: (id: string) => void;
  onCreateRequest: (collectionId: string) => void;
  onCreateCollection: (parentId: string) => void;
  onEditCollection: (collection: ApiCollectionsTable) => void;
  onDeleteCollection: (id: string) => void;
  onEditRequest: (request: ApiRequestsTable) => void;
  onDeleteRequest: (id: string) => void;
  onDuplicateRequest: (id: string) => void;
  onMove: (kind: 'collection' | 'request', id: string, delta: -1 | 1) => void;
  onSortFolder: (id: string) => void;
  depth?: number;
}

export const CollectionItem: React.FC<CollectionItemProps> = ({
  collection,
  expandedIds,
  onToggleExpand,
  selectedRequestId,
  onSelectRequest,
  onCreateRequest,
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
  onEditRequest,
  onDeleteRequest,
  onDuplicateRequest,
  onMove,
  onSortFolder,
  depth = 0,
}) => {
  const isExpanded = expandedIds.has(collection.id);
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showVariablesDialog, setShowVariablesDialog] = useState(false);

  const handleExport = async () => {
    try {
      const result = await window.electronAPI.apiClient.transfer.exportOwnShell(collection.id);
      if (result) toast.success(t('api.transfer.exportedRedacted', { path: result.filePath }));
    } catch (error) {
      toast.error(t('api.transfer.exportFailed', { error: error instanceof Error ? error.message : String(error) }));
    }
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: t('api.newRequest'),
      icon: <FileJson className="w-4 h-4" />,
      onClick: () => onCreateRequest(collection.id),
    },
    {
      label: t('api.newFolder'),
      icon: <FolderPlus className="w-4 h-4" />,
      onClick: () => onCreateCollection(collection.id),
    },
    {
      label: t('api.collectionAuth.menu'),
      icon: <KeyRound className="w-4 h-4" />,
      onClick: () => setShowAuthDialog(true),
    },
    {
      label: t('api.variables.menu'),
      icon: <Braces className="w-4 h-4" />,
      onClick: () => setShowVariablesDialog(true),
    },
    {
      label: t('api.transfer.exportMenu'),
      icon: <Download className="w-4 h-4" />,
      onClick: () => void handleExport(),
    },
    {
      label: t('common.rename'),
      icon: <Pencil className="w-4 h-4" />,
      onClick: () => onEditCollection(collection),
    },
    {
      label: t('api.sidebar.moveUp'),
      icon: <ArrowUp className="w-4 h-4" />,
      onClick: () => onMove('collection', collection.id, -1),
    },
    {
      label: t('api.sidebar.moveDown'),
      icon: <ArrowDown className="w-4 h-4" />,
      onClick: () => onMove('collection', collection.id, 1),
    },
    {
      label: t('api.sidebar.sortByName'),
      icon: <ArrowDownAZ className="w-4 h-4" />,
      onClick: () => onSortFolder(collection.id),
    },
    {
      label: t('common.delete'),
      icon: <Trash2 className="w-4 h-4" />,
      onClick: () => onDeleteCollection(collection.id),
      variant: 'danger',
    },
  ];

  const hasChildren =
    (collection.children?.length ?? 0) > 0 || (collection.requests?.length ?? 0) > 0;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggleExpand(collection.id)}
        onKeyDown={(event) => event.key === 'Enter' && onToggleExpand(collection.id)}
        onContextMenu={handleContextMenu}
        className="group flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-sidebar-accent/10 transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="w-4 h-4 flex-shrink-0 text-muted-foreground">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )
          ) : (
            <span className="w-4" />
          )}
        </span>

        <span className="w-4 h-4 flex-shrink-0 text-amber-500">
          {isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
        </span>

        <span className="flex-1 text-sm text-foreground truncate">{collection.name}</span>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onCreateRequest(collection.id);
            }}
            className="no-drag h-5 w-5 p-0"
            title={t('api.newRequest')}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
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

      {isExpanded && (
        <div>
          {collection.children?.map((child) => (
            <CollectionItem
              key={child.id}
              collection={child}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              selectedRequestId={selectedRequestId}
              onSelectRequest={onSelectRequest}
              onCreateRequest={onCreateRequest}
              onCreateCollection={onCreateCollection}
              onEditCollection={onEditCollection}
              onDeleteCollection={onDeleteCollection}
              onEditRequest={onEditRequest}
              onDeleteRequest={onDeleteRequest}
              onDuplicateRequest={onDuplicateRequest}
              onMove={onMove}
              onSortFolder={onSortFolder}
              depth={depth + 1}
            />
          ))}

          {collection.requests?.map((request) => (
            <RequestItem
              key={request.id}
              request={request}
              isActive={selectedRequestId === request.id}
              onClick={() => onSelectRequest(request.id)}
              onEdit={() => onEditRequest(request)}
              onDelete={() => onDeleteRequest(request.id)}
              onDuplicate={() => onDuplicateRequest(request.id)}
              onMove={(delta) => onMove('request', request.id, delta)}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {showVariablesDialog && (
        <VariablesDialog
          title={t('api.variables.folderTitle', { name: collection.name })}
          collectionId={collection.id}
          variables={parsePublicVariables(collection.variables)}
          onClose={() => setShowVariablesDialog(false)}
        />
      )}

      {showAuthDialog && (
        <CollectionAuthDialog collection={collection} onClose={() => setShowAuthDialog(false)} />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

/** api_collections.variables as sent to the renderer (secret values already removed). */
function parsePublicVariables(json: string | undefined) {
  try {
    const parsed = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
