import React from 'react';
import { Button } from '@ownshell/ui';
import { FileJson, Plus } from 'lucide-react';
import { MongoDBDocumentEditor } from '../MongoDBDocumentEditor';
import type { MongoDocumentSnapshot } from '../../../../electron/db-explorer/adapters/mongodb-adapter-types';

interface DocumentEditorPanelProps {
  connectionId: string;
  readOnly: boolean;
  selectedCollection: string | null;
  selectedDocument: MongoDocumentSnapshot | null;
  isCreatingDocument: boolean;
  onSaved: (document: MongoDocumentSnapshot) => void;
  onDeleted: () => void;
  onClose: () => void;
  onCreate: () => void;
}

export const DocumentEditorPanel: React.FC<DocumentEditorPanelProps> = ({
  connectionId,
  readOnly,
  selectedCollection,
  selectedDocument,
  isCreatingDocument,
  onSaved,
  onDeleted,
  onClose,
  onCreate,
}) => (
  <div className="flex-1 overflow-hidden">
    {selectedCollection && (selectedDocument || isCreatingDocument) ? (
      <MongoDBDocumentEditor
        connectionId={connectionId}
        readOnly={readOnly}
        collection={selectedCollection}
        document={isCreatingDocument ? null : selectedDocument}
        onSaved={onSaved}
        onDeleted={onDeleted}
        onClose={onClose}
      />
    ) : (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileJson className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">Select a document to view</p>
        {selectedCollection && !readOnly && (
          <Button variant="ghost" size="sm" className="mt-3" onClick={onCreate}>
            <Plus className="w-4 h-4 mr-1" />
            New Document
          </Button>
        )}
      </div>
    )}
  </div>
);
