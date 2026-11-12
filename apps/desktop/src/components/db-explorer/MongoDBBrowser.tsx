/**
 * MongoDB Browser Component
 *
 * Main interface for browsing MongoDB collections and documents.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CreateMongoCollectionDialog } from './CreateMongoCollectionDialog';
import { AggregationPanel } from './mongodb-browser/AggregationPanel';
import { CollectionsPanel } from './mongodb-browser/CollectionsPanel';
import { DocumentEditorPanel } from './mongodb-browser/DocumentEditorPanel';
import { DocumentsPanel } from './mongodb-browser/DocumentsPanel';
import type { CollectionInfo, MongoServerStats } from './mongodb-browser/types';
import type { MongoDocumentSnapshot } from '../../../electron/db-explorer/adapters/mongodb-adapter-types';

interface MongoDBBrowserProps {
  connectionId: string;
  readOnly: boolean;
  initialSelectedCollection?: string | null;
  initialSelectedDocumentId?: string | null;
  initialFilterJson?: string;
  initialSkip?: number;
  onViewStateChange?: (update: {
    selectedCollection: string | null;
    selectedDocumentId: string | null;
    filterJson: string;
    skip: number;
  }) => void;
}

const PAGE_SIZE = 50;

export const MongoDBBrowser: React.FC<MongoDBBrowserProps> = ({
  connectionId,
  readOnly,
  initialSelectedCollection = null,
  initialSelectedDocumentId = null,
  initialFilterJson = '{}',
  initialSkip = 0,
  onViewStateChange,
}) => {
  const { t } = useTranslation();
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    initialSelectedCollection
  );
  const [documents, setDocuments] = useState<MongoDocumentSnapshot[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<MongoDocumentSnapshot | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    initialSelectedDocumentId
  );
  const [documentCount, setDocumentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterJson, setFilterJson] = useState(initialFilterJson);
  const [skip, setSkip] = useState(initialSkip);
  const [showFilter, setShowFilter] = useState(false);
  const [serverStats, setServerStats] = useState<MongoServerStats | null>(null);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [showCreateCollectionDialog, setShowCreateCollectionDialog] = useState(false);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [showAggregation, setShowAggregation] = useState(false);
  const [pipelineText, setPipelineText] = useState('[\n  {"$match": {}}\n]');

  const loadCollections = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const statsResult = await window.electronAPI.mongodb.serverInfo(connectionId);
      if (statsResult.success && statsResult.dbStats) {
        setServerStats({
          collections: statsResult.dbStats.collections,
          documents: statsResult.dbStats.documents,
          dataSize: statsResult.dbStats.dataSize,
        });
      }

      const collectionResult = await window.electronAPI.mongodb.listCollections(connectionId);
      if (collectionResult.success && collectionResult.collections) {
        setCollections(collectionResult.collections);
      } else {
        setError(collectionResult.error || 'Failed to load collections');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  const documentsRequest = useRef(0);

  const loadDocuments = useCallback(async () => {
    if (!selectedCollection) return;
    const request = ++documentsRequest.current;

    setIsLoadingDocs(true);
    setError(null);

    try {
      let filter: Record<string, unknown> = {};
      try {
        filter = JSON.parse(filterJson);
      } catch {
        // Invalid JSON falls back to an empty filter, matching previous behavior.
      }

      const docsResult = await window.electronAPI.mongodb.findDocuments(
        connectionId,
        selectedCollection,
        {
          filter,
          skip,
          limit: PAGE_SIZE,
        }
      );
      if (request !== documentsRequest.current) return;

      if (docsResult.success && docsResult.documents) {
        setDocuments(docsResult.documents);
      } else {
        setError(docsResult.error || 'Failed to load documents');
      }

      const countResult = await window.electronAPI.mongodb.countDocuments(
        connectionId,
        selectedCollection,
        filter
      );
      if (request !== documentsRequest.current) return;
      if (countResult.success) {
        setDocumentCount(countResult.count || 0);
      }
    } catch (err) {
      if (request === documentsRequest.current) {
        setError(err instanceof Error ? err.message : 'Failed to load documents');
      }
    } finally {
      if (request === documentsRequest.current) setIsLoadingDocs(false);
    }
  }, [connectionId, selectedCollection, filterJson, skip]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    if (selectedCollection) {
      loadDocuments();
    }
    return () => { documentsRequest.current++; };
  }, [selectedCollection, loadDocuments]);

  useEffect(() => {
    onViewStateChange?.({
      selectedCollection,
      selectedDocumentId,
      filterJson,
      skip,
    });
  }, [filterJson, onViewStateChange, selectedCollection, selectedDocumentId, skip]);

  useEffect(() => {
    if (!selectedCollection || !selectedDocumentId || isCreatingDocument) return;
    if (selectedDocument?._id === selectedDocumentId) return;

    const matchingDocument = documents.find((document) => document._id === selectedDocumentId);
    if (matchingDocument) {
      setSelectedDocument(matchingDocument);
      return;
    }

    let cancelled = false;

    void window.electronAPI.mongodb
      .findDocumentById(connectionId, selectedCollection, selectedDocumentId)
      .then((result) => {
        if (cancelled || !result.success || !result.document) return;
        setSelectedDocument(result.document);
      })
      .catch((err) => {
        console.error('Failed to restore MongoDB document selection:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [
    connectionId,
    documents,
    isCreatingDocument,
    selectedCollection,
    selectedDocument?._id,
    selectedDocumentId,
  ]);

  const handleSelectCollection = (name: string) => {
    documentsRequest.current++;
    setSelectedCollection(name);
    setSkip(0);
    setDocuments([]);
    setSelectedDocument(null);
    setSelectedDocumentId(null);
    setIsCreatingDocument(false);
  };

  const handleDeleteDocument = async (id: string) => {
    if (!selectedCollection || readOnly) return;

    const confirmed = window.confirm('Delete this document? This cannot be undone.');
    if (!confirmed) return;

    try {
      const result = await window.electronAPI.mongodb.deleteDocument(
        connectionId,
        selectedCollection,
        id
      );
      if (result.success) {
        setDocuments((prev) => prev.filter((document) => document._id !== id));
        if (selectedDocument?._id === id) {
          setSelectedDocument(null);
          setSelectedDocumentId(null);
        }
        setDocumentCount((prev) => prev - 1);
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const handleDropCollection = async (name: string) => {
    if (readOnly) return;

    const confirmed = window.confirm(
      `Drop collection "${name}"? This will delete ALL documents and cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const result = await window.electronAPI.mongodb.dropCollection(connectionId, name);
      if (result.success) {
        setCollections((prev) => prev.filter((collection) => collection.name !== name));
        if (selectedCollection === name) {
          setSelectedCollection(null);
          setDocuments([]);
          setSelectedDocument(null);
          setSelectedDocumentId(null);
        }
        loadCollections();
      }
    } catch (err) {
      console.error('Failed to drop collection:', err);
    }
  };

  const handleCreateCollection = async (
    name: string,
    options?: { capped?: boolean; size?: number }
  ) => {
    if (readOnly) return;

    setIsCreatingCollection(true);

    try {
      const result = await window.electronAPI.mongodb.createCollection(
        connectionId,
        name,
        options
      );

      if (!result.success) {
        throw new Error(result.error || t('db.createCollectionFailed', 'Failed to create collection'));
      }

      setShowCreateCollectionDialog(false);
      setSelectedCollection(name);
      setSkip(0);
      setDocuments([]);
      setSelectedDocument(null);
      setSelectedDocumentId(null);
      setIsCreatingDocument(false);
      await loadCollections();
      toast.success(t('db.collectionCreated', 'Collection created'));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('db.createCollectionFailed', 'Failed to create collection')
      );
    } finally {
      setIsCreatingCollection(false);
    }
  };

  const handleDocumentSaved = (document: MongoDocumentSnapshot) => {
    if (isCreatingDocument) {
      setDocuments((prev) => [document, ...prev]);
      setDocumentCount((prev) => prev + 1);
      setIsCreatingDocument(false);
    } else {
      setDocuments((prev) => prev.map((item) => (item._id === document._id ? document : item)));
    }
    setSelectedDocument(document);
    setSelectedDocumentId(document._id);
  };

  return (
    <div className="flex h-full">
      <CollectionsPanel
        collections={collections}
        selectedCollection={selectedCollection}
        serverStats={serverStats}
        isLoading={isLoading}
        error={error}
        readOnly={readOnly}
        onRefresh={loadCollections}
        onCreateCollection={() => setShowCreateCollectionDialog(true)}
        onSelectCollection={handleSelectCollection}
        onDropCollection={handleDropCollection}
      />

      {showAggregation && selectedCollection ? (
        <AggregationPanel
          key={selectedCollection}
          connectionId={connectionId}
          collection={selectedCollection}
          readOnly={readOnly}
          pipelineText={pipelineText}
          onPipelineTextChange={setPipelineText}
          onClose={() => setShowAggregation(false)}
        />
      ) : (
        <>
          <DocumentsPanel
            selectedCollection={selectedCollection}
            documents={documents}
            selectedDocument={selectedDocument}
            documentCount={documentCount}
            filterJson={filterJson}
            showFilter={showFilter}
            isLoadingDocs={isLoadingDocs}
            skip={skip}
            limit={PAGE_SIZE}
            onToggleFilter={() => setShowFilter((current) => !current)}
            onOpenAggregation={() => setShowAggregation(true)}
            onFilterChange={(value) => {
              documentsRequest.current++;
              setFilterJson(value);
            }}
            onLoadDocuments={loadDocuments}
            onNewDocument={() => {
              if (readOnly) return;
              setSelectedDocument(null);
              setSelectedDocumentId(null);
              setIsCreatingDocument(true);
            }}
            onSelectDocument={(document) => {
              setIsCreatingDocument(false);
              setSelectedDocument(document);
              setSelectedDocumentId(document._id);
            }}
            onPreviousPage={() => {
              documentsRequest.current++;
              setSkip(Math.max(0, skip - PAGE_SIZE));
            }}
            onNextPage={() => {
              documentsRequest.current++;
              setSkip(skip + PAGE_SIZE);
            }}
          />

          <DocumentEditorPanel
            connectionId={connectionId}
            readOnly={readOnly}
            selectedCollection={selectedCollection}
            selectedDocument={selectedDocument}
            isCreatingDocument={isCreatingDocument}
            onSaved={handleDocumentSaved}
            onDeleted={() => {
              if (selectedDocument) {
                handleDeleteDocument(selectedDocument._id);
              }
            }}
            onClose={() => {
              setSelectedDocument(null);
              setSelectedDocumentId(null);
              setIsCreatingDocument(false);
            }}
            onCreate={() => {
              if (!readOnly) setIsCreatingDocument(true);
            }}
          />
        </>
      )}

      <CreateMongoCollectionDialog
        isOpen={showCreateCollectionDialog}
        onClose={() => setShowCreateCollectionDialog(false)}
        onConfirm={handleCreateCollection}
        isLoading={isCreatingCollection}
      />
    </div>
  );
};

export default MongoDBBrowser;
