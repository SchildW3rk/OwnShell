import React from 'react';
import { Button, Input, cn } from '@ownshell/ui';
import { ChevronRight, FileJson, Filter, FolderOpen, Loader2, Play, Plus, RefreshCw } from 'lucide-react';
import type { MongoDocumentSnapshot } from '../../../../electron/db-explorer/adapters/mongodb-adapter-types';

interface DocumentsPanelProps {
  selectedCollection: string | null;
  documents: MongoDocumentSnapshot[];
  selectedDocument: MongoDocumentSnapshot | null;
  documentCount: number;
  filterJson: string;
  showFilter: boolean;
  isLoadingDocs: boolean;
  skip: number;
  limit: number;
  onToggleFilter: () => void;
  onFilterChange: (value: string) => void;
  onLoadDocuments: () => void;
  onNewDocument: () => void;
  onSelectDocument: (document: MongoDocumentSnapshot) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export const DocumentsPanel: React.FC<DocumentsPanelProps> = ({
  selectedCollection,
  documents,
  selectedDocument,
  documentCount,
  filterJson,
  showFilter,
  isLoadingDocs,
  skip,
  limit,
  onToggleFilter,
  onFilterChange,
  onLoadDocuments,
  onNewDocument,
  onSelectDocument,
  onPreviousPage,
  onNextPage,
}) => (
  <div className="w-80 flex-shrink-0 border-r border-border flex flex-col">
    {selectedCollection ? (
      <>
        <div className="px-3 py-2 border-b border-border bg-surface/50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground truncate">{selectedCollection}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onToggleFilter} title="Filter">
                <Filter className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onNewDocument} title="New document">
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoadDocuments}
                disabled={isLoadingDocs}
                title="Refresh"
              >
                <RefreshCw className={cn('w-4 h-4', isLoadingDocs && 'animate-spin')} />
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {documentCount.toLocaleString()} documents
            {skip > 0 && ` (showing ${skip + 1}-${Math.min(skip + limit, documentCount)})`}
          </div>
        </div>

        {showFilter && (
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex gap-2">
              <Input
                value={filterJson}
                onChange={(event) => onFilterChange(event.target.value)}
                placeholder='{"field": "value"}'
                className="flex-1 font-mono text-xs"
              />
              <Button variant="primary" size="sm" onClick={onLoadDocuments}>
                <Play className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoadingDocs ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <FileJson className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No documents</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {documents.map((document) => (
                <button
                  key={document._id}
                  type="button"
                  onClick={() => onSelectDocument(document)}
                  className={cn(
                    'w-full px-3 py-2 text-left hover:bg-secondary/50 transition-colors group',
                    selectedDocument?._id === document._id && 'bg-secondary/70'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FileJson className="w-4 h-4 text-success flex-shrink-0" />
                    <span className="font-mono text-xs text-primary truncate">{document._id}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto flex-shrink-0" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {document.fieldNames
                      .filter((key) => key !== '_id')
                      .slice(0, 3)
                      .join(', ')}
                    {document.fieldNames.length > 4 && '...'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {documentCount > limit && (
          <div className="p-2 border-t border-border flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onPreviousPage} disabled={skip === 0}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {Math.floor(skip / limit) + 1} / {Math.ceil(documentCount / limit)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onNextPage}
              disabled={skip + limit >= documentCount}
            >
              Next
            </Button>
          </div>
        )}
      </>
    ) : (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FolderOpen className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">Select a collection</p>
      </div>
    )}
  </div>
);
