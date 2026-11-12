/**
 * Database Structure View
 *
 * Displays table schema information (columns, indexes, constraints).
 */

import React from 'react';
import { Key, Hash, Calendar, Type, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
  foreignKey?: {
    table: string;
    column: string;
    schema?: string;
  };
  comment?: string;
  maxLength?: number;
  autoIncrement?: boolean;
}

interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
  type?: string;
}

interface TableSchema {
  name: string;
  schema?: string;
  columns: ColumnSchema[];
  indexes: IndexInfo[];
  primaryKey: string[];
  rowCount?: number;
}

interface DBStructureViewProps {
  schema: TableSchema | null | undefined;
  isLoading: boolean;
}

export const DBStructureView: React.FC<DBStructureViewProps> = ({ schema, isLoading }) => {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        {t('db.schemaView.noSchema')}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      {/* Columns */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Type className="w-4 h-4" />
          {t('db.columns')} ({schema.columns.length})
        </h3>
        <div className="bg-surface/50 rounded-lg overflow-hidden border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('common.name')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('db.schemaView.type')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  {t('db.schemaView.nullable')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  {t('db.defaultValue')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('db.schemaView.info')}</th>
              </tr>
            </thead>
            <tbody>
              {schema.columns.map((col) => (
                <tr key={col.name} className="border-t border-border/50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {col.primaryKey && <Key className="w-3.5 h-3.5 text-accent" />}
                      <span
                        className={`font-mono ${col.primaryKey ? 'text-accent' : 'text-foreground'}`}
                      >
                        {col.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-primary text-xs">
                    {col.type}
                    {col.maxLength && <span className="text-muted-foreground">({col.maxLength})</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={col.nullable ? 'text-success' : 'text-destructive'}>
                      {col.nullable ? 'YES' : 'NO'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {col.defaultValue || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {col.autoIncrement && (
                        <span className="px-1.5 py-0.5 bg-purple-600/20 text-purple-400 rounded">
                          AUTO
                        </span>
                      )}
                      {col.foreignKey && (
                        <span className="px-1.5 py-0.5 bg-primary/20 text-primary rounded">
                          FK: {col.foreignKey.table}.{col.foreignKey.column}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indexes */}
      {schema.indexes.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Hash className="w-4 h-4" />
            {t('db.schemaView.indexes')} ({schema.indexes.length})
          </h3>
          <div className="bg-surface/50 rounded-lg overflow-hidden border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('common.name')}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t('db.columns')}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('db.schemaView.type')}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t('db.schemaView.unique')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {schema.indexes.map((idx) => (
                  <tr key={idx.name} className="border-t border-border/50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {idx.primary && <Key className="w-3.5 h-3.5 text-accent" />}
                        <span
                          className={`font-mono ${idx.primary ? 'text-accent' : 'text-foreground'}`}
                        >
                          {idx.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-primary">
                      {Array.isArray(idx.columns) ? idx.columns.join(', ') : idx.columns || '-'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{idx.type || 'btree'}</td>
                    <td className="px-3 py-2">
                      <span className={idx.unique ? 'text-success' : 'text-muted-foreground'}>
                        {idx.unique ? 'YES' : 'NO'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table Info */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          {t('db.schemaView.tableInfo')}
        </h3>
        <div className="bg-surface/50 rounded-lg p-4 border border-border">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('db.tableName')}</dt>
              <dd className="font-mono text-foreground">
                {schema.schema ? `${schema.schema}.${schema.name}` : schema.name}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('db.schemaView.estimatedRows')}</dt>
              <dd className="font-mono text-foreground">
                {schema.rowCount?.toLocaleString() || t('db.schemaView.unknown')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('db.schemaView.primaryKey')}</dt>
              <dd className="font-mono text-accent">
                {schema.primaryKey.length > 0 ? schema.primaryKey.join(', ') : t('common.none')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('db.columns')}</dt>
              <dd className="font-mono text-foreground">{schema.columns.length}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
};

export default DBStructureView;
