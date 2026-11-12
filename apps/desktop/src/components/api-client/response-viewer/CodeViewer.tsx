import React, { useEffect, useMemo, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { EditorView, basicSetup } from 'codemirror';
import { cn } from '@ownshell/ui';
import { useAppearanceStore } from '../../../stores/useAppearanceStore';
import { useThemeStore } from '../../../stores/useThemeStore';
import { getCodeMirrorTheme } from '../../../utils/codemirror-theme';
import type { ResponseContentType } from './types';

interface CodeViewerProps {
  content: string;
  language: ResponseContentType;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ content, language }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const editorFontFamily = useAppearanceStore((state) => state.editorFontFamily);
  const editorFontSize = useAppearanceStore((state) => state.editorFontSize);

  const extensions = useMemo(() => {
    const baseExtensions = [
      basicSetup,
      ...getCodeMirrorTheme(resolvedTheme, {
        editorFontFamily,
        editorFontSize,
      }),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.contentAttributes.of({ tabindex: '0' }),
      EditorView.theme({
        '&': {
          height: '100%',
        },
        '.cm-content': {
          padding: '8px 0',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          border: 'none',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'transparent',
        },
        '.cm-cursor': {
          display: 'none',
        },
      }),
    ];

    switch (language) {
      case 'json':
        baseExtensions.push(json());
        break;
      case 'xml':
        baseExtensions.push(xml());
        break;
      case 'html':
        baseExtensions.push(html());
        break;
    }

    return baseExtensions;
  }, [language, resolvedTheme, editorFontFamily, editorFontSize]);

  useEffect(() => {
    if (!editorRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      viewRef.current?.destroy();
    };
  }, [content, extensions]);

  return (
    <div
      ref={editorRef}
      className={cn(
        'h-full w-full overflow-hidden rounded-md',
        resolvedTheme === 'dark' ? 'bg-[#282c34]' : 'bg-white border border-border'
      )}
    />
  );
};
