/**
 * Database Data Grid
 *
 * Displays table data with pagination and inline editing.
 */

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Loader2,
  Edit2,
  Check,
  X,
  Trash2,
} from 'lucide-react';
import { Button, ConfirmDialog } from '@ownshell/ui';
import { useUpdateRow, useDeleteRow } from '../../hooks/db-explorer';
import { useTranslation } from 'react-i18next';

interface TableSchema {
  name: string;
  schema?: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    defaultValue?: string;
  }>;
  primaryKey: string[];
}

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

interface DBDataGridProps {
  connectionId: string | null;
  tableName: string | null;
  schema?: string;
  data: QueryResult | undefined;
  tableSchema: TableSchema | null | undefined;
  isLoading: boolean;
  page: number;
  pageSize: number;
  totalRows: number;
  readOnly: boolean;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

/**
 * Format cell value for display
 */
function formatCellValue(value: unknown): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Get cell class based on value type
 */
function getCellClass(value: unknown): string {
  if (value === null) return 'text-muted-foreground italic';
  if (typeof value === 'number') return 'text-primary font-mono';
  if (typeof value === 'boolean') return 'text-purple-400';
  if (typeof value === 'object') return 'text-accent font-mono text-xs';
  return '';
}

export const DBDataGrid: React.FC<DBDataGridProps> = ({
  connectionId,
  tableName,
  schema,
  data,
  tableSchema,
  isLoading,
  page,
  pageSize,
  totalRows,
  readOnly,
  onPageChange,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    column: string;
    value: string;
  } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<Record<string, unknown> | null>(null);

  const updateRowMutation = useUpdateRow(connectionId, tableName);
  const deleteRowMutation = useDeleteRow(connectionId, tableName);

  // Get primary key columns
  const primaryKeyColumns = useMemo(() => {
    return tableSchema?.primaryKey || [];
  }, [tableSchema]);

  // Calculate pagination
  const totalPages = Math.ceil(totalRows / pageSize);
  const startRow = page * pageSize + 1;
  const endRow = Math.min((page + 1) * pageSize, totalRows);

  // Get primary key value for a row
  const getPrimaryKey = (row: Record<string, unknown>): Record<string, unknown> => {
    const pk: Record<string, unknown> = {};
    for (const col of primaryKeyColumns) {
      pk[col] = row[col];
    }
    return pk;
  };

  // Handle cell edit
  const handleEditStart = (rowIndex: number, column: string, value: unknown) => {
    if (readOnly) return;

    setEditingCell({
      rowIndex,
      column,
      value: formatCellValue(value),
    });
  };

  const handleEditCancel = () => {
    setEditingCell(null);
  };

  const handleEditSave = async (row: Record<string, unknown>) => {
    if (!editingCell || !connectionId || !tableName) return;

    const pk = getPrimaryKey(row);
    const changes = { [editingCell.column]: editingCell.value };

    try {
      await updateRowMutation.mutateAsync({
        primaryKey: pk,
        changes,
        schema,
      });
      setEditingCell(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = (row: Record<string, unknown>) => {
    setRowToDelete(row);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!connectionId || !tableName || !rowToDelete) return;

    const pk = getPrimaryKey(rowToDelete);

    try {
      await deleteRowMutation.mutateAsync({
        primaryKey: pk,
        schema,
      });
      setShowDeleteDialog(false);
      setRowToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  const cancelDelete = () => {
    setShowDeleteDialog(false);
    setRowToDelete(null);
  };

  const columns = data?.columns || [];
  const rows = data?.rows || [];

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No data found
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface z-10">
              <tr>
                {/* Actions column */}
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground border-b border-border w-16">
                  #
                </th>
                {columns.map((col) => {
                  const isPK = primaryKeyColumns.includes(col);
                  return (
                    <th
                      key={col}
                      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground border-b border-border whitespace-nowrap"
                    >
                      {isPK && <span className="text-accent mr-1">*</span>}
                      {col}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="group hover:bg-surface/50 border-b border-border">
                  {/* Row number + actions */}
                  <td className="px-2 py-1 text-muted-foreground text-xs">
                    <div className="flex items-center gap-1">
                      <span>{startRow + rowIndex}</span>
                      {primaryKeyColumns.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          disabled={readOnly}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-destructive cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                          title={
                            readOnly
                              ? t('db.readOnlyBlocked', 'Read-only connection blocks write actions')
                              : t('db.deleteRow', 'Delete row')
                          }
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                  {columns.map((col) => {
                    const value = row[col];
                    const isEditing =
                      editingCell?.rowIndex === rowIndex && editingCell?.column === col;
                    const isPK = primaryKeyColumns.includes(col);

                    return (
                      <td
                        key={col}
                        className={`px-3 py-1 max-w-xs truncate ${getCellClass(value)}`}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingCell.value}
                              onChange={(e) =>
                                setEditingCell((prev) =>
                                  prev ? { ...prev, value: e.target.value } : null
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave(row);
                                if (e.key === 'Escape') handleEditCancel();
                              }}
                              className="w-full px-1 py-0.5 bg-secondary border border-primary rounded text-sm focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleEditSave(row)}
                              className="p-0.5 rounded hover:bg-success/20 text-success cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={handleEditCancel}
                              className="p-0.5 rounded hover:bg-destructive/20 text-destructive cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`flex items-center gap-1 group ${
                              !readOnly && !isPK ? 'cursor-pointer' : ''
                            }`}
                            onDoubleClick={() => {
                              if (!isPK && !readOnly) handleEditStart(rowIndex, col, value);
                            }}
                            title={
                              readOnly
                                ? t('db.readOnlyBlocked', 'Read-only connection blocks write actions')
                                : isPK
                                  ? 'Primary key (read-only)'
                                  : 'Double-click to edit'
                            }
                          >
                            <span className="truncate">{formatCellValue(value)}</span>
                            {!isPK && !readOnly && (
                              <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 flex-shrink-0" />
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-surface/50">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            {totalRows > 0
              ? `Showing ${startRow.toLocaleString()}-${endRow.toLocaleString()} of ${totalRows.toLocaleString()}`
              : 'No rows'}
          </span>
          {data?.executionTime && (
            <span className="text-xs text-muted-foreground">({data.executionTime}ms)</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onPageChange(0)}
              disabled={page === 0 || isLoading}
            >
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0 || isLoading}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <span className="px-3 text-sm text-foreground">
              Page {page + 1} of {Math.max(1, totalPages)}
            </span>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1 || isLoading}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onPageChange(totalPages - 1)}
              disabled={page >= totalPages - 1 || isLoading}
            >
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title={t('db.deleteRow', 'Zeile löschen')}
        message={t(
          'db.deleteRowConfirm',
          'Möchten Sie diese Zeile wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.'
        )}
        confirmLabel={t('common.delete', 'Löschen')}
        cancelLabel={t('common.cancel', 'Abbrechen')}
        variant="danger"
        isLoading={deleteRowMutation.isPending}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
};

export default DBDataGrid;
