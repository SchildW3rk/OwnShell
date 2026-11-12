/**
 * Database Query Console
 *
 * SQL editor with CodeMirror 6 and query execution.
 * Uses Compartments for dynamic theme and SQL schema updates
 * so the editor is created once and never destroyed on prop changes.
 */

import React, { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { keymap } from '@codemirror/view';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Play, Loader2, Clock, AlertCircle, CheckCircle, History, Lock, Trash2 } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useExecuteQuery, useClearQueryHistory } from '../../hooks/db-explorer';
import { useDBQueryHistory } from '../../hooks/db-explorer';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { getCodeMirrorTheme } from '../../utils/codemirror-theme';

interface TableInfo {
  name: string;
  schema?: string;
}

interface DBQueryConsoleProps {
  connectionId: string | null;
  tableName: string | null;
  tables: TableInfo[];
  readOnly: boolean;
}

interface SQLQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  affectedRows?: number;
}

/**
 * Build a table schema map for SQL autocompletion
 */
function buildTableSchema(tables: TableInfo[]): Record<string, string[]> {
  const schema: Record<string, string[]> = {};
  for (const table of tables) {
    const key = table.schema ? `${table.schema}.${table.name}` : table.name;
    schema[key] = []; // Would need column info for full autocomplete
  }
  return schema;
}

const SQLQueryResults = React.memo(function SQLQueryResults({ result }: { result: SQLQueryResult }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: result.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 29,
    overscan: 10,
  });
  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = Math.max(0, virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0));

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto">
      <table className="w-full text-sm" aria-rowcount={result.rows.length + 1}>
        <thead className="sticky top-0 bg-surface">
          <tr aria-rowindex={1}>
            {result.columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left text-xs font-medium text-muted-foreground border-b border-border"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={result.columns.length} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {items.map((item) => {
            const row = result.rows[item.index];
            return (
              <tr
                key={item.key}
                data-index={item.index}
                aria-rowindex={item.index + 2}
                ref={virtualizer.measureElement}
                className="border-b border-border hover:bg-surface/50"
              >
                {result.columns.map((col) => {
                  const value = row[col];
                  return (
                    <td
                      key={col}
                      className={`px-3 py-1.5 font-mono text-xs max-w-xs truncate ${
                        value === null
                          ? 'text-muted-foreground italic'
                          : typeof value === 'number'
                            ? 'text-primary'
                            : 'text-foreground'
                      }`}
                    >
                      {value === null ? 'NULL' : String(value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={result.columns.length} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

export const DBQueryConsole: React.FC<DBQueryConsoleProps> = ({
  connectionId,
  tableName,
  tables,
  readOnly,
}) => {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const sqlCompartment = useRef(new Compartment());
  const handleExecuteRef = useRef<() => void>(() => {});
  const requestSequence = useRef(0);
  const [execution, setExecution] = useState<{
    connectionId: string;
    result: SQLQueryResult | null;
    error: string | null;
    pending: boolean;
  } | null>(null);
  const currentExecution = execution?.connectionId === connectionId ? execution : null;
  const queryResult = currentExecution?.result ?? null;
  const error = currentExecution?.error ?? null;
  const isExecuting = currentExecution?.pending ?? false;
  const [showHistory, setShowHistory] = useState(false);

  const executeQuery = useExecuteQuery(connectionId);
  const { data: history } = useDBQueryHistory(connectionId);
  const clearHistory = useClearQueryHistory(connectionId);
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const editorFontFamily = useAppearanceStore((state) => state.editorFontFamily);
  const editorFontSize = useAppearanceStore((state) => state.editorFontSize);

  // Handle query execution (memoized for button onClick)
  const handleExecute = useCallback(async () => {
    if (!viewRef.current || !connectionId) return;

    const queryText = viewRef.current.state.doc.toString().trim();
    if (!queryText) return;

    const request = ++requestSequence.current;
    setExecution({ connectionId, result: null, error: null, pending: true });

    try {
      const result = await executeQuery.mutateAsync(queryText);
      if (request === requestSequence.current) {
        setExecution({ connectionId, result: result ?? null, error: null, pending: false });
      }
    } catch (err) {
      if (request === requestSequence.current) {
        setExecution({
          connectionId,
          result: null,
          error: err instanceof Error ? err.message : t('db.queryFailed'),
          pending: false,
        });
      }
    }
  }, [connectionId, executeQuery, t]);

  // Keep ref in sync so the keymap closure always calls the latest version
  useLayoutEffect(() => {
    handleExecuteRef.current = handleExecute;
  }, [handleExecute]);

  // Initialize CodeMirror ONCE on mount
  useEffect(() => {
    if (!editorRef.current) return;

    const currentTheme = useThemeStore.getState().getResolvedTheme();
    const initialAppearance = useAppearanceStore.getState();
    const tableSchema = buildTableSchema(tables);

    // Default query based on initial tableName
    const defaultQuery = tableName
      ? `SELECT * FROM ${tableName} LIMIT 100;`
      : '-- Enter your SQL query here\n';

    const extensions = [
      basicSetup,
      themeCompartment.current.of(
        getCodeMirrorTheme(currentTheme, {
          editorFontFamily: initialAppearance.editorFontFamily,
          editorFontSize: initialAppearance.editorFontSize,
        })
      ),
      sqlCompartment.current.of(
        sql({
          dialect: PostgreSQL,
          schema: tableSchema,
        })
      ),
      EditorView.theme({
        '&': { height: '100%' },
      }),
      Prec.high(keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            handleExecuteRef.current();
            return true;
          },
        },
      ])),
    ];

    const state = EditorState.create({
      doc: defaultQuery,
      extensions,
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      requestSequence.current++;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Initialize once on mount
  }, []);

  // Update SQL schema when tables change (without recreating the editor)
  useEffect(() => {
    if (!viewRef.current) return;

    const tableSchema = buildTableSchema(tables);
    viewRef.current.dispatch({
      effects: sqlCompartment.current.reconfigure(
        sql({
          dialect: PostgreSQL,
          schema: tableSchema,
        })
      ),
    });
  }, [tables]);

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

  // Load query from history
  const loadFromHistory = (query: string) => {
    if (!viewRef.current) return;

    viewRef.current.dispatch({
      changes: {
        from: 0,
        to: viewRef.current.state.doc.length,
        insert: query,
      },
    });
    setShowHistory(false);
  };

  return (
    <div className="flex min-h-0 flex-col h-full">
      {/* Editor Section */}
      <div className="flex max-h-[50%] shrink-0 flex-col border-b border-border">
        {/* Editor Toolbar */}
        <div className="flex shrink-0 items-center justify-between px-3 py-2 bg-surface/50 border-b border-border">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={handleExecute}
              disabled={!connectionId || isExecuting}
            >
              {isExecuting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              {t('db.execute')}
            </Button>
            <span className="text-xs text-muted-foreground">Cmd/Ctrl + Enter</span>
            {readOnly && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-500">
                <Lock className="h-3 w-3" />
                {t('db.readOnlyQueryHint', 'Write queries are blocked')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowHistory(!showHistory)}>
              <History className="w-4 h-4 mr-1" />
              {t('db.history')}
            </Button>
          </div>
        </div>

        {/* CodeMirror Editor */}
        <div ref={editorRef} className="h-[200px] min-h-0 shrink bg-background" />
      </div>

      {/* Results Section */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* History Panel */}
        {showHistory && (
          <div className="flex-shrink-0 max-h-48 overflow-auto border-b border-border bg-surface/30">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-sm font-medium text-foreground">{t('db.queryHistory')}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => clearHistory.mutate()}
                disabled={clearHistory.isPending}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {t('db.clear')}
              </Button>
            </div>
            {history?.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">{t('db.noQueryHistory')}</div>
            ) : (
              <div className="divide-y divide-border">
                {history?.slice(0, 20).map((entry: any) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => loadFromHistory(entry.query)}
                    className="w-full px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {entry.success ? (
                        <CheckCircle className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.executed_at).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.execution_time}ms
                      </span>
                    </div>
                    <div className="font-mono text-xs text-foreground truncate">{entry.query}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex-shrink-0 px-4 py-3 bg-destructive/20/20 border-b border-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-destructive font-medium">{t('db.queryError')}</p>
                <p className="text-xs text-destructive mt-1 font-mono">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success Info */}
        {queryResult && (
          <div className="flex-shrink-0 px-4 py-2 bg-success/20/20 border-b border-success flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-success">
              <CheckCircle className="w-4 h-4" />
              <span>{t('common.success')}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>{queryResult.executionTime}ms</span>
            </div>
            <span className="text-muted-foreground">
              {queryResult.affectedRows !== undefined
                ? t('db.rowsAffected', { count: queryResult.affectedRows })
                : t('db.rowsReturned', { count: queryResult.rowCount })}
            </span>
          </div>
        )}

        {/* Results Table */}
        {queryResult && queryResult.rows.length > 0 && <SQLQueryResults result={queryResult} />}

        {/* Empty State */}
        {!queryResult && !error && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Play className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('db.executeHint')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DBQueryConsole;
