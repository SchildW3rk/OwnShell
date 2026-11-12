/**
 * `{{` autocomplete: which variable names a request can use, and how typing and
 * picking a name edits the text. Pure, so it is shared by plain inputs and CodeMirror.
 */

export type VariableSuggestionScope = 'request' | 'folder' | 'collection' | 'environment' | 'global' | 'dynamic';

export interface VariableSuggestion {
  name: string;
  scope: VariableSuggestionScope;
  /** Only for non-secret values the renderer already has; never set for secrets. */
  value?: string;
  secret: boolean;
}

interface NamedValue {
  key: string;
  value?: string;
  enabled?: boolean;
  secret?: boolean;
}

export const DYNAMIC_VARIABLE_NAMES = ['$uuid', '$timestamp', '$isoTimestamp'];

function parseArray(json: string | null | undefined): NamedValue[] {
  try {
    const parsed = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.key === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Names in lookup order (request → folders nearest first → collection root → environment
 * → global); a name shadowed by a higher scope is listed once, with the scope that wins.
 */
export function collectVariableSuggestions(input: {
  request: NamedValue[];
  /** Folder chain, nearest first; each `variables` is the public JSON (no secret values). */
  chain: Array<{ variables?: string | null }>;
  /** vault_environments.variables: only keys are read, values stay encrypted. */
  environmentVariables?: string | null;
  globals: NamedValue[];
}): VariableSuggestion[] {
  const result = new Map<string, VariableSuggestion>();
  const add = (items: NamedValue[], scope: VariableSuggestionScope, alwaysSecret = false) => {
    for (const item of items) {
      const name = item.key.trim();
      if (!name || item.enabled === false || result.has(name)) continue;
      const secret = alwaysSecret || item.secret === true;
      result.set(name, { name, scope, secret, ...(!secret && { value: item.value ?? '' }) });
    }
  };
  add(input.request, 'request');
  input.chain.forEach((folder, index) =>
    add(parseArray(folder.variables), index === input.chain.length - 1 ? 'collection' : 'folder')
  );
  add(parseArray(input.environmentVariables), 'environment', true);
  add(input.globals, 'global');
  for (const name of DYNAMIC_VARIABLE_NAMES) {
    if (!result.has(name)) result.set(name, { name, scope: 'dynamic', secret: false });
  }
  return [...result.values()];
}

/** The `{{name` being typed right before the caret: `start` is where the name begins. */
export function findVariableQuery(text: string, caret: number): { start: number; query: string } | null {
  const match = /\{\{\s*([^{}\s]*)$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[1].length, query: match[1] } : null;
}

export function filterVariableSuggestions(suggestions: VariableSuggestion[], query: string): VariableSuggestion[] {
  const lower = query.toLowerCase();
  return suggestions
    .filter((suggestion) => suggestion.name.toLowerCase().includes(lower))
    .sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(lower)) - Number(!b.name.toLowerCase().startsWith(lower))
    );
}

/** Replaces the typed name with `name}}` (no second `}}` if one already follows). */
export function applyVariableSuggestion(
  text: string,
  caret: number,
  start: number,
  name: string
): { text: string; caret: number } {
  const after = text.slice(caret).replace(/^[^{}\s]*/, '');
  const closing = /^\s*\}\}/.test(after) ? '' : '}}';
  const inserted = `${name}${closing}`;
  const closingLength = closing ? 0 : (/^\s*\}\}/.exec(after)?.[0].length ?? 0);
  return {
    text: `${text.slice(0, start)}${inserted}${after}`,
    caret: start + inserted.length + closingLength,
  };
}

/** Interpolation values that print the built-in names literally in translated hints. */
export const BUILT_IN_NAMES = {
  uuid: '{{$uuid}}',
  timestamp: '{{$timestamp}}',
  iso: '{{$isoTimestamp}}',
  interpolation: { escapeValue: false },
};
