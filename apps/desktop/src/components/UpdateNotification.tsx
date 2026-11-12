/**
 * Update Notification Component
 *
 * Shows a banner when an update is available/downloaded
 * Allows user to see what's new and install the update
 */

import React, { useEffect, useState } from 'react';
import { X, Download, RefreshCw, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { WhatsNewModal } from './changelog/WhatsNewModal';
import { useUpdaterState } from '../hooks/useUpdaterState';
import type { UpdateStatus } from '../../electron/preload/updates';
import type { UpdateLicenseCoverage } from '../../electron/license/types';


interface UpdateNotificationProps {
  suppress?: boolean;
}

/** Status icon with colored background circle */
function StatusIcon({ status }: { status: UpdateStatus }): React.ReactElement {
  if (status === 'ready') {
    return (
      <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
        <CheckCircle className="w-4 h-4 text-success" />
      </div>
    );
  }

  if (status === 'downloading') {
    return (
      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
        <Download className="w-4 h-4 text-primary animate-bounce" />
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
      <Sparkles className="w-4 h-4 text-primary" />
    </div>
  );
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({ suppress = false }) => {
  const { t } = useTranslation();
  const { status, setStatus, updateInfo, progress, error, setError } = useUpdaterState();
  const [dismissed, setDismissed] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // Re-show the banner whenever there is something new to report.
  useEffect(() => {
    setDismissed(false);
  }, [status, updateInfo?.version, error]);

  const handleInstall = () => {
    window.electronAPI.updater.installUpdate();
  };

  const handleDownload = async () => {
    setStatus('downloading');
    setError(null);
    try {
      await window.electronAPI.updater.downloadUpdate();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  const handleShowWhatsNew = () => {
    setShowWhatsNew(true);
  };

  // Don't show anything if dismissed or no update
  if (suppress || dismissed || status === 'idle' || status === 'checking') {
    return (
      <>
        {/* WhatsNewModal */}
        {showWhatsNew && updateInfo && (
          <WhatsNewModal
            isOpen={showWhatsNew}
            onClose={() => setShowWhatsNew(false)}
            version={updateInfo.version}
          />
        )}
      </>
    );
  }

  // Error state - show error banner
  if (status === 'error') {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-background border border-destructive rounded-lg shadow-lg p-4 max-w-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {t('update.error', 'Update-Fehler')}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {error || 'Unbekannter Fehler'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Update Banner */}
      <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-background border border-border rounded-lg shadow-lg p-4 max-w-sm">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <StatusIcon status={status} />
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {status === 'ready' && t('update.ready', 'Update bereit!')}
                  {status === 'downloading' && t('update.downloading', 'Wird heruntergeladen...')}
                  {status === 'available' && t('update.available', 'Update verfügbar')}
                </h4>
                {updateInfo && (
                  <p className="text-xs text-muted-foreground">Version {updateInfo.version}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <UpdateCoverageNotice coverage={updateInfo?.licenseCoverage} className="mb-3" />

          {/* Download Progress */}
          {status === 'downloading' && progress && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{Math.round(progress.percent)}%</span>
                <span>
                  {(progress.transferred / 1024 / 1024).toFixed(1)} /{' '}
                  {(progress.total / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {updateInfo && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleShowWhatsNew}
                className="flex-1 text-xs"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                {t('update.whatsNew', 'Was ist neu?')}
              </Button>
            )}
            {status === 'ready' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleInstall}
                className="flex-1 text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {t('update.installNow', 'Jetzt installieren')}
              </Button>
            )}
            {status === 'available' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleDownload}
                className="flex-1 text-xs"
              >
                <Download className="w-3 h-3 mr-1" />
                {t('update.download', 'Herunterladen')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* What's New Modal */}
      {showWhatsNew && updateInfo && (
        <WhatsNewModal
          version={updateInfo.version}
          isOpen={showWhatsNew}
          onClose={() => setShowWhatsNew(false)}
        />
      )}
    </>
  );
};

export default UpdateNotification;

/** Honor notice shown wherever an update can be installed; renders nothing when covered. */
export const UpdateCoverageNotice: React.FC<{
  coverage: UpdateLicenseCoverage | undefined;
  className?: string;
}> = ({ coverage, className }) => {
  const { t } = useTranslation();
  if (coverage !== 'uncovered' && coverage !== 'unknown') return null;
  return (
    <p
      className={`rounded border border-warning/30 bg-warning/10 p-2 text-xs text-foreground ${className ?? ''}`}
    >
      {t(coverage === 'uncovered' ? 'update.notCoveredByLicense' : 'update.coverageUnknown')}
    </p>
  );
};
