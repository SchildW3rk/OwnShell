/**
 * Settings View (v1.18.0)
 *
 * Inline settings view with tabbed navigation.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Tabs } from '@ownshell/ui';
import { useHostStore } from '../stores/useHostStore';
import { useSnippetStore } from '../stores/useSnippetStore';
import { useQueryClient } from '@tanstack/react-query';
import { getCurrentLanguage } from '../i18n/config';
import { useUpdaterState } from '../hooks/useUpdaterState';
import { Database, Info, Settings as SettingsIcon, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { AboutTab } from './settings-view/AboutTab';
import { DataTab } from './settings-view/DataTab';
import { GeneralTab } from './settings-view/GeneralTab';
import { WhatsNewModal } from '../components/changelog/WhatsNewModal';
import type { BackupMode, LanguageCode, SettingsTab } from './settings-view/types';

interface SettingsViewProps {
  onClose?: () => void;
}

const QUERY_HISTORY_ENABLED_SETTING = 'dbExplorer.queryHistory.enabled';

export const SettingsView: React.FC<SettingsViewProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [currentLang, setCurrentLang] = useState<LanguageCode>(getCurrentLanguage());
  const [autoLockTimeout, setAutoLockTimeout] = useState('5');

  const [backupMode, setBackupMode] = useState<BackupMode>('none');
  const [backupPassword, setBackupPassword] = useState('');
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [backupSuccess, setBackupSuccess] = useState('');
  const [queryHistoryEnabled, setQueryHistoryEnabled] = useState(true);

  const [appVersion, setAppVersion] = useState<string>('...');
  const {
    status: updateStatus,
    setStatus: setUpdateStatus,
    updateInfo,
    progress,
    error: updateError,
    setError: setUpdateError,
    autoUpdateEnabled,
    setAutoUpdateEnabled,
  } = useUpdaterState();
  const availableVersion = updateInfo?.version ?? null;
  const downloadProgress =
    updateStatus === 'ready' ? 100 : progress ? Math.round(progress.percent) : 0;
  const [showUpdateDetails, setShowUpdateDetails] = useState(false);

  useEffect(() => {
    window.electronAPI.updater
      .getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion('?'));

    window.electronAPI.settings
      .get(QUERY_HISTORY_ENABLED_SETTING)
      .then((value) => setQueryHistoryEnabled(value !== 'false'))
      .catch(() => setQueryHistoryEnabled(true));

    window.electronAPI.crypto
      .getAutoLockTimeout()
      .then((minutes) => setAutoLockTimeout(String(minutes)))
      .catch(() => {
        // Keep the default shown; the main process still enforces its stored value.
      });
  }, []);

  const handleSaveAutoLock = async () => {
    const minutes = Number(autoLockTimeout);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      toast.error(t('settings.autoLockInvalid'));
      return;
    }
    try {
      const result = await window.electronAPI.crypto.setAutoLockTimeout(minutes);
      if (result.success) {
        toast.success(t('settings.saved'));
      } else {
        toast.error(result.error || t('settings.autoLockSaveFailed'));
      }
    } catch {
      toast.error(t('settings.autoLockSaveFailed'));
    }
  };

  const handleToggleAutoUpdate = async (enabled: boolean) => {
    try {
      const result = await window.electronAPI.updater.setAutoUpdate(enabled);
      if (result.success) {
        setAutoUpdateEnabled(enabled);
        toast.success(t('settings.saved'));
      } else {
        toast.error(result.error || t('settings.saveFailed'));
      }
    } catch {
      toast.error(t('settings.saveFailed'));
    }
  };

  const handleCheckForUpdates = async () => {
    setUpdateStatus('checking');
    setUpdateError(null);
    try {
      await window.electronAPI.updater.checkForUpdates();
    } catch (error) {
      setUpdateStatus('error');
      setUpdateError(error instanceof Error ? error.message : 'Check failed');
    }
  };

  const handleDownloadUpdate = async () => {
    try {
      await window.electronAPI.updater.downloadUpdate();
    } catch (error) {
      setUpdateStatus('error');
      setUpdateError(error instanceof Error ? error.message : 'Download failed');
    }
  };

  const handleToggleQueryHistory = async (enabled: boolean) => {
    try {
      await window.electronAPI.settings.set(
        QUERY_HISTORY_ENABLED_SETTING,
        enabled ? 'true' : 'false'
      );
      setQueryHistoryEnabled(enabled);
      toast.success(t('settings.saved'));
    } catch {
      toast.error(t('settings.saveFailed'));
    }
  };

  const resetBackupState = () => {
    setBackupMode('none');
    setBackupPassword('');
    setBackupPasswordConfirm('');
    setBackupError('');
    setBackupSuccess('');
  };

  const handleExportBackup = async () => {
    if (backupPassword.length < 4) {
      setBackupError(t('backup.passwordLength'));
      return;
    }
    if (backupPassword !== backupPasswordConfirm) {
      setBackupError(t('backup.passwordMismatch'));
      return;
    }

    setBackupLoading(true);
    setBackupError('');
    setBackupSuccess('');

    try {
      const result = await window.electronAPI.backup.export(backupPassword);
      if (result.success) {
        setBackupSuccess(t('backup.savedTo', { path: result.filePath }));
        setBackupMode('none');
        setBackupPassword('');
        setBackupPasswordConfirm('');
      } else {
        setBackupError(result.error || t('backup.exportFailed'));
      }
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : t('backup.exportFailed'));
    } finally {
      setBackupLoading(false);
    }
  };

  const handleImportBackup = async () => {
    if (!backupPassword) {
      setBackupError(t('backup.passwordRequired'));
      return;
    }

    if (!confirm(t('backup.importWarning'))) return;

    setBackupLoading(true);
    setBackupError('');
    setBackupSuccess('');

    try {
      const result = await window.electronAPI.backup.import(backupPassword);
      if (result.success && result.counts) {
        // Backups now also restore vault, DB, project and API data, so refetch every query.
        await Promise.all([
          useHostStore.getState().loadHosts(),
          useSnippetStore.getState().loadSnippets(),
          queryClient.invalidateQueries(),
        ]);

        setBackupSuccess(t('backup.importSuccess', { ...result.counts }));
        setBackupMode('none');
        setBackupPassword('');
      } else {
        setBackupError(result.error || t('backup.importFailed'));
      }
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : t('backup.importFailed'));
    } finally {
      setBackupLoading(false);
    }
  };

  const tabs = [
    { id: 'general', label: t('settings.general'), icon: <SettingsIcon className="w-4 h-4" /> },
    { id: 'data', label: t('settings.dataStorage'), icon: <Database className="w-4 h-4" /> },
    { id: 'about', label: t('settings.about'), icon: <Info className="w-4 h-4" /> },
  ];

  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader
        icon={SettingsIcon}
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={
          onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label={t('settings.close')}
            >
              <X className="w-5 h-5" />
            </button>
          ) : undefined
        }
        tabs={
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={(tabId) => setActiveTab(tabId as SettingsTab)}
          />
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'general' && (
          <GeneralTab
            currentLang={currentLang}
            autoLockTimeout={autoLockTimeout}
            appVersion={appVersion}
            autoUpdateEnabled={autoUpdateEnabled}
            updateStatus={updateStatus}
            availableVersion={availableVersion}
            downloadProgress={downloadProgress}
            updateError={updateError}
            onLanguageChange={setCurrentLang}
            onAutoLockTimeoutChange={setAutoLockTimeout}
            onToggleAutoUpdate={handleToggleAutoUpdate}
            onCheckForUpdates={handleCheckForUpdates}
            onDownloadUpdate={handleDownloadUpdate}
            onInstallUpdate={() => window.electronAPI.updater.installUpdate()}
            onShowUpdateDetails={() => setShowUpdateDetails(true)}
            onSave={handleSaveAutoLock}
          />
        )}

        {activeTab === 'data' && (
          <DataTab
            backupMode={backupMode}
            backupPassword={backupPassword}
            backupPasswordConfirm={backupPasswordConfirm}
            backupLoading={backupLoading}
            backupError={backupError}
            backupSuccess={backupSuccess}
            queryHistoryEnabled={queryHistoryEnabled}
            onBackupModeChange={setBackupMode}
            onBackupPasswordChange={setBackupPassword}
            onBackupPasswordConfirmChange={setBackupPasswordConfirm}
            onResetBackupState={resetBackupState}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onToggleQueryHistory={handleToggleQueryHistory}
          />
        )}

        {activeTab === 'about' && <AboutTab appVersion={appVersion} />}
      </div>

      {showUpdateDetails && availableVersion && (
        <WhatsNewModal
          version={availableVersion}
          isOpen={showUpdateDetails}
          onClose={() => setShowUpdateDetails(false)}
        />
      )}
    </div>
  );
};
