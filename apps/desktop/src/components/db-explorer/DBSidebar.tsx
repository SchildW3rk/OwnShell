/**
 * Database Explorer Sidebar
 *
 * Lists tables and views with search functionality.
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, Eye, Search, RefreshCw, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface TableInfo {
  name: string;
  schema?: string;
  rowCount?: number;
  type: 'table' | 'view' | 'materialized_view';
  comment?: string;
}

interface DBSidebarProps {
  tables: TableInfo[];
  selectedTable: string | null;
  selectedSchema?: string;
  selectedTableRowCount?: number;
  onSelectTable: (table: string, schema?: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

/**
 * Group tables by schema
 */
function groupBySchema(tables: TableInfo[]): Record<string, TableInfo[]> {
  const groups: Record<string, TableInfo[]> = {};

  for (const table of tables) {
    const schema = table.schema || 'default';
    if (!groups[schema]) {
      groups[schema] = [];
    }
    groups[schema].push(table);
  }

  return groups;
}

export const DBSidebar: React.FC<DBSidebarProps> = ({
  tables,
  selectedTable,
  selectedSchema,
  selectedTableRowCount,
  onSelectTable,
  isLoading,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
    new Set(['public', 'default'])
  );

  // Filter tables by search
  const filteredTables = useMemo(() => {
    if (!search) return tables;
    const lowerSearch = search.toLowerCase();
    return tables.filter(
      (t) =>
        t.name.toLowerCase().includes(lowerSearch) ||
        t.schema?.toLowerCase().includes(lowerSearch) ||
        t.comment?.toLowerCase().includes(lowerSearch)
    );
  }, [tables, search]);

  // Group by schema
  const groupedTables = useMemo(() => groupBySchema(filteredTables), [filteredTables]);
  const schemas = Object.keys(groupedTables).sort();

  const toggleSchema = (schema: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schema)) {
        next.delete(schema);
      } else {
        next.add(schema);
      }
      return next;
    });
  };

  const tableCount = tables.filter((t) => t.type === 'table').length;
  const viewCount = tables.filter(
    (t) => t.type === 'view' || t.type === 'materialized_view'
  ).length;

  return (
    <div className="flex min-h-0 w-56 min-w-[11rem] max-w-[42%] shrink-0 flex-col border-r border-border bg-surface/30">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-sm font-medium text-foreground">{t('db.sidebar.tables')}</span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            ({t('db.sidebar.counts', { tables: tableCount, views: viewCount })})
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          title={t('db.sidebar.refresh')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('db.sidebar.filter')}
            className="w-full pl-7 pr-2 py-1.5 text-sm bg-secondary/50 border border-border rounded focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Table List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : schemas.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {search ? t('db.sidebar.noMatch') : t('db.sidebar.noTables')}
          </div>
        ) : (
          <div className="py-1">
            {schemas.map((schema) => {
              const schemaTables = groupedTables[schema];
              const isExpanded = expandedSchemas.has(schema);
              const hasSelection = schemaTables.some(
                (t) =>
                  t.name === selectedTable &&
                  (t.schema || 'default') === (selectedSchema || 'default')
              );

              return (
                <div key={schema}>
                  {/* Schema Header (only show if multiple schemas) */}
                  {schemas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleSchema(schema)}
                      className={`w-full flex items-center gap-1 px-2 py-1 text-xs font-medium hover:bg-secondary/50 cursor-pointer ${
                        hasSelection ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      {schema}
                      <span className="ml-auto text-muted-foreground">{schemaTables.length}</span>
                    </button>
                  )}

                  {/* Tables in Schema */}
                  {(isExpanded || schemas.length === 1) && (
                    <div className={schemas.length > 1 ? 'ml-2' : ''}>
                      {schemaTables.map((table) => {
                        const isSelected =
                          table.name === selectedTable &&
                          (table.schema || 'default') === (selectedSchema || 'default');
                        const isView = table.type === 'view' || table.type === 'materialized_view';
                        const displayRowCount =
                          isSelected && selectedTableRowCount !== undefined
                            ? selectedTableRowCount
                            : table.rowCount;

                        return (
                          <button
                            type="button"
                            key={`${table.schema || 'default'}.${table.name}`}
                            onClick={() => onSelectTable(table.name, table.schema)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-primary/20 text-primary'
                                : 'text-foreground hover:bg-secondary/50'
                            }`}
                          >
                            {isView ? (
                              <Eye className="w-3.5 h-3.5 flex-shrink-0 text-purple-400" />
                            ) : (
                              <Table className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate flex-1 text-left">{table.name}</span>
                            {displayRowCount !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                {displayRowCount.toLocaleString()}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DBSidebar;
