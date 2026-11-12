/**
 * File Editor Modal (CodeMirror 6)
 *
 * A full-featured code editor modal for editing remote files via SFTP.
 * Supports syntax highlighting for various languages.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@ownshell/ui';
import { SFTPFileEntry } from '@ownshell/core';
import { X, Save, Loader2, AlertCircle, FileCode } from 'lucide-react';

// CodeMirror imports
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { php } from '@codemirror/lang-php';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { getCodeMirrorTheme } from '../../utils/codemirror-theme';

interface FileEditorProps {
  file: SFTPFileEntry;
  isOpen: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
  initialContent?: string;
  encoding: 'utf-8' | 'latin1';
  isLoading?: boolean;
  isSaving?: boolean;
  loadError?: string | null;
}

/**
 * Set of file extensions with syntax highlighting support.
 * Used for cheap existence checks (e.g. footer status bar)
 * without instantiating language extensions.
 */
const SUPPORTED_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'py',
  'pyw',
  'md',
  'mdx',
  'xml',
  'svg',
  'plist',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'php',
]);

/**
 * Check if a filename has syntax highlighting support
 */
function hasLanguageSupport(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_EXTENSIONS.has(ext);
}

function getFileLanguageLabel(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const baseName = filename.toLowerCase();

  if (baseName === 'caddyfile') return 'Caddyfile';
  if (!ext || ext === filename.toLowerCase()) return 'Plain Text';
  return hasLanguageSupport(filename) ? ext.toUpperCase() : 'Plain Text';
}

/**
 * Determine the CodeMirror language extension based on file extension.
 * Only instantiates the single required extension (not all 20+).
 */
function getLanguageExtension(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'ts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ typescript: true, jsx: true });
    case 'json':
    case 'jsonc':
      return json();
    case 'yaml':
    case 'yml':
      return yaml();
    case 'py':
    case 'pyw':
      return python();
    case 'md':
    case 'mdx':
      return markdown();
    case 'xml':
    case 'svg':
    case 'plist':
      return xml();
    case 'html':
    case 'htm':
      return html();
    case 'css':
    case 'scss':
    case 'less':
      return css();
    case 'php':
      return php();
    default:
      return null;
  }
}

export const FileEditor: React.FC<FileEditorProps> = ({
  file,
  isOpen,
  onClose,
  onSave,
  initialContent = '',
  encoding,
  isLoading = false,
  isSaving = false,
  loadError = null,
}) => {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const editorFontFamily = useAppearanceStore((state) => state.editorFontFamily);
  const editorFontSize = useAppearanceStore((state) => state.editorFontSize);

  const [isModified, setIsModified] = useState(false);

  // Initialize editor when content is loaded
  useEffect(() => {
    if (!editorRef.current || isLoading || loadError) return;

    // Destroy existing editor
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    // Get current theme
    const currentTheme = useThemeStore.getState().getResolvedTheme();
    const initialAppearance = useAppearanceStore.getState();

    const languageExtension = getLanguageExtension(file.name);
    const extensions = [
      basicSetup,
      themeCompartment.current.of(
        getCodeMirrorTheme(currentTheme, {
          editorFontFamily: initialAppearance.editorFontFamily,
          editorFontSize: initialAppearance.editorFontSize,
        })
      ),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // Compare the persistent document trees without serializing the whole file per key.
          // Shared unchanged branches are skipped; undo or manual restoration still clears dirty.
          setIsModified(!update.state.doc.eq(state.doc));
        }
      }),
      EditorView.theme({
        '&': {
          height: '100%',
        },
      }),
    ];

    if (languageExtension) {
      extensions.push(languageExtension);
    }

    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    // Focus editor
    viewRef.current.focus();

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [initialContent, isLoading, loadError, file.name]);

  // Update theme when app theme changes
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: themeCompartment.current.reconfigure(
          getCodeMirrorTheme(resolvedTheme, {
            editorFontFamily,
            editorFontSize,
          })
        ),
      });
    }
  }, [resolvedTheme, editorFontFamily, editorFontSize]);

  // Reset modified state when initial content changes
  useEffect(() => {
    setIsModified(false);
  }, [initialContent]);

  const handleSave = useCallback(() => {
    const view = viewRef.current;
    if (view) onSave(view.state.doc.toString());
  }, [onSave]);

  const handleClose = useCallback(() => {
    if (isModified) {
      const confirmed = window.confirm(t('editor.unsavedChanges'));
      if (!confirmed) return;
    }
    onClose();
  }, [isModified, onClose, t]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!isSaving && isModified) {
          handleSave();
        }
      }
      // Escape to close
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, isModified, handleSave, handleClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-2xl w-[90vw] h-[85vh] max-w-6xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
              <FileCode className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">{file.name}</h3>
              <p className="text-xs text-muted-foreground">
                {file.path}
                {isModified && <span className="ml-2 text-accent">({t('editor.modified')})</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !isModified}
              className="no-drag"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  {t('editor.saving')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1.5" />
                  {t('editor.save')}
                </>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClose} className="no-drag">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t('editor.loading')}</p>
              </div>
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-destructive mb-2">{t('editor.loadFailed')}</p>
                <p className="text-xs text-muted-foreground">{loadError}</p>
              </div>
            </div>
          ) : (
            <div ref={editorRef} className="h-full w-full" />
          )}
        </div>

        {/* Footer Status Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-surface text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>{getFileLanguageLabel(file.name)}</span>
            <span>{encoding === 'latin1' ? 'ISO-8859-1' : 'UTF-8'}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Cmd+S to save</span>
            <span>Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
