import React from 'react';
import { AlertCircle, BadgeCheck, Key, LogOut, ShoppingCart } from 'lucide-react';
import { Button, Input, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { isReleaseCovered, licenseBadgeState, type LicenseInfo } from '../../../electron/license/types';
import { useLicenseStore } from '../../stores/useLicenseStore';

const BUY_LICENSE_URL = 'https://ownshell.app/#pricing';

interface LicenseTabProps {
  licenseInfo: LicenseInfo | null;
  isLicenseLoading: boolean;
  isOnline: boolean;
  licenseKeyInput: string;
  licenseActivationError: string;
  onLicenseKeyInputChange: (key: string) => void;
  onLicenseActivationErrorChange: (error: string) => void;
  activate: (key: string) => Promise<boolean>;
  deactivate: () => Promise<{ success: boolean; requiresOnline?: boolean }>;
}

export const LicenseTab: React.FC<LicenseTabProps> = ({
  licenseInfo,
  isLicenseLoading,
  isOnline,
  licenseKeyInput,
  licenseActivationError,
  onLicenseKeyInputChange,
  onLicenseActivationErrorChange,
  activate,
  deactivate,
}) => {
  const { t, i18n } = useTranslation();
  const setPersonalUse = useLicenseStore((state) => state.setPersonalUse);
  const storeError = useLicenseStore((state) => state.error);
  const activationError = licenseActivationError || storeError;
  const cardClassName = 'rounded border border-border bg-secondary p-6';
  const license = licenseInfo?.license ?? null;
  const covered = isReleaseCovered(licenseInfo?.buildReleasedAt, license);
  const badge = licenseInfo
    ? licenseBadgeState(
        Date.now(),
        licenseInfo.firstLaunchAt,
        licenseInfo.personalConfirmedAt,
        license,
        licenseInfo.buildReleasedAt
      )
    : null;
  const formatDate = (ms: number) => new Date(ms).toLocaleDateString(i18n.language);

  const statusLabel = !licenseInfo
    ? t('license.checking')
    : license
      ? t('license.commercialUpdatesUntil', { date: formatDate(license.updatesUntil) })
      : badge?.kind === 'evaluation'
        ? t('license.badge.evaluation', { count: badge.daysLeft })
        : t('license.badge.personal');

  const statusDescription = !licenseInfo
    ? t('license.checkingDescription')
    : license
      ? covered
        ? t('license.commercialDescription')
        : t('license.badge.uncovered')
      : t('license.dialog.body');

  return (
    <div className="max-w-2xl space-y-5">
      <div className={`${cardClassName} space-y-4`}>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded border',
              license && covered ? 'border-success/25 bg-success/10' : 'border-border bg-background'
            )}
          >
            <BadgeCheck
              className={cn('w-5 h-5', license && covered ? 'text-success' : 'text-muted-foreground')}
            />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground">{t('license.status')}</h4>
            <p
              className={cn(
                'text-sm font-medium',
                license && covered ? 'text-success' : 'text-foreground'
              )}
            >
              {statusLabel}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{statusDescription}</p>
            {license?.maskedKey && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">{license.maskedKey}</p>
            )}
          </div>
        </div>

        {licenseInfo?.personalConfirmedAt && (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {t('license.personalConfirmed', { date: formatDate(licenseInfo.personalConfirmedAt) })}
            </p>
            <Button variant="ghost" size="sm" onClick={() => void setPersonalUse(false)}>
              {t('license.undoPersonalConfirm')}
            </Button>
          </div>
        )}

        {license && (
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <Button
              variant="primary"
              onClick={() => window.open(BUY_LICENSE_URL, '_blank')}
              className="w-full"
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              {t('license.renewLicense')}
            </Button>
            <Button
              variant="ghost"
              className="w-full border border-destructive/30 text-destructive hover:border-destructive/50 hover:bg-destructive/10"
              onClick={async () => {
                if (!isOnline) return;
                if (confirm(t('license.deactivateConfirm'))) {
                  await deactivate();
                }
              }}
              disabled={!isOnline || isLicenseLoading}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t('license.deactivateDevice')}
            </Button>
          </div>
        )}
      </div>

      <div className={`${cardClassName} space-y-4`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/10 text-primary">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {license ? t('license.activateNewKey') : t('license.alreadyHaveKey')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {license
                ? t('license.activateNewKeyDescription')
                : t('license.alreadyHaveKeyDescription')}
            </p>
          </div>
        </div>

        {activationError && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span>{activationError}</span>
          </div>
        )}

        <Input
          label={t('license.licenseKey')}
          value={licenseKeyInput}
          onChange={(e) => {
            onLicenseKeyInputChange(e.target.value);
            onLicenseActivationErrorChange('');
          }}
          placeholder={t('license.keyPlaceholder')}
        />

        <Button
          variant="primary"
          className="w-full"
          onClick={async () => {
            if (!licenseKeyInput.trim()) {
              onLicenseActivationErrorChange(t('license.enterKey'));
              return;
            }
            const success = await activate(licenseKeyInput.trim());
            if (success) onLicenseKeyInputChange('');
          }}
          isLoading={isLicenseLoading}
          disabled={!licenseKeyInput.trim()}
        >
          {t('license.activate')}
        </Button>

        {!license && (
          <div className="pt-4 border-t border-border text-center">
            <Button
              variant="ghost"
              className="text-primary"
              onClick={() => window.open(BUY_LICENSE_URL, '_blank')}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              {t('license.buyLicense')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
