/**
 * MongoDB Document Editor Component
 *
 * Provides JSON editing for MongoDB documents with syntax highlighting.
 * Supports create, update, and delete operations.
 */

import React, { useState, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, TooltipButton } from '@ownshell/ui';
import {
  Save,
  Trash2,
  X,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Loader2,
  FileJson,
  Lock,
  Plus,
} from 'lucide-react';
import { MongoDBJsonEditor, type MongoDBJsonEditorHandle } from './MongoDBJsonEditor';
import type { MongoDocumentSnapshot } from '../../../electron/db-explorer/adapters/mongodb-adapter-types';

interface MongoDBDocumentEditorProps {
  connectionId: string;
  readOnly: boolean;
  collection: string;
  document: MongoDocumentSnapshot | null; // null = new document
  onSaved: (doc: MongoDocumentSnapshot) => void;
  onDeleted: () => void;
  onClose: () => void;
}

export const MongoDBDocumentEditor: React.FC<MongoDBDocumentEditorProps> = ({
  connectionId,
  readOnly,
  collection,
  document,
  onSaved,
  onDeleted,
  onClose,
}) => {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const isNewDocument = document === null;
  const iconButtonClassName =
    'h-8 w-8 border-0 bg-transparent p-0 text-muted-foreground hover:bg-secondary hover:text-foreground';

  // State
  const editorRef = useRef<MongoDBJsonEditorHandle>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoadingDocument, setIsLoadingDocument] = useState(document !== null);
  const [documentLoadFailed, setDocumentLoadFailed] = useState(false);
  const documentUnavailable = isLoadingDocument || documentLoadFailed;
  const requestVersion = useRef(0);

  /**
   * Retire old UI requests and format the complete snapshot off the renderer before showing it.
   */
  useLayoutEffect(() => {
    const request = ++requestVersion.current;
    setIsSaving(false);
    setHasChanges(false);
    setError(null);
    setParseError(null);
    setDocumentLoadFailed(false);
    const editor = editorRef.current;
    if (!editor) {
      setError(tRef.current('database.documentEditorUnavailable'));
      setDocumentLoadFailed(true);
      setIsLoadingDocument(false);
    } else if (document) {
      setIsLoadingDocument(true);
      void editor.loadValue(document.json).then(() => {
        if (request === requestVersion.current) setIsLoadingDocument(false);
      }).catch((cause) => {
        if (request !== requestVersion.current) return;
        setError(cause instanceof Error ? cause.message : tRef.current('database.documentLoadFailed'));
        setDocumentLoadFailed(true);
        setIsLoadingDocument(false);
      });
    } else {
      editor.setValue('{\n  \n}', true);
      setIsLoadingDocument(false);
    }
    return () => { requestVersion.current++; };
  }, [connectionId, collection, document]);

  /**
   * Save document
   */
  const handleSave = async () => {
    const editor = editorRef.current;
    if (readOnly || !editor || documentUnavailable) return;

    if (parseError) {
      setError('Cannot save: Invalid JSON');
      return;
    }

    const request = ++requestVersion.current;
    setIsSaving(true);
    setError(null);

    try {
      const docData = JSON.parse(editor.getValue());

      if (isNewDocument) {
        // Insert new document
        const result = await window.electronAPI.mongodb.insertDocument(
          connectionId,
          collection,
          docData
        );
        if (request !== requestVersion.current) return;

        if (result.success && result.insertedId) {
          // Fetch the created document
          const fetchResult = await window.electronAPI.mongodb.findDocumentById(
            connectionId,
            collection,
            result.insertedId
          );
          if (request !== requestVersion.current) return;

          if (fetchResult.success && fetchResult.document) {
            onSaved(fetchResult.document);
          }
        } else {
          setError(result.error || 'Failed to create document');
        }
      } else {
        // Update existing document (replace entire document)
        const result = await window.electronAPI.mongodb.updateDocument(
          connectionId,
          collection,
          document._id,
          docData,
          { replace: true }
        );
        if (request !== requestVersion.current) return;

        if (result.success) {
          // Fetch updated document
          const fetchResult = await window.electronAPI.mongodb.findDocumentById(
            connectionId,
            collection,
            document._id
          );
          if (request !== requestVersion.current) return;

          if (fetchResult.success && fetchResult.document) {
            onSaved(fetchResult.document);
          }
        } else {
          setError(result.error || 'Failed to update document');
        }
      }
    } catch (err) {
      if (request === requestVersion.current) {
        setError(err instanceof Error ? err.message : 'Failed to save document');
      }
    } finally {
      if (request === requestVersion.current) setIsSaving(false);
    }
  };

  /**
   * Delete document
   */
  const handleDelete = async () => {
    if (isNewDocument || readOnly) return;

    const confirmed = window.confirm('Delete this document? This cannot be undone.');
    if (!confirmed) return;

    const request = ++requestVersion.current;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.mongodb.deleteDocument(
        connectionId,
        collection,
        document._id
      );
      if (request !== requestVersion.current) return;

      if (result.success) {
        onDeleted();
      } else {
        setError(result.error || 'Failed to delete document');
      }
    } catch (err) {
      if (request === requestVersion.current) {
        setError(err instanceof Error ? err.message : 'Failed to delete document');
      }
    } finally {
      if (request === requestVersion.current) setIsSaving(false);
    }
  };

  /**
   * Refresh document from database
   */
  const handleRefresh = async () => {
    if (isNewDocument || !document) return;

    const request = ++requestVersion.current;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.mongodb.findDocumentById(
        connectionId,
        collection,
        document._id
      );
      if (request !== requestVersion.current) return;

      if (result.success && result.document) {
        const editor = editorRef.current;
        if (!editor) throw new Error(tRef.current('database.documentEditorUnavailable'));
        setIsLoadingDocument(true);
        setDocumentLoadFailed(false);
        try {
          await editor.loadValue(result.document.json);
        } catch (cause) {
          if (request === requestVersion.current) setDocumentLoadFailed(true);
          throw cause;
        }
        if (request !== requestVersion.current) return;
        setHasChanges(false);
        setError(null);
      } else {
        setError(result.error || 'Failed to refresh document');
      }
    } catch (err) {
      if (request === requestVersion.current) {
        setError(err instanceof Error ? err.message : 'Failed to refresh document');
      }
    } finally {
      if (request === requestVersion.current) {
        setIsSaving(false);
        setIsLoadingDocument(false);
      }
    }
  };

  /**
   * Copy to clipboard
   */
  const handleCopy = () => {
    const editor = editorRef.current;
    if (!editor || documentUnavailable) return;
    navigator.clipboard.writeText(editor.getValue());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Format JSON in editor
   */
  const handleFormat = () => {
    const editor = editorRef.current;
    if (!editor || documentUnavailable) return;
    try {
      const parsed = JSON.parse(editor.getValue());
      const formatted = JSON.stringify(parsed, null, 2);
      editor.setValue(formatted, false);
      setParseError(null);
    } catch {
      // Keep current value if invalid
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-surface/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isNewDocument ? (
              <>
                <Plus className="w-4 h-4 text-success" />
                <span className="text-sm font-medium text-foreground">New Document</span>
              </>
            ) : (
              <>
                <FileJson className="w-4 h-4 text-success" />
                <span className="font-mono text-xs text-primary truncate max-w-xs">
                  {document._id}
                </span>
              </>
            )}
            {hasChanges && (
              <span className="px-1.5 py-0.5 bg-yellow-600/30 text-accent text-xs rounded">
                Modified
              </span>
            )}
            {readOnly && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-500">
                <Lock className="h-3 w-3" />
                {t('db.readOnlyBadge', 'Read-only')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <TooltipButton
              icon={<FileJson className="w-4 h-4" />}
              tooltip={t('db.formatJson', 'Format JSON')}
              aria-label={t('db.formatJson', 'Format JSON')}
              onClick={handleFormat}
              disabled={documentUnavailable}
              className={iconButtonClassName}
            />
            <TooltipButton
              icon={
                copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />
              }
              tooltip={
                copied ? t('db.copiedJson', 'Copied JSON') : t('db.copyJson', 'Copy JSON')
              }
              aria-label={
                copied ? t('db.copiedJson', 'Copied JSON') : t('db.copyJson', 'Copy JSON')
              }
              onClick={handleCopy}
              disabled={documentUnavailable}
              className={iconButtonClassName}
            />
            {!isNewDocument && (
              <TooltipButton
                icon={<RefreshCw className="w-4 h-4" />}
                tooltip={t('db.refreshDocument', 'Refresh document')}
                aria-label={t('db.refreshDocument', 'Refresh document')}
                onClick={handleRefresh}
                disabled={isSaving || isLoadingDocument}
                className={iconButtonClassName}
              />
            )}
            <TooltipButton
              icon={<X className="w-4 h-4" />}
              tooltip={t('db.closeDocument', 'Close document')}
              aria-label={t('db.closeDocument', 'Close document')}
              onClick={onClose}
              className={iconButtonClassName}
            />
          </div>
        </div>

        {/* Collection info */}
        <div className="text-xs text-muted-foreground mt-1">{collection}</div>
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 bg-destructive/20/30 border-b border-destructive text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Parse error display */}
      {parseError && (
        <div className="px-4 py-2 bg-yellow-900/30 border-b border-yellow-700 text-accent text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {parseError}
        </div>
      )}

      {/* JSON Editor */}
      <div className="relative flex-1 overflow-hidden" aria-busy={isLoadingDocument}>
        <div className={`h-full${documentUnavailable ? ' invisible' : ''}`}>
          <MongoDBJsonEditor
            ref={editorRef}
            onChange={setHasChanges}
            onValidationError={setParseError}
            readOnly={readOnly}
            placeholder='{\n  "field": "value"\n}'
          />
        </div>
        {isLoadingDocument && (
          <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('common.loading', 'Loading...')}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-border flex items-center justify-between bg-surface/50">
        <div>
          {!isNewDocument && !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={isSaving || documentUnavailable}
              className="text-destructive hover:text-destructive hover:bg-destructive/20/20"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={readOnly || isSaving || documentUnavailable || !!parseError || (!isNewDocument && !hasChanges)}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            {isNewDocument ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MongoDBDocumentEditor;
