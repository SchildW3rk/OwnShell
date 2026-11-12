/**
 * Create Table Dialog
 *
 * Visual table designer for PostgreSQL/MySQL.
 * Allows users to define table structure with columns, types, constraints.
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Modal, Button, Input } from '@ownshell/ui';
import { Table, Loader2, Plus, Trash2, Key } from 'lucide-react';

interface TableColumn {
  id: string;
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
  unique: boolean;
}

interface CreateTableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, columns: Omit<TableColumn, 'id'>[]) => void;
  isLoading?: boolean;
  dbType: 'postgres' | 'mysql';
}

// PostgreSQL data types
const POSTGRES_TYPES = [
  'VARCHAR',
  'TEXT',
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'DECIMAL',
  'NUMERIC',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'TIME',
  'JSON',
  'JSONB',
  'UUID',
  'BYTEA',
];

export const CreateTableDialog: React.FC<CreateTableDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  dbType: _dbType, // Reserved for future use (MySQL, etc.)
}) => {
  const { t } = useTranslation();

  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<TableColumn[]>([
    {
      id: '1',
      name: 'id',
      type: 'INTEGER',
      nullable: false,
      primaryKey: true,
      unique: false,
    },
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate table name
    const trimmedName = tableName.trim();
    if (!trimmedName) {
      toast.error(t('db.tableNameRequired'));
      return;
    }

    if (!isValidTableName(trimmedName)) {
      toast.error(
        t('db.invalidTableName')
      );
      return;
    }

    // Validate columns
    if (columns.length === 0) {
      toast.error(t('db.columnRequired'));
      return;
    }

    if (columns.some((col) => !col.name.trim())) {
      toast.error(t('db.columnNameRequired'));
      return;
    }

    // Convert columns to the format expected by backend (remove id)
    const columnsForBackend = columns.map(({ id, ...col }) => col);

    onConfirm(trimmedName, columnsForBackend);
  };

  const isValidTableName = (name: string): boolean => {
    if (!name || name.length === 0) return false;
    if (name.length > 63) return false;
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  };

  const handleClose = () => {
    setTableName('');
    setColumns([
      {
        id: '1',
        name: 'id',
        type: 'INTEGER',
        nullable: false,
        primaryKey: true,
        unique: false,
      },
    ]);
    onClose();
  };

  const addColumn = () => {
    setColumns([
      ...columns,
      {
        id: Date.now().toString(),
        name: '',
        type: 'VARCHAR',
        length: 255,
        nullable: true,
        primaryKey: false,
        unique: false,
      },
    ]);
  };

  const removeColumn = (id: string) => {
    if (columns.length === 1) return; // Keep at least one column
    setColumns(columns.filter((col) => col.id !== id));
  };

  const updateColumn = (id: string, field: keyof TableColumn, value: any) => {
    setColumns(
      columns.map((col) => {
        if (col.id === id) {
          const updated = { ...col, [field]: value };

          // If setting primaryKey, auto-set NOT NULL
          if (field === 'primaryKey' && value === true) {
            updated.nullable = false;
          }

          // Clear length/precision when changing type
          if (field === 'type') {
            updated.length = undefined;
            updated.precision = undefined;
            updated.scale = undefined;
            // Set default length for VARCHAR
            if (value === 'VARCHAR') {
              updated.length = 255;
            }
          }

          return updated;
        }
        return col;
      })
    );
  };

  const needsLength = (type: string) => ['VARCHAR', 'CHAR'].includes(type.toUpperCase());
  const needsPrecision = (type: string) => ['DECIMAL', 'NUMERIC'].includes(type.toUpperCase());

  const hasPrimaryKey = useMemo(() => columns.some((col) => col.primaryKey), [columns]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('db.createTable', 'Create Table')}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Table Name */}
        <div>
          <label htmlFor="table-name" className="block text-sm font-medium text-foreground mb-1">
            {t('db.tableName', 'Table Name')} *
          </label>
          <Input
            id="table-name"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="users"
            required
            autoFocus
          />
        </div>

        {/* Columns Grid */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-foreground">
              {t('db.columns', 'Columns')} *
            </label>
            <Button type="button" size="sm" variant="ghost" onClick={addColumn}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t('db.addColumn', 'Add Column')}
            </Button>
          </div>

          <div className="border border-border rounded overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-surface sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-12">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[150px]">
                    {t('db.columnName', 'Name')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[140px]">
                    {t('db.dataType', 'Type')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">
                    {t('db.length', 'Length')}
                  </th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground w-16">
                    {t('db.nullable', 'NULL')}
                  </th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground w-12">
                    PK
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[150px]">
                    {t('db.defaultValue', 'Default')}
                  </th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col, index) => (
                  <tr key={col.id} className="border-t border-border hover:bg-surface/50">
                    <td className="px-3 py-2 text-muted-foreground text-center">{index + 1}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) => updateColumn(col.id, 'name', e.target.value)}
                        placeholder="column_name"
                        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={col.type}
                        onChange={(e) => updateColumn(col.id, 'type', e.target.value)}
                        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer"
                      >
                        {POSTGRES_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {needsLength(col.type) && (
                        <input
                          type="number"
                          value={col.length || ''}
                          onChange={(e) =>
                            updateColumn(col.id, 'length', parseInt(e.target.value) || undefined)
                          }
                          placeholder="255"
                          className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                      )}
                      {needsPrecision(col.type) && (
                        <div className="flex gap-1">
                          <input
                            type="number"
                            value={col.precision || ''}
                            onChange={(e) =>
                              updateColumn(
                                col.id,
                                'precision',
                                parseInt(e.target.value) || undefined
                              )
                            }
                            placeholder="10"
                            className="flex-1 px-2 py-1.5 bg-background border border-border rounded text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                          />
                          <input
                            type="number"
                            value={col.scale || ''}
                            onChange={(e) =>
                              updateColumn(col.id, 'scale', parseInt(e.target.value) || undefined)
                            }
                            placeholder="2"
                            className="flex-1 px-2 py-1.5 bg-background border border-border rounded text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={col.nullable}
                        onChange={(e) => updateColumn(col.id, 'nullable', e.target.checked)}
                        disabled={col.primaryKey}
                        className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={col.primaryKey}
                        onChange={(e) => updateColumn(col.id, 'primaryKey', e.target.checked)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={col.defaultValue || ''}
                        onChange={(e) => updateColumn(col.id, 'defaultValue', e.target.value)}
                        placeholder="NULL, NOW(), ..."
                        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeColumn(col.id)}
                        disabled={columns.length === 1}
                        className="p-1 hover:bg-destructive/10 rounded text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('common.delete', 'Delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!hasPrimaryKey && (
            <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
              <Key className="w-3 h-3" />
              {t('db.noPrimaryKey', 'Warning: No primary key defined')}
            </p>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!tableName.trim() || columns.length === 0 || isLoading}
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isLoading ? (
              t('common.creating', 'Creating...')
            ) : (
              <>
                <Table className="w-4 h-4 mr-2" />
                {t('common.create', 'Create')}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
