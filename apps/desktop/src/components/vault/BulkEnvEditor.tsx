/**
 * Bulk ENV Editor (v1.17.0)
 *
 * CodeMirror-based editor for bulk editing of environment variables
 * Supports .env file format parsing and export
 */

import React, { useRef, useEffect, useState, useImperativeHandle } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { getCodeMirrorTheme } from '../../utils/codemirror-theme';

interface BulkEnvEditorProps {
  initialContent?: string;
  contentRef: React.Ref<BulkEnvEditorHandle>;
}

export interface BulkEnvEditorHandle {
  getContent: () => string;
}

/**
 * Parse .env file content into key-value pairs
 * Format: KEY=VALUE (one per line)
 * Supports:
 * - Comments (#)
 * - Empty lines
 * - Quoted values
 * - Multi-line values (quotes)
 */
export function parseEnvContent(content: string): Array<{ key: string; value: string }> {
  const variables: Array<{ key: string; value: string }> = [];
  const lines = content.split('\n');

  let currentKey = '';
  let currentValue = '';
  let inMultiline = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments (if not in multiline)
    if (!inMultiline && (line === '' || line.startsWith('#'))) {
      continue;
    }

    // Check for KEY=VALUE pattern
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

    if (match && !inMultiline) {
      const key = match[1];
      let value = match[2];

      // Check if value starts with quote (multiline)
      if (value.startsWith('"') && !value.endsWith('"')) {
        inMultiline = true;
        currentKey = key;
        currentValue = value.slice(1); // Remove opening quote
      } else if (value.startsWith('"') && value.endsWith('"')) {
        // Single-line quoted value
        value = value.slice(1, -1);
        variables.push({ key, value });
      } else {
        // Unquoted value
        variables.push({ key, value });
      }
    } else if (inMultiline) {
      // Continue multiline value
      if (rawLine.endsWith('"')) {
        // End of multiline
        currentValue += '\n' + rawLine.slice(0, -1);
        variables.push({ key: currentKey, value: currentValue });
        inMultiline = false;
        currentKey = '';
        currentValue = '';
      } else {
        currentValue += '\n' + rawLine;
      }
    }
  }

  return variables;
}

/**
 * Generate .env file content from key-value pairs
 */
export function generateEnvContent(variables: Array<{ key: string; value: string }>): string {
  return variables
    .map((v) => {
      // Quote values with spaces or special characters
      if (v.value.includes(' ') || v.value.includes('\n') || v.value.includes('#')) {
        return `${v.key}="${v.value}"`;
      }
      return `${v.key}=${v.value}`;
    })
    .join('\n');
}

export const BulkEnvEditor: React.FC<BulkEnvEditorProps> = ({
  initialContent = '',
  contentRef,
}) => {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const editorFontFamily = useAppearanceStore((state) => state.editorFontFamily);
  const editorFontSize = useAppearanceStore((state) => state.editorFontSize);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const [parseStatus, setParseStatus] = useState<{
    success: boolean;
    count: number;
    error?: string;
  } | null>(null);

  // Command-boundary reads include edits whose deferred validation has not run.
  useImperativeHandle(contentRef, () => ({
    getContent: () => viewRef.current?.state.doc.toString() ?? initialContent,
  }), [initialContent]);

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    // Destroy existing view if any
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const currentTheme = useThemeStore.getState().getResolvedTheme();
    const initialAppearance = useAppearanceStore.getState();
    let parseTimer: number | undefined;
    const validate = () => {
      if (!viewRef.current) return;
      try {
        const count = parseEnvContent(viewRef.current.state.doc.toString()).length;
        setParseStatus((previous) =>
          previous?.success && previous.count === count ? previous : { success: true, count }
        );
      } catch (error) {
        setParseStatus({ success: false, count: 0, error: (error as Error).message });
      }
    };

    const extensions = [
      basicSetup,
      themeCompartment.current.of(
        getCodeMirrorTheme(currentTheme, {
          editorFontFamily: initialAppearance.editorFontFamily,
          editorFontSize: initialAppearance.editorFontSize,
        })
      ),
      EditorView.theme({
        '&': { height: '400px' },
        '.cm-scroller': {
          overflow: 'auto',
        },
        '.cm-content': {
          padding: '8px 0',
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // Keep typing and history local; avoid whole-document parent updates.
          window.clearTimeout(parseTimer);
          parseTimer = window.setTimeout(validate, 150);
        }
      }),
    ];

    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    validate();

    return () => {
      window.clearTimeout(parseTimer);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Update content when initialContent changes externally
  useEffect(() => {
    if (viewRef.current && initialContent !== viewRef.current.state.doc.toString()) {
      const transaction = viewRef.current.state.update({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: initialContent,
        },
      });
      viewRef.current.dispatch(transaction);
    }
  }, [initialContent]);

  return (
    <div className="space-y-3">
      {/* Editor */}
      <div
        ref={editorRef}
        className="overflow-hidden rounded-md border border-border transition-colors duration-200"
      />

      {/* Status */}
      {parseStatus && (
        <div
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-200 ${
            parseStatus.success
              ? 'bg-success/20 text-success'
              : 'bg-destructive/20 text-destructive'
          }`}
        >
          {parseStatus.success ? (
            <>
              <CheckCircle className="h-4 w-4" />
              <span>
                {parseStatus.count === 1
                  ? t('vault.variablesParsed', { count: parseStatus.count })
                  : t('vault.variablesParsed_plural', { count: parseStatus.count })}
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4" />
              <span>
                {t('vault.parseError')}: {parseStatus.error}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
