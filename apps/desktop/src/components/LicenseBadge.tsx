/**
 * Honor-model license reminder in the app header. Never blocks anything:
 * a small badge that opens a dialog explaining the terms.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal } from '@ownshell/ui';
import { useLicenseStore } from '../stores/useLicenseStore';
import { licenseBadgeState } from '../../electron/license/types';

const PRICING_URL = 'https://ownshell.app/#pricing';

export const LicenseBadge: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { licenseInfo, isLoading, error, activate, setPersonalUse, clearError } = useLicenseStore();
  const [open, setOpen] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');

  if (!licenseInfo) return null;
  const badge = licenseBadgeState(
    Date.now(),
    licenseInfo.firstLaunchAt,
    licenseInfo.personalConfirmedAt,
    licenseInfo.license,
    licenseInfo.buildReleasedAt
  );
  if (!badge) return null;

  const label =
    badge.kind === 'evaluation'
      ? t('license.badge.evaluation', { count: badge.daysLeft })
      : badge.kind === 'uncovered'
        ? t('license.badge.uncovered')
        : t('license.badge.personal');

  const close = () => {
    setOpen(false);
    setShowKeyInput(false);
    clearError();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-drag rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {label}
      </button>

      <Modal isOpen={open} onClose={close} title={t('license.dialog.title')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {badge.kind === 'uncovered' && licenseInfo.license
              ? t('license.dialog.uncoveredBody', {
                  date: new Date(licenseInfo.license.updatesUntil).toLocaleDateString(
                    i18n.language
                  ),
                })
              : t('license.dialog.body')}
          </p>

          {showKeyInput && (
            <div className="space-y-2">
              <Input
                label={t('license.licenseKey')}
                value={licenseKey}
                onChange={(e) => {
                  setLicenseKey(e.target.value);
                  clearError();
                }}
                placeholder={t('license.keyPlaceholder')}
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {showKeyInput ? (
              <Button
                variant="primary"
                isLoading={isLoading}
                disabled={!licenseKey.trim()}
                onClick={async () => {
                  if (await activate(licenseKey.trim())) {
                    setLicenseKey('');
                    close();
                  }
                }}
              >
                {t('license.activate')}
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  onClick={async () => {
                    await setPersonalUse(true);
                    close();
                  }}
                >
                  {t('license.dialog.confirmPersonal')}
                </Button>
                <Button variant="secondary" onClick={() => window.open(PRICING_URL, '_blank')}>
                  {badge.kind === 'uncovered' ? t('license.renewLicense') : t('license.buyLicense')}
                </Button>
                <Button variant="ghost" onClick={() => setShowKeyInput(true)}>
                  {t('license.enterKey')}
                </Button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};
