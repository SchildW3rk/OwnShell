/**
 * Import Database Modal
 *
 * Modal for configuring database import options.
 * Supports clearing/truncating database before import.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, cn } from '@ownshell/ui';
import { Upload, Loader2, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';

export type ClearMode = 'none' | 'truncate' | 'drop';

export interface ImportDatabaseOptions {
  clearMode: ClearMode;
}

interface ImportDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (options: ImportDatabaseOptions) => void;
  isImporting: boolean;
  progress?: {
    percentage?: number;
    stage?: 'preparing' | 'exporting' | 'importing' | 'completed' | 'error';
  } | null;
  databaseName?: string;
}

const DEFAULT_OPTIONS: ImportDatabaseOptions = {
  clearMode: 'none',
};

export const ImportDatabaseModal: React.FC<ImportDatabaseModalProps> = ({
  isOpen,
  onClose,
  onImport,
  isImporting,
  progress,
  databaseName,
}) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ImportDatabaseOptions>(DEFAULT_OPTIONS);

  const handleImport = () => {
    if (isImporting) return;
    onImport(options);
  };

  const isDestructive = options.clearMode !== 'none';
  const progressPercentage =
    typeof progress?.percentage === 'number'
      ? Math.min(100, Math.max(0, progress.percentage))
      : undefined;
  const progressLabel =
    progress?.stage === 'preparing'
      ? options.clearMode === 'drop'
        ? t('db.import.droppingTables', 'Dropping tables...')
        : options.clearMode === 'truncate'
          ? t('db.import.clearingData', 'Clearing data...')
          : t('db.import.preparing', 'Preparing import...')
      : t('db.import.inProgress', 'Importing dump...');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('db.import.title', 'Import Database')}
      closeOnBackdrop={!isImporting}
      showCloseButton={!isImporting}
    >
      <div className="space-y-6">
        {/* Database Info */}
        {databaseName && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Upload className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t('db.import.importing', 'Importing into')}:{' '}
              <span className="font-medium text-foreground">{databaseName}</span>
            </span>
          </div>
        )}

        {/* Clear Mode Selection */}
        <div className="space-y-3">
          <div className="text-sm font-medium">{t('db.import.beforeImport', 'Before Import')}</div>
          <div className="space-y-2">
            {/* No Clear */}
            <ClearModeOption
              selected={options.clearMode === 'none'}
              onClick={() => setOptions({ clearMode: 'none' })}
              disabled={isImporting}
              icon={<Upload className="w-5 h-5" />}
              label={t('db.import.keepData', 'Keep existing data')}
              description={t(
                'db.import.keepDataDesc',
                'Import without clearing. May cause duplicates or conflicts.'
              )}
            />

            {/* Truncate */}
            <ClearModeOption
              selected={options.clearMode === 'truncate'}
              onClick={() => setOptions({ clearMode: 'truncate' })}
              disabled={isImporting}
              icon={<Trash2 className="w-5 h-5 text-warning" />}
              label={t('db.import.truncate', 'Clear all data (TRUNCATE)')}
              description={t(
                'db.import.truncateDesc',
                'Delete all data but keep table structures. Fast and safe.'
              )}
              warning
            />

            {/* Drop & Recreate */}
            <ClearModeOption
              selected={options.clearMode === 'drop'}
              onClick={() => setOptions({ clearMode: 'drop' })}
              disabled={isImporting}
              icon={<RefreshCw className="w-5 h-5 text-destructive" />}
              label={t('db.import.drop', 'Drop & recreate tables')}
              description={t(
                'db.import.dropDesc',
                'Delete all tables and recreate from dump. Most thorough but destructive.'
              )}
              danger
            />
          </div>
        </div>

        {/* Warning for destructive options */}
        {isDestructive && (
          <div
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border',
              options.clearMode === 'drop'
                ? 'bg-destructive/10 border-destructive/30'
                : 'bg-warning/10 border-warning/30'
            )}
          >
            <AlertTriangle
              className={cn(
                'w-5 h-5 flex-shrink-0 mt-0.5',
                options.clearMode === 'drop' ? 'text-destructive' : 'text-warning'
              )}
            />
            <div className="text-sm">
              <div className="font-medium">
                {options.clearMode === 'truncate'
                  ? t('db.import.truncateWarningTitle', 'All existing data will be deleted')
                  : t('db.import.dropWarningTitle', 'All tables will be dropped and recreated')}
              </div>
              <div className="text-muted-foreground mt-1">
                {options.clearMode === 'truncate'
                  ? t(
                      'db.import.truncateWarningDesc',
                      'This will delete all rows from all tables. Table structures remain intact.'
                    )
                  : t(
                      'db.import.dropWarningDesc',
                      'This will delete all tables including their structure. Make sure your dump file contains CREATE TABLE statements.'
                    )}
              </div>
            </div>
          </div>
        )}

        {isImporting && (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="font-medium">{progressLabel}</span>
              {progressPercentage !== undefined && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {progressPercentage}%
                </span>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  'h-full rounded-full bg-primary transition-all duration-300',
                  progressPercentage === undefined && 'w-1/3 animate-pulse'
                )}
                style={
                  progressPercentage !== undefined
                    ? { width: `${progressPercentage}%` }
                    : undefined
                }
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isImporting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting}
            variant={isDestructive ? 'danger' : 'primary'}
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('db.import.importing', 'Importing...')}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {isDestructive
                  ? t('db.import.clearAndImport', 'Clear & Import')
                  : t('db.import.import', 'Import')}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/** Clear mode option component */
const ClearModeOption: React.FC<{
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  description: string;
  warning?: boolean;
  danger?: boolean;
}> = ({ selected, onClick, disabled = false, icon, label, description, warning, danger }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'flex items-start gap-3 w-full p-3 rounded-lg border text-left transition-colors',
      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      selected
        ? danger
          ? 'border-destructive bg-destructive/5'
          : warning
            ? 'border-warning bg-warning/5'
            : 'border-primary bg-primary/5'
        : 'border-border hover:border-muted-foreground/50'
    )}
  >
    <div className="flex-shrink-0 mt-0.5">{icon}</div>
    <div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
    </div>
    <div
      className={cn(
        'w-4 h-4 ml-auto mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
        selected
          ? danger
            ? 'border-destructive'
            : warning
              ? 'border-warning'
              : 'border-primary'
          : 'border-muted-foreground/50'
      )}
    >
      {selected && (
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            danger ? 'bg-destructive' : warning ? 'bg-warning' : 'bg-primary'
          )}
        />
      )}
    </div>
  </button>
);

export default ImportDatabaseModal;
