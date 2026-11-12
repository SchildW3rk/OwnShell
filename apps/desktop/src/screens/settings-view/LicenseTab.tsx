import React from 'react';
import { AlertCircle, BadgeCheck, CreditCard, Key, LogOut, ShoppingCart } from 'lucide-react';
import { Button, Input, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import type { LicenseInfo } from '../../../electron/license/types';

const BUY_LICENSE_URL = 'https://ownshell.app/#pricing';
const BILLING_PORTAL_URL = 'https://ownshell.lemonsqueezy.com/billing';

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
  const { t } = useTranslation();
  const cardClassName = 'rounded border border-border bg-secondary p-6';
  const iconClassName =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/10 text-primary';
  const status = licenseInfo?.status ?? 'none';
  const isChecking = isLicenseLoading && !licenseInfo;
  const canManageSubscription = status === 'active' || (status === 'trial' && !licenseInfo?.isLocalTrial);
  const canDeactivateDevice = status === 'active';
  const canActivateLicense = status === 'none' || status === 'expired' || Boolean(licenseInfo?.isLocalTrial);
  const statusTone =
    status === 'active'
      ? 'success'
      : status === 'trial'
        ? 'primary'
        : status === 'expired'
          ? 'destructive'
          : 'muted';

  const statusLabel = isChecking
    ? t('license.checking')
    : status === 'active'
      ? t('license.active')
      : status === 'trial'
        ? `${t('license.trial')} - ${t('license.trialDays', { days: licenseInfo?.trialDaysLeft ?? 0 })}`
        : status === 'expired'
          ? t('license.expired')
          : t('license.none');

  const statusDescription = isChecking
    ? t('license.checkingDescription')
    : status === 'active'
      ? t('license.activeDescription')
      : status === 'trial'
        ? t(licenseInfo?.isLocalTrial ? 'license.localTrialDescription' : 'license.trialDescription')
        : status === 'expired'
          ? t('license.expiredDescription')
          : t('license.noneDescription');

  return (
    <div className="max-w-2xl space-y-5">
      <div className={`${cardClassName} space-y-4`}>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded border',
              statusTone === 'success'
                ? 'border-success/25 bg-success/10'
                : statusTone === 'primary'
                  ? 'border-primary/25 bg-primary/10'
                  : statusTone === 'destructive'
                    ? 'border-destructive/25 bg-destructive/10'
                    : 'border-border bg-background'
            )}
          >
            <BadgeCheck
              className={cn(
                'w-5 h-5',
                statusTone === 'success'
                  ? 'text-success'
                  : statusTone === 'primary'
                    ? 'text-primary'
                    : statusTone === 'destructive'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
              )}
            />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground">{t('license.status')}</h4>
            <p
              className={cn(
                'text-sm font-medium',
                statusTone === 'success'
                  ? 'text-success'
                  : statusTone === 'primary'
                    ? 'text-primary'
                    : statusTone === 'destructive'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
              )}
            >
              {statusLabel}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{statusDescription}</p>
          </div>
        </div>

        {canManageSubscription && (
          <div
            className={cn(
              'grid gap-3 border-t border-border pt-4',
              canDeactivateDevice ? 'sm:grid-cols-2' : 'sm:grid-cols-1'
            )}
          >
            <Button
              variant="primary"
              onClick={() => window.open(BILLING_PORTAL_URL, '_blank')}
              className="w-full"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {t('license.manageSubscription')}
            </Button>

            {canDeactivateDevice && (
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
            )}
          </div>
        )}
      </div>

      {canActivateLicense && (
        <div className={`${cardClassName} space-y-4`}>
          <div className="flex items-center gap-3">
            <div className={iconClassName}>
              <Key className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                {status === 'expired' ? t('license.activateNewKey') : t('license.alreadyHaveKey')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {status === 'expired'
                  ? t('license.activateNewKeyDescription')
                  : t('license.alreadyHaveKeyDescription')}
              </p>
            </div>
          </div>

          {licenseActivationError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span>{licenseActivationError}</span>
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

          <div className="pt-4 border-t border-border text-center">
            <Button
              variant="ghost"
              className="text-primary"
              onClick={() => window.open(BUY_LICENSE_URL, '_blank')}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              {status === 'expired' ? t('license.renewLicense') : t('license.buyLicense')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
