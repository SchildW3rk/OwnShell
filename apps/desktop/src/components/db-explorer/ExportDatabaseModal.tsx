/**
 * Export Database Modal
 *
 * Modal for configuring database export options.
 * Supports PostgreSQL, MySQL, MongoDB dump options.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, cn } from '@ownshell/ui';
import { Download, Loader2, FileArchive, FileText } from 'lucide-react';

export interface ExportDatabaseOptions {
  compress: boolean;
  schemaOnly: boolean;
  dataOnly: boolean;
  clean: boolean;
  noOwner: boolean;
  create: boolean;
}

interface ExportDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportDatabaseOptions) => void;
  isExporting: boolean;
  databaseName?: string;
  databaseType?: string;
}

const DEFAULT_OPTIONS: ExportDatabaseOptions = {
  compress: true,
  schemaOnly: false,
  dataOnly: false,
  clean: true,
  noOwner: true,
  create: false,
};

export const ExportDatabaseModal: React.FC<ExportDatabaseModalProps> = ({
  isOpen,
  onClose,
  onExport,
  isExporting,
  databaseName,
  databaseType = 'postgres',
}) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ExportDatabaseOptions>(DEFAULT_OPTIONS);

  const handleExport = () => {
    onExport(options);
  };

  const toggleOption = (key: keyof ExportDatabaseOptions) => {
    setOptions((prev) => {
      const newOptions = { ...prev, [key]: !prev[key] };

      // Handle mutually exclusive options
      if (key === 'schemaOnly' && newOptions.schemaOnly) {
        newOptions.dataOnly = false;
      }
      if (key === 'dataOnly' && newOptions.dataOnly) {
        newOptions.schemaOnly = false;
      }

      return newOptions;
    });
  };

  const isPostgres = databaseType === 'postgres';
  const isMySQL = databaseType === 'mysql';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('db.export.title', 'Export Database')}>
      <div className="space-y-6">
        {/* Database Info */}
        {databaseName && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Download className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t('db.export.exporting', 'Exporting')}:{' '}
              <span className="font-medium text-foreground">{databaseName}</span>
            </span>
          </div>
        )}

        {/* Format Selection */}
        <div className="space-y-3">
          <div className="text-sm font-medium">{t('db.export.format', 'Format')}</div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOptions((prev) => ({ ...prev, compress: false }))}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                !options.compress
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/50'
              )}
            >
              <FileText className="w-5 h-5" />
              <div className="text-left">
                <div className="text-sm font-medium">SQL</div>
                <div className="text-xs text-muted-foreground">.sql</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setOptions((prev) => ({ ...prev, compress: true }))}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                options.compress
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/50'
              )}
            >
              <FileArchive className="w-5 h-5" />
              <div className="text-left">
                <div className="text-sm font-medium">{t('db.export.compressed', 'Compressed')}</div>
                <div className="text-xs text-muted-foreground">.sql.gz</div>
              </div>
            </button>
          </div>
        </div>

        {/* Content Options */}
        <div className="space-y-3">
          <div className="text-sm font-medium">{t('db.export.content', 'Content')}</div>
          <div className="space-y-2">
            <OptionCheckbox
              checked={!options.schemaOnly && !options.dataOnly}
              onChange={() =>
                setOptions((prev) => ({ ...prev, schemaOnly: false, dataOnly: false }))
              }
              label={t('db.export.schemaAndData', 'Schema & Data')}
              description={t(
                'db.export.schemaAndDataDesc',
                'Export complete database structure and data'
              )}
            />
            <OptionCheckbox
              checked={options.schemaOnly}
              onChange={() => toggleOption('schemaOnly')}
              label={t('db.export.schemaOnly', 'Schema Only')}
              description={t('db.export.schemaOnlyDesc', 'Export only table structures, no data')}
            />
            <OptionCheckbox
              checked={options.dataOnly}
              onChange={() => toggleOption('dataOnly')}
              label={t('db.export.dataOnly', 'Data Only')}
              description={t('db.export.dataOnlyDesc', 'Export only data, no CREATE statements')}
            />
          </div>
        </div>

        {/* PostgreSQL/MySQL Specific Options */}
        {(isPostgres || isMySQL) && (
          <div className="space-y-3">
            <div className="text-sm font-medium">{t('db.export.options', 'Options')}</div>
            <div className="space-y-2">
              <OptionCheckbox
                checked={options.clean}
                onChange={() => toggleOption('clean')}
                label={t('db.export.clean', 'Include DROP statements')}
                description={t(
                  'db.export.cleanDesc',
                  'Add DROP TABLE/VIEW before CREATE (--clean)'
                )}
              />
              <OptionCheckbox
                checked={options.noOwner}
                onChange={() => toggleOption('noOwner')}
                label={t('db.export.noOwner', 'Skip owner')}
                description={t(
                  'db.export.noOwnerDesc',
                  'Do not output ownership commands (--no-owner)'
                )}
              />
              {isPostgres && (
                <OptionCheckbox
                  checked={options.create}
                  onChange={() => toggleOption('create')}
                  label={t('db.export.create', 'Include CREATE DATABASE')}
                  description={t(
                    'db.export.createDesc',
                    'Add CREATE DATABASE statement (--create)'
                  )}
                />
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isExporting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('db.export.exporting', 'Exporting...')}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {t('db.export.export', 'Export')}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/** Checkbox option component */
const OptionCheckbox: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}> = ({ checked, onChange, label, description }) => (
  <button
    type="button"
    onClick={onChange}
    className={cn(
      'flex items-start gap-3 w-full p-3 rounded-lg border text-left transition-colors',
      checked ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'
    )}
  >
    <div
      className={cn(
        'w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0',
        checked ? 'bg-primary border-primary' : 'border-muted-foreground/50'
      )}
    >
      {checked && (
        <svg
          className="w-3 h-3 text-primary-foreground"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 3L4.5 8.5L2 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
    <div>
      <div className="text-sm font-medium">{label}</div>
      {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
    </div>
  </button>
);

export default ExportDatabaseModal;
