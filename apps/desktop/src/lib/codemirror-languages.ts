/**
 * Shared CodeMirror language detection (SFTP editor, project code browser, diff view).
 * Only the single required language is instantiated per call.
 */
import type { Extension } from '@codemirror/state';
import { StreamLanguage, type Language } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { php } from '@codemirror/lang-php';
import { sql } from '@codemirror/lang-sql';
import { go } from '@codemirror/legacy-modes/mode/go';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { rust } from '@codemirror/legacy-modes/mode/rust';
import { nginx } from '@codemirror/legacy-modes/mode/nginx';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { cmake } from '@codemirror/legacy-modes/mode/cmake';

type LanguageFactory = () => { language: Language; extension: Extension };

const legacy =
  (parser: Parameters<typeof StreamLanguage.define>[0]): LanguageFactory =>
  () => {
    const language = StreamLanguage.define(parser);
    return { language, extension: language };
  };

const LANGUAGES: Record<string, LanguageFactory> = {
  js: () => javascript(),
  mjs: () => javascript(),
  cjs: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  mts: () => javascript({ typescript: true }),
  cts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  json: () => json(),
  jsonc: () => json(),
  yaml: () => yaml(),
  yml: () => yaml(),
  py: () => python(),
  pyw: () => python(),
  md: () => markdown(),
  mdx: () => markdown(),
  xml: () => xml(),
  svg: () => xml(),
  plist: () => xml(),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  scss: () => css(),
  less: () => css(),
  php: () => php(),
  sql: () => sql(),
  go: legacy(go),
  sh: legacy(shell),
  bash: legacy(shell),
  zsh: legacy(shell),
  toml: legacy(toml),
  rs: legacy(rust),
  properties: legacy(properties),
  ini: legacy(properties),
  cfg: legacy(properties),
  env: legacy(properties),
  diff: legacy(diff),
  patch: legacy(diff),
  cmake: legacy(cmake),
};

// Whole-filename matches (lowercased) take precedence over extensions.
const FILENAMES: Record<string, LanguageFactory> = {
  dockerfile: legacy(dockerFile),
  containerfile: legacy(dockerFile),
  'nginx.conf': legacy(nginx),
  '.env': legacy(properties),
  '.gitconfig': legacy(properties),
  '.editorconfig': legacy(properties),
  '.bashrc': legacy(shell),
  '.zshrc': legacy(shell),
  '.profile': legacy(shell),
  'cmakelists.txt': legacy(cmake),
};

function resolveLanguage(filename: string): LanguageFactory | null {
  const baseName = (filename.split('/').pop() ?? filename).toLowerCase();
  if (FILENAMES[baseName]) return FILENAMES[baseName];
  if (baseName.startsWith('dockerfile.') || baseName.endsWith('.dockerfile')) {
    return FILENAMES.dockerfile;
  }
  if (baseName.startsWith('.env.')) return FILENAMES['.env'];
  if (baseName.endsWith('.conf') && filename.toLowerCase().includes('nginx')) {
    return FILENAMES['nginx.conf'];
  }
  const dot = baseName.lastIndexOf('.');
  if (dot <= 0) return null;
  return LANGUAGES[baseName.slice(dot + 1)] ?? null;
}

/** Cheap check without instantiating the language. */
export function hasLanguageSupport(filename: string): boolean {
  return resolveLanguage(filename) !== null;
}

/** Editor extension for the file, or null for plain text. */
export function getLanguageExtension(filename: string): Extension | null {
  return resolveLanguage(filename)?.().extension ?? null;
}

/** Parser-level language (for highlighting outside an editor), or null. */
export function getLanguage(filename: string): Language | null {
  return resolveLanguage(filename)?.().language ?? null;
}
