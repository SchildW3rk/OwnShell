/**
 * API Sidebar Section (v1.18.0)
 *
 * Recursive tree component for API collections and requests.
 */

import React, { useCallback, useState } from 'react';
import type { ApiCollectionsTable, ApiRequestsTable } from '@ownshell/core';
import { Button } from '@ownshell/ui';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApiClientData } from '../../hooks/api/useApiQueries';
import { buildCollectionTree, getRootRequests, useApiStore } from '../../stores/useApiStore';
import { CollectionItem } from './sidebar/CollectionItem';
import { NewItemMenu } from './sidebar/NewItemMenu';
import { RequestItem } from './sidebar/RequestItem';

interface ApiSidebarSectionProps {
  onCreateCollection: (parentId?: string | null) => void;
  onSelectRequest: (id: string) => void;
  onCreateRequest: (collectionId?: string | null) => void;
  onEditCollection: (collection: ApiCollectionsTable) => void;
  onDeleteCollection: (id: string) => void;
  onEditRequest: (request: ApiRequestsTable) => void;
  onDeleteRequest: (id: string) => void;
  onDuplicateRequest: (id: string) => void;
}

export const ApiSidebarSection: React.FC<ApiSidebarSectionProps> = ({
  onCreateCollection,
  onSelectRequest,
  onCreateRequest,
  onEditCollection,
  onDeleteCollection,
  onEditRequest,
  onDeleteRequest,
  onDuplicateRequest,
}) => {
  const { t } = useTranslation();
  const { collections, requests, isLoading } = useApiClientData();
  const { selectedRequestId, expandedCollectionIds, toggleCollectionExpanded } = useApiStore();
  const [showNewMenu, setShowNewMenu] = useState(false);

  const collectionTree = buildCollectionTree(collections, requests);
  const rootRequests = getRootRequests(requests);

  const handleToggleExpand = useCallback(
    (id: string) => {
      toggleCollectionExpanded(id);
    },
    [toggleCollectionExpanded]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 h-10 flex items-center justify-between px-3 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('api.collections', 'Collections')}
        </span>

        <NewItemMenu
          isOpen={showNewMenu}
          onToggle={() => setShowNewMenu((current) => !current)}
          onCreateRequest={() => {
            onCreateRequest(null);
            setShowNewMenu(false);
          }}
          onCreateCollection={() => {
            onCreateCollection(null);
            setShowNewMenu(false);
          }}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : collectionTree.length === 0 && rootRequests.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-xs text-muted-foreground mb-3">
              {t('api.emptyState', 'No requests yet')}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onCreateRequest(null)}
              className="text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t('api.createFirst', 'Create Request')}
            </Button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {collectionTree.map((collection) => (
              <CollectionItem
                key={collection.id}
                collection={collection}
                expandedIds={expandedCollectionIds}
                onToggleExpand={handleToggleExpand}
                selectedRequestId={selectedRequestId}
                onSelectRequest={onSelectRequest}
                onCreateRequest={onCreateRequest}
                onCreateCollection={onCreateCollection}
                onEditCollection={onEditCollection}
                onDeleteCollection={onDeleteCollection}
                onEditRequest={onEditRequest}
                onDeleteRequest={onDeleteRequest}
                onDuplicateRequest={onDuplicateRequest}
              />
            ))}

            {rootRequests.map((request) => (
              <RequestItem
                key={request.id}
                request={request}
                isActive={selectedRequestId === request.id}
                onClick={() => onSelectRequest(request.id)}
                onEdit={() => onEditRequest(request)}
                onDelete={() => onDeleteRequest(request.id)}
                onDuplicate={() => onDuplicateRequest(request.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
