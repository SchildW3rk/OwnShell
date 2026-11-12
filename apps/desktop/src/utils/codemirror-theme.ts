/**
 * CodeMirror Theme Utility
 *
 * Provides consistent dark/light themes for all CodeMirror editors in the app.
 * Automatically adapts to the app's theme setting.
 */

import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { ResolvedTheme } from '../stores/useThemeStore';
import { DEFAULT_EDITOR_FONT_FAMILY, DEFAULT_EDITOR_FONT_SIZE } from './appearance';

export interface CodeMirrorAppearance {
  editorFontFamily?: string;
  editorFontSize?: number;
}

/**
 * Light theme for CodeMirror (One Light inspired)
 * Colors matched to app's light theme CSS variables
 */
const oneLightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#ffffff',
      color: '#383a42',
    },
    '.cm-content': {
      caretColor: '#0a0a0f',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#0a0a0f',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: '#06b6d430',
      },
    '.cm-panels': {
      backgroundColor: '#fafafa',
      color: '#383a42',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid #e5e5e5',
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: '1px solid #e5e5e5',
    },
    '.cm-searchMatch': {
      backgroundColor: '#ffdd3380',
      outline: '1px solid #ffc107',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: '#ff990080',
    },
    '.cm-activeLine': {
      backgroundColor: '#f4f4f508',
    },
    '.cm-selectionMatch': {
      backgroundColor: '#06b6d420',
    },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: '#bad0f847',
      outline: '1px solid #7c7c7c40',
    },
    '.cm-gutters': {
      backgroundColor: '#fafafa',
      color: '#71717a',
      borderRight: '1px solid #e5e5e5',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#f4f4f5',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'transparent',
      border: 'none',
      color: '#71717a',
    },
    '.cm-tooltip': {
      border: '1px solid #e5e5e5',
      backgroundColor: '#ffffff',
    },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: '#ffffff',
      borderBottomColor: '#ffffff',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: '#06b6d420',
        color: '#383a42',
      },
    },
  },
  { dark: false }
);

/**
 * Light theme syntax highlighting (One Light inspired)
 */
const oneLightHighlighting = HighlightStyle.define([
  { tag: tags.keyword, color: '#a626a4' },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName],
    color: '#e45649',
  },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#4078f2' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#986801' },
  { tag: [tags.definition(tags.name), tags.separator], color: '#383a42' },
  {
    tag: [
      tags.typeName,
      tags.className,
      tags.number,
      tags.changed,
      tags.annotation,
      tags.modifier,
      tags.self,
      tags.namespace,
    ],
    color: '#c18401',
  },
  {
    tag: [
      tags.operator,
      tags.operatorKeyword,
      tags.url,
      tags.escape,
      tags.regexp,
      tags.link,
      tags.special(tags.string),
    ],
    color: '#0184bc',
  },
  { tag: [tags.meta, tags.comment], color: '#a0a1a7', fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#0184bc', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#e45649' },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#986801' },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#50a14f' },
  { tag: tags.invalid, color: '#ff0000' },
]);

/**
 * Combined light theme extension
 */
const oneLight: Extension = [oneLightTheme, syntaxHighlighting(oneLightHighlighting)];

/**
 * Base theme overrides for consistent styling
 */
const baseTheme = (isDark: boolean, appearance?: CodeMirrorAppearance) =>
  EditorView.theme(
    {
      '&': {
        fontSize: `${appearance?.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE}px`,
      },
      '.cm-scroller': {
        fontFamily: appearance?.editorFontFamily || DEFAULT_EDITOR_FONT_FAMILY,
      },
    },
    { dark: isDark }
  );

/**
 * CodeMirror themes mapped to app theme
 */
export const CODEMIRROR_THEMES: Record<ResolvedTheme, Extension[]> = {
  dark: [oneDark, baseTheme(true)],
  light: [oneLight, baseTheme(false)],
};

/**
 * Get CodeMirror theme extensions for the given app theme
 */
export function getCodeMirrorTheme(
  theme: ResolvedTheme,
  appearance?: CodeMirrorAppearance
): Extension[] {
  const isDark = theme === 'dark';
  return [isDark ? oneDark : oneLight, baseTheme(isDark, appearance)];
}

/**
 * Get the base theme extension (font, size) without colors
 * Useful when you need to add extensions separately
 */
export function getCodeMirrorBaseTheme(
  isDark: boolean,
  appearance?: CodeMirrorAppearance
): Extension {
  return baseTheme(isDark, appearance);
}
