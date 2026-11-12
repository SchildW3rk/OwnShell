import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { json } from '@codemirror/lang-json';
import { Compartment, EditorState, Text, type ChangeSet, type Extension } from '@codemirror/state';
import { placeholder as codeMirrorPlaceholder } from '@codemirror/view';
import { EditorView, basicSetup } from 'codemirror';
import { cn } from '@ownshell/ui';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { getCodeMirrorTheme } from '../../utils/codemirror-theme';
import type { JsonTextChange, JsonValidationRequest, JsonValidationResult } from './mongodb-json-validation.worker';

export interface MongoDBJsonEditorHandle {
  getValue: () => string;
  setValue: (value: string, markClean: boolean) => void;
  loadValue: (json: string) => Promise<void>;
}

interface MongoDBJsonEditorProps {
  onChange: (hasChanges: boolean) => void;
  onValidationError: (error: string | null) => void;
  readOnly: boolean;
  placeholder?: string;
  className?: string;
}

export const MongoDBJsonEditor = React.forwardRef<MongoDBJsonEditorHandle, MongoDBJsonEditorProps>(function MongoDBJsonEditor({
  onChange,
  onValidationError,
  readOnly,
  placeholder,
  className,
}, ref) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onValidationErrorRef = useRef(onValidationError);
  const initialDocument = useMemo(() => Text.of(['{}']), []);
  const documentRef = useRef(initialDocument);
  const originalDocumentRef = useRef(initialDocument);
  const replacingRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const validationInFlight = useRef(false);
  const validationVersion = useRef(0);
  const validationFailure = useRef<string | null>(null);
  const pendingReset = useRef<Text | null>(initialDocument);
  const pendingResetValue = useRef<string | null>('{}');
  const pendingChanges = useRef<ChangeSet | null>(null);
  const pendingFormat = useRef<string | null>(null);
  const loadRequest = useRef<{ version: number; resolve: () => void; reject: (error: Error) => void } | null>(null);
  const loadingRef = useRef(false);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const editability = useMemo(() => new Compartment(), []);
  // Keep one validation in flight; compose pending edits instead of queuing full documents per key.
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const editorFontFamily = useAppearanceStore((state) => state.editorFontFamily);
  const editorFontSize = useAppearanceStore((state) => state.editorFontSize);

  useEffect(() => {
    onChangeRef.current = onChange;
    onValidationErrorRef.current = onValidationError;
  }, [onChange, onValidationError]);

  const sendValidation = useCallback(() => {
    const worker = workerRef.current;
    if (!worker || validationInFlight.current) return;

    let message: JsonValidationRequest;
    if (pendingFormat.current !== null) {
      message = { type: 'format', version: validationVersion.current, value: pendingFormat.current };
      pendingFormat.current = null;
    } else if (pendingReset.current) {
      message = { type: 'reset', version: validationVersion.current, value: pendingResetValue.current ?? pendingReset.current.toString() };
      pendingReset.current = null;
      pendingResetValue.current = null;
      pendingChanges.current = null;
    } else {
      const changes = pendingChanges.current;
      if (!changes) return;
      const edits: JsonTextChange[] = [];
      changes.iterChanges((from, to, _fromNew, _toNew, insert) => {
        edits.push({ from, to, insert: insert.toString() });
      });
      message = { type: 'changes', version: validationVersion.current, changes: edits };
      pendingChanges.current = null;
    }
    validationInFlight.current = true;
    worker.postMessage(message);
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    loadingRef.current = loading;
    const locked = readOnlyRef.current || loading;
    viewRef.current?.dispatch({ effects: editability.reconfigure([
      EditorState.readOnly.of(locked),
      EditorView.editable.of(!locked),
      EditorView.contentAttributes.of({ 'aria-readonly': locked ? 'true' : 'false' }),
    ]) });
  }, [editability]);

  const replaceDocument = useCallback((value: string, markClean: boolean) => {
    const view = viewRef.current;
    if (view) {
      replacingRef.current = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      } finally {
        replacingRef.current = false;
      }
      documentRef.current = view.state.doc;
    } else {
      documentRef.current = Text.of(value.split('\n'));
    }
    if (markClean) originalDocumentRef.current = documentRef.current;
    onChangeRef.current(!documentRef.current.eq(originalDocumentRef.current));
  }, []);

  const cancelLoad = useCallback(() => {
    loadRequest.current?.reject(new DOMException('Document selection changed', 'AbortError'));
    loadRequest.current = null;
    pendingFormat.current = null;
  }, []);

  useImperativeHandle(ref, () => ({
    getValue: () => documentRef.current.toString(),
    setValue(value: string, markClean: boolean) {
      cancelLoad();
      setLoading(false);
      replaceDocument(value, markClean);
      validationVersion.current++;
      pendingReset.current = documentRef.current;
      pendingResetValue.current = value;
      pendingChanges.current = null;
      onValidationErrorRef.current(validationFailure.current);
      sendValidation();
    },
    loadValue(value: string) {
      cancelLoad();
      setLoading(true);
      validationVersion.current++;
      pendingReset.current = null;
      pendingResetValue.current = null;
      pendingChanges.current = null;
      if (validationFailure.current) return Promise.reject(new Error(validationFailure.current));
      pendingFormat.current = value;
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      loadRequest.current = { version: validationVersion.current, resolve, reject };
      sendValidation();
      return promise;
    },
  }), [cancelLoad, replaceDocument, sendValidation, setLoading]);

  const extensions = useMemo<Extension[]>(() => {
    const baseExtensions: Extension[] = [
      basicSetup,
      json(),
      ...getCodeMirrorTheme(resolvedTheme, {
        editorFontFamily,
        editorFontSize,
      }),
      EditorView.lineWrapping,
      editability.of([
        EditorState.readOnly.of(readOnly || loadingRef.current),
        EditorView.editable.of(!readOnly && !loadingRef.current),
        EditorView.contentAttributes.of({ 'aria-readonly': readOnly || loadingRef.current ? 'true' : 'false' }),
      ]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        documentRef.current = update.state.doc;
        if (replacingRef.current) return;

        validationVersion.current++;
        if (pendingReset.current) {
          pendingReset.current = update.state.doc;
          pendingResetValue.current = null;
        } else {
          pendingChanges.current = pendingChanges.current
            ? pendingChanges.current.compose(update.changes)
            : update.changes;
        }
        onChangeRef.current(!update.state.doc.eq(originalDocumentRef.current));
        onValidationErrorRef.current(validationFailure.current);
        sendValidation();
      }),
      EditorView.contentAttributes.of({
        'aria-label': 'MongoDB document JSON',
        spellcheck: 'false',
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          backgroundColor: 'transparent',
        },
        '.cm-scroller': {
          height: '100%',
          overflow: 'auto',
        },
        '.cm-content': {
          minHeight: '100%',
          padding: '16px 0',
        },
        '.cm-line': {
          padding: '0 16px',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          border: 'none',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'transparent',
        },
        '.cm-cursor': readOnly
          ? {
              display: 'none',
            }
          : {},
        '.cm-placeholder': {
          color: 'var(--muted-foreground)',
          opacity: '0.7',
        },
      }),
    ];

    if (placeholder) {
      baseExtensions.push(codeMirrorPlaceholder(placeholder));
    }

    return baseExtensions;
  }, [editability, editorFontFamily, editorFontSize, placeholder, readOnly, resolvedTheme, sendValidation]);

  useEffect(() => {
    if (!editorRef.current) return;

    const currentDoc = documentRef.current;
    viewRef.current?.destroy();

    const state = EditorState.create({
      doc: currentDoc,
      extensions,
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });
    if (loadingRef.current) setLoading(true);

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [extensions, setLoading]);

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./mongodb-json-validation.worker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      validationFailure.current = error instanceof Error ? error.message : tRef.current('database.jsonWorkerFailed');
      onValidationErrorRef.current(validationFailure.current);
      loadRequest.current?.reject(new Error(validationFailure.current));
      loadRequest.current = null;
      pendingFormat.current = null;
      return;
    }
    workerRef.current = worker;
    worker.onmessage = ({ data }: MessageEvent<JsonValidationResult>) => {
      if (workerRef.current !== worker) return;
      validationInFlight.current = false;
      if (data.version === validationVersion.current) {
        const request = loadRequest.current;
        if (request?.version === data.version) {
          loadRequest.current = null;
          if (data.error || data.formattedValue === undefined) {
            const message = data.error || tRef.current('database.documentFormatterEmpty');
            onValidationErrorRef.current(message);
            request.reject(new Error(message));
          } else {
            try {
              replaceDocument(data.formattedValue, true);
              setLoading(false);
              onValidationErrorRef.current(null);
              request.resolve();
            } catch (cause) {
              const error = cause instanceof Error ? cause : new Error(tRef.current('database.documentDisplayFailed'));
              onValidationErrorRef.current(error.message);
              request.reject(error);
            }
          }
        } else {
          onValidationErrorRef.current(data.error);
        }
      }
      sendValidation();
    };
    worker.onerror = (event) => {
      if (workerRef.current !== worker) return;
      validationFailure.current = event.message || tRef.current('database.jsonWorkerFailed');
      onValidationErrorRef.current(validationFailure.current);
      loadRequest.current?.reject(new Error(validationFailure.current));
      loadRequest.current = null;
      pendingFormat.current = null;
      workerRef.current = null;
      validationInFlight.current = false;
      worker.terminate();
    };
    sendValidation();

    return () => {
      workerRef.current = null;
      cancelLoad();
      validationInFlight.current = false;
      worker.terminate();
    };
  }, [cancelLoad, replaceDocument, sendValidation, setLoading]);

  return (
    <div
      ref={editorRef}
      className={cn('h-full w-full overflow-hidden bg-background text-foreground', className)}
    />
  );
});
