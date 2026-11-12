import React from 'react';
import { Button, cn, formatBytes } from '@ownshell/ui';
import { AlertCircle, FileJson, FolderOpen, Plus, RefreshCw, Server, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CollectionInfo, MongoServerStats } from './types';

interface CollectionsPanelProps {
  collections: CollectionInfo[];
  selectedCollection: string | null;
  serverStats: MongoServerStats | null;
  isLoading: boolean;
  error: string | null;
  readOnly: boolean;
  onRefresh: () => void;
  onCreateCollection: () => void;
  onSelectCollection: (name: string) => void;
  onDropCollection: (name: string) => void;
}

export const CollectionsPanel: React.FC<CollectionsPanelProps> = ({
  collections,
  selectedCollection,
  serverStats,
  isLoading,
  error,
  readOnly,
  onRefresh,
  onCreateCollection,
  onSelectCollection,
  onDropCollection,
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-64 flex-shrink-0 border-r border-border flex flex-col">
      {serverStats && (
        <div className="px-3 py-2 bg-surface/50 border-b border-border flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{serverStats.collections}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <FileJson className="w-3.5 h-3.5" />
            <span>{serverStats.documents.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Server className="w-3.5 h-3.5" />
            <span>{formatBytes(serverStats.dataSize)}</span>
          </div>
        </div>
      )}

      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {t('db.collections', 'Collections')}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCreateCollection}
            disabled={isLoading || readOnly}
            title={
              readOnly
                ? t('db.readOnlyBlocked', 'Read-only connection blocks write actions')
                : t('db.createCollection', 'Create Collection')
            }
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            title={t('common.refresh', 'Refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && !isLoading ? (
          <div className="flex items-center justify-center p-4 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 mr-2" />
            {error}
          </div>
        ) : collections.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
            <FolderOpen className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">{t('db.noCollections', 'No collections')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {collections.map((collection) => (
              <button
                key={collection.name}
                type="button"
                onClick={() => onSelectCollection(collection.name)}
                className={cn(
                  'w-full px-3 py-2 text-left hover:bg-secondary/50 transition-colors group',
                  selectedCollection === collection.name && 'bg-secondary/70'
                )}
              >
                <div className="flex items-center gap-2">
                  <FolderOpen
                    className={cn(
                      'w-4 h-4',
                      collection.type === 'view' ? 'text-purple-400' : 'text-accent'
                    )}
                  />
                  <span className="flex-1 font-mono text-sm truncate text-foreground">
                    {collection.name}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDropCollection(collection.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      title={t('db.dropCollection', 'Drop collection')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>
                    {collection.documentCount.toLocaleString()} {t('db.docs', 'docs')}
                  </span>
                  <span>{formatBytes(collection.totalSize)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
