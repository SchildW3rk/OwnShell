/**
 * Text input with `{{` variable autocomplete. The names come from the nearest
 * VariableSuggestionsContext (empty outside the request editor, so it is a plain input).
 */

import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import {
  applyVariableSuggestion,
  filterVariableSuggestions,
  findVariableQuery,
  type VariableSuggestion,
} from './variable-suggestions';

export const VariableSuggestionsContext = createContext<VariableSuggestion[]>([]);

export function useVariableSuggestions(): VariableSuggestion[] {
  return useContext(VariableSuggestionsContext);
}

type VariableInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
};

interface OpenList {
  start: number;
  items: VariableSuggestion[];
  active: number;
  rect: DOMRect;
}

export const VariableInput: React.FC<VariableInputProps> = ({ value, onValueChange, onKeyDown, onBlur, ...props }) => {
  const { t } = useTranslation();
  const suggestions = useVariableSuggestions();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [list, setList] = useState<OpenList | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  const update = (text: string, caret: number) => {
    const query = suggestions.length ? findVariableQuery(text, caret) : null;
    const items = query ? filterVariableSuggestions(suggestions, query.query).slice(0, 50) : [];
    setList(
      query && items.length && inputRef.current
        ? { start: query.start, items, active: 0, rect: inputRef.current.getBoundingClientRect() }
        : null
    );
  };

  const pick = (suggestion: VariableSuggestion) => {
    const input = inputRef.current;
    if (!input || !list) return;
    const next = applyVariableSuggestion(value, input.selectionStart ?? value.length, list.start, suggestion.name);
    pendingCaret.current = next.caret;
    setList(null);
    onValueChange(next.text);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (list) {
      const move = (delta: number) =>
        setList({ ...list, active: (list.active + delta + list.items.length) % list.items.length });
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        move(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        pick(list.items[list.active]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setList(null);
        return;
      }
    }
    onKeyDown?.(event);
  };

  const listId = props.id ? `${props.id}-variables` : undefined;
  return (
    <>
      <input
        {...props}
        ref={inputRef}
        value={value}
        // While the list is open the view's shortcuts leave Enter/Esc to it (see shortcuts.ts).
        aria-expanded={list ? true : undefined}
        aria-autocomplete={suggestions.length ? 'list' : undefined}
        aria-controls={list ? listId : undefined}
        onChange={(event) => {
          onValueChange(event.target.value);
          update(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          setList(null);
          onBlur?.(event);
        }}
      />
      {list &&
        createPortal(
          <div
            id={listId}
            role="listbox"
            aria-label={t('api.variables.suggestions')}
            className="fixed z-[100] max-h-60 min-w-[240px] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
            style={{ left: list.rect.left, top: list.rect.bottom + 4, width: Math.min(list.rect.width, 420) }}
          >
            {list.items.map((item, index) => (
              <div
                key={item.name}
                role="option"
                aria-selected={index === list.active}
                // mousedown, not click: the input must not blur first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(item);
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-1 text-xs',
                  index === list.active ? 'bg-primary/15' : 'hover:bg-primary/10'
                )}
              >
                <span className="font-mono text-foreground">{item.name}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {item.secret ? t('api.variables.secretValue') : item.value}
                </span>
                <span className="flex-shrink-0 rounded bg-secondary px-1.5 text-[10px] text-muted-foreground">
                  {t(`api.variables.scope.${item.scope}`)}
                </span>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};
