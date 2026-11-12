import React from 'react';
import { AlertCircle, CheckCircle, Download, History, Loader2, Upload } from 'lucide-react';
import { Button, Input, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import type { BackupMode } from './types';

const BACKUP_INCLUDES = [
  'settings.backupIncludesHosts',
  'settings.backupIncludesKeys',
  'settings.backupIncludesTunnels',
  'settings.backupIncludesSnippets',
  'settings.backupIncludesS3',
  'settings.backupIncludesVault',
  'settings.backupIncludesDatabases',
  'settings.backupIncludesProjects',
  'settings.backupIncludesApi',
] as const;

interface DataTabProps {
  backupMode: BackupMode;
  backupPassword: string;
  backupPasswordConfirm: string;
  backupLoading: boolean;
  backupError: string;
  backupSuccess: string;
  queryHistoryEnabled: boolean;
  onBackupModeChange: (mode: BackupMode) => void;
  onBackupPasswordChange: (password: string) => void;
  onBackupPasswordConfirmChange: (password: string) => void;
  onResetBackupState: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onToggleQueryHistory: (enabled: boolean) => void;
}

export const DataTab: React.FC<DataTabProps> = ({
  backupMode,
  backupPassword,
  backupPasswordConfirm,
  backupLoading,
  backupError,
  backupSuccess,
  queryHistoryEnabled,
  onBackupModeChange,
  onBackupPasswordChange,
  onBackupPasswordConfirmChange,
  onResetBackupState,
  onExportBackup,
  onImportBackup,
  onToggleQueryHistory,
}) => {
  const { t } = useTranslation();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t('settings.dataStorage')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.backupDescription')}</p>
      </div>

      {backupSuccess && (
        <div className="flex items-center gap-2 p-3 bg-success/10 border border-success rounded text-sm text-success">
          <CheckCircle className="w-4 h-4" />
          <span>{backupSuccess}</span>
        </div>
      )}

      {backupError && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive rounded text-sm text-destructive">
          <AlertCircle className="w-4 h-4" />
          <span>{backupError}</span>
        </div>
      )}

      <div className="p-6 bg-secondary rounded border border-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center">
            <History className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{t('settings.queryHistory')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('settings.queryHistoryDescription')}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-border">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t('settings.storeQueryHistory')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('settings.storeQueryHistoryDescription')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggleQueryHistory(!queryHistoryEnabled)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
              queryHistoryEnabled ? 'bg-primary' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                queryHistoryEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </div>

      <div className="p-6 bg-secondary rounded border border-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{t('settings.exportBackup')}</h4>
            <p className="text-xs text-muted-foreground">{t('settings.exportDescription')}</p>
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{t('settings.backupIncludesTitle')}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {BACKUP_INCLUDES.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
          <p>{t('settings.backupExcludesMaster')}</p>
        </div>

        {backupMode === 'export' ? (
          <div className="space-y-4 pt-4 border-t border-border">
            <Input
              label={t('settings.backupPassword')}
              type="password"
              value={backupPassword}
              onChange={(e) => onBackupPasswordChange(e.target.value)}
              autoFocus
            />
            <Input
              label={t('settings.confirmPassword')}
              type="password"
              value={backupPasswordConfirm}
              onChange={(e) => onBackupPasswordConfirmChange(e.target.value)}
            />
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={onResetBackupState}
                disabled={backupLoading}
                className="flex-1"
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={onExportBackup}
                disabled={backupLoading}
                className="flex-1"
              >
                {backupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.export')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              onResetBackupState();
              onBackupModeChange('export');
            }}
            className="w-full"
          >
            <Download className="w-4 h-4 mr-2" />
            {t('settings.exportToFile')}
          </Button>
        )}
      </div>

      <div className="p-6 bg-secondary rounded border border-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-info/20 flex items-center justify-center">
            <Upload className="w-5 h-5 text-info" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{t('settings.importBackup')}</h4>
            <p className="text-xs text-muted-foreground">{t('settings.importDescription')}</p>
          </div>
        </div>

        {backupMode === 'import' ? (
          <div className="space-y-4 pt-4 border-t border-border">
            <Input
              label={t('settings.backupPassword')}
              type="password"
              value={backupPassword}
              onChange={(e) => onBackupPasswordChange(e.target.value)}
              autoFocus
            />
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              {t('settings.importOverwriteWarning')}
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={onResetBackupState}
                disabled={backupLoading}
                className="flex-1"
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={onImportBackup}
                disabled={backupLoading}
                className="flex-1"
              >
                {backupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.import')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              onResetBackupState();
              onBackupModeChange('import');
            }}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            {t('settings.importFromFile')}
          </Button>
        )}
      </div>
    </div>
  );
};
