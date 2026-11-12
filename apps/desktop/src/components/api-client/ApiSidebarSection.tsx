/**
 * API Sidebar Section (v1.18.0)
 *
 * Recursive tree component for API collections and requests.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { ApiCollectionsTable, ApiRequestsTable } from '@ownshell/core';
import { Button, cn } from '@ownshell/ui';
import { Braces, History, Plus, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  useApiClientData,
  useGlobalApiVariables,
  useInvalidateApiTree,
  useReorderApiItems,
} from '../../hooks/api/useApiQueries';
import { buildCollectionTree, getRootRequests, useApiStore } from '../../stores/useApiStore';
import { CollectionItem } from './sidebar/CollectionItem';
import { HistoryPanel } from './sidebar/HistoryPanel';
import { ImportResultDialog, type ImportSuccess } from './sidebar/ImportResultDialog';
import { VariablesDialog } from './sidebar/VariablesDialog';
import { ImportCurlDialog } from './sidebar/ImportCurlDialog';
import { NewItemMenu } from './sidebar/NewItemMenu';
import { RequestItem } from './sidebar/RequestItem';
import { filterTree, moveSibling, sortSiblingsByName } from './sidebar/tree-utils';

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
  const [showImportCurl, setShowImportCurl] = useState(false);
  const [query, setQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showGlobals, setShowGlobals] = useState(false);
  const [importResult, setImportResult] = useState<ImportSuccess | null>(null);
  const reorder = useReorderApiItems();
  const { data: globalVariables } = useGlobalApiVariables();
  const invalidateTree = useInvalidateApiTree();

  const handleImport = useCallback(
    async (kind: 'postman' | 'ownshell') => {
      setShowNewMenu(false);
      try {
        const transfer = window.electronAPI.apiClient.transfer;
        const result = await (kind === 'postman' ? transfer.importPostman() : transfer.importOwnShell());
        if (!result) return;
        if ('errorCode' in result) {
          toast.error(t(`api.transfer.errors.${result.errorCode}`));
          return;
        }
        if (result.kind === 'collection') {
          await invalidateTree();
          setShowHistory(false);
        }
        setImportResult(result);
      } catch (error) {
        toast.error(t('api.transfer.importFailed', { error: error instanceof Error ? error.message : String(error) }));
      }
    },
    [invalidateTree, t]
  );

  const fullTree = useMemo(() => buildCollectionTree(collections, requests), [collections, requests]);
  const filtered = useMemo(
    () => (query.trim() ? filterTree(fullTree, getRootRequests(requests), query) : null),
    [fullTree, requests, query]
  );
  const collectionTree = filtered?.tree ?? fullTree;
  const rootRequests = filtered?.rootRequests ?? getRootRequests(requests);
  // While searching, folders on the path to a match are open without touching the saved state.
  const visibleExpandedIds = filtered?.expandedIds ?? expandedCollectionIds;

  // Siblings in displayed order (the queries sort by sort_order, then created_at).
  const handleMove = useCallback(
    (kind: 'collection' | 'request', id: string, delta: -1 | 1) => {
      // One reorder at a time: a second one would start from the not-yet-saved order.
      if (reorder.isPending) return;
      if (kind === 'collection') {
        const parentId = collections.find((c) => c.id === id)?.parent_id ?? null;
        const changes = moveSibling(collections.filter((c) => c.parent_id === parentId), id, delta);
        if (changes.length) reorder.mutate({ collections: changes, requests: [] });
      } else {
        const collectionId = requests.find((r) => r.id === id)?.collection_id ?? null;
        const changes = moveSibling(requests.filter((r) => r.collection_id === collectionId), id, delta);
        if (changes.length) reorder.mutate({ collections: [], requests: changes });
      }
    },
    [collections, requests, reorder]
  );

  const handleSortFolder = useCallback(
    (id: string) => {
      if (reorder.isPending) return;
      const changes = {
        collections: sortSiblingsByName(collections.filter((c) => c.parent_id === id)),
        requests: sortSiblingsByName(requests.filter((r) => r.collection_id === id)),
      };
      if (changes.collections.length || changes.requests.length) reorder.mutate(changes);
    },
    [collections, requests, reorder]
  );

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
          {showHistory ? t('api.history.title') : t('api.collections', 'Collections')}
        </span>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGlobals(true)}
            disabled={!globalVariables}
            className="no-drag h-6 w-6 p-0"
            title={t('api.variables.globalTitle')}
            aria-label={t('api.variables.globalTitle')}
          >
            <Braces className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory((current) => !current)}
            aria-pressed={showHistory}
            className={cn('no-drag h-6 w-6 p-0', showHistory && 'text-primary')}
            title={t('api.history.title')}
            aria-label={t('api.history.title')}
          >
            <History className="w-3.5 h-3.5" />
          </Button>
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
            onImportCurl={() => {
              setShowImportCurl(true);
              setShowNewMenu(false);
            }}
            onImportPostman={() => void handleImport('postman')}
            onImportOwnShell={() => void handleImport('ownshell')}
          />
        </div>
      </div>

      {showGlobals && globalVariables && (
        <VariablesDialog
          title={t('api.variables.globalTitle')}
          collectionId={null}
          variables={globalVariables}
          onClose={() => setShowGlobals(false)}
        />
      )}
      {importResult && <ImportResultDialog result={importResult} onClose={() => setImportResult(null)} />}

      {showHistory ? (
        <HistoryPanel
          onOpened={(id) => {
            setShowHistory(false);
            onSelectRequest(id);
          }}
        />
      ) : (
      <>

        {(collections.length > 0 || requests.length > 0) && (
          <div className="flex-shrink-0 px-2 pt-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
                placeholder={t('api.sidebar.searchPlaceholder')}
                aria-label={t('api.sidebar.searchPlaceholder')}
                className="w-full pl-7 pr-7 py-1 bg-secondary border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('api.sidebar.clearSearch')}
                  title={t('api.sidebar.clearSearch')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {showImportCurl && (
          <ImportCurlDialog onClose={() => setShowImportCurl(false)} onImported={onSelectRequest} />
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered && collectionTree.length === 0 && rootRequests.length === 0 ? (
            <p className="text-center py-8 px-4 text-xs text-muted-foreground">
              {t('api.sidebar.noMatches')}
            </p>
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
                  expandedIds={visibleExpandedIds}
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
                  onMove={handleMove}
                  onSortFolder={handleSortFolder}
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
                  onMove={(delta) => handleMove('request', request.id, delta)}
                />
              ))}
            </div>
          )}
        </div>
      </>
      )}
    </div>
  );
};
