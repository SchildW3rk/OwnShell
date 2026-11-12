import React, { useMemo } from 'react';
import { EditorState, StateEffect } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { EditorView, basicSetup } from 'codemirror';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { useAppearanceStore } from '../../../stores/useAppearanceStore';
import { useThemeStore } from '../../../stores/useThemeStore';
import { getCodeMirrorTheme } from '../../../utils/codemirror-theme';
import type { BodyEditorMemory, BodyValue } from './types';
import { useVariableSuggestions } from '../variables/VariableInput';
import { filterVariableSuggestions, type VariableSuggestion } from '../variables/variable-suggestions';

/** The parts of @codemirror/autocomplete's CompletionContext used here (basicSetup provides it). */
interface CompletionContextLike {
  state: EditorState;
  pos: number;
  matchBefore(expr: RegExp): { from: number; to: number; text: string } | null;
}

/** `{{` completion source, read through refs so new suggestions do not rebuild the editor. */
function variableCompletionSource(
  suggestions: React.MutableRefObject<VariableSuggestion[]>,
  label: React.MutableRefObject<(item: VariableSuggestion) => string>
) {
  return (context: CompletionContextLike) => {
    const match = context.matchBefore(/\{\{\s*[^{}\s]*/);
    if (!match) return null;
    const query = /[^{}\s]*$/.exec(match.text)?.[0] ?? '';
    const closed = context.state.sliceDoc(context.pos, context.pos + 2) === '}}';
    const options = filterVariableSuggestions(suggestions.current, query).map((item) => ({
      label: item.name,
      detail: label.current(item),
      type: 'variable',
      apply: closed ? item.name : `${item.name}}}`,
    }));
    return options.length ? { from: context.pos - query.length, options, validFor: /^[^{}\s]*$/ } : null;
  };
}

interface CodeEditorProps {
  value: BodyValue;
  onChange: (value: BodyValue) => void;
  memory: BodyEditorMemory;
  language: 'json' | 'xml' | 'text';
  placeholder?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  memory,
  language,
  placeholder,
}) => {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const onChangeRef = React.useRef(onChange);
  const lastValueRef = React.useRef<BodyValue>(value);
  onChangeRef.current = onChange;
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const editorFontFamily = useAppearanceStore((state) => state.editorFontFamily);
  const editorFontSize = useAppearanceStore((state) => state.editorFontSize);
  const { t } = useTranslation();
  const suggestionsRef = React.useRef<VariableSuggestion[]>([]);
  suggestionsRef.current = useVariableSuggestions();
  const labelRef = React.useRef<(item: VariableSuggestion) => string>(() => '');
  // Secret values are never shown, only the scope.
  labelRef.current = (item) =>
    `${t(`api.variables.scope.${item.scope}`)}${item.secret ? ` · ${t('api.variables.secretValue')}` : ''}`;

  const extensions = useMemo(() => {
    const baseExtensions = [
      basicSetup,
      ...getCodeMirrorTheme(resolvedTheme, {
        editorFontFamily,
        editorFontSize,
      }),
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
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          lastValueRef.current = update.state.doc;
          onChangeRef.current(update.state.doc);
        }
      }),
      EditorView.contentAttributes.of({ 'data-placeholder': placeholder || '' }),
      EditorState.languageData.of(() => [
        { autocomplete: variableCompletionSource(suggestionsRef, labelRef) },
      ]),
    ];

    if (language === 'json') {
      baseExtensions.push(json());
    } else if (language === 'xml') {
      baseExtensions.push(xml());
    }

    return baseExtensions;
  }, [language, placeholder, resolvedTheme, editorFontFamily, editorFontSize]);

  React.useLayoutEffect(() => {
    if (!editorRef.current) return;
    const cached = memory.state;
    const unchanged = cached && (typeof value === 'string'
      ? cached.doc.length === value.length && cached.doc.toString() === value
      : cached.doc.eq(value));
    const restored = cached?.update({
      effects: StateEffect.reconfigure.of(extensions),
      changes: unchanged ? undefined : { from: 0, to: cached.doc.length, insert: value },
    });
    const state = restored?.state ?? EditorState.create({ doc: value, extensions });
    lastValueRef.current = value;
    const view = new EditorView({
      state,
      parent: editorRef.current,
      scrollTo: unchanged
        ? memory.scrollSnapshot
        : restored && memory.scrollSnapshot?.map(restored.changes),
    });
    viewRef.current = view;

    return () => {
      memory.state = view.state;
      memory.scrollSnapshot = view.scrollSnapshot();
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [extensions, memory]);

  React.useEffect(() => {
    if (!viewRef.current || value === lastValueRef.current) return;
    const currentDoc = viewRef.current.state.doc;
    lastValueRef.current = value;
    const unchanged = typeof value === 'string'
      ? currentDoc.length === value.length && currentDoc.toString() === value
      : currentDoc.eq(value);
    if (!unchanged) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: value,
        },
      });
    }
  }, [value]);

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
