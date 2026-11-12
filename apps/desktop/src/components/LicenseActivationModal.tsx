/**
 * License Activation Modal
 *
 * Displayed when no valid license is found after unlock.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, cn } from '@ownshell/ui';
import { useLicenseStore } from '../stores/useLicenseStore';
import { LANGUAGES, changeLanguage, getCurrentLanguage, type LanguageCode } from '../i18n/config';
import { AlertCircle, Globe, KeyRound, Loader2, LogOut, ShoppingCart } from 'lucide-react';

const BUY_LICENSE_URL = 'https://ownshell.app/#pricing';

type ActionTone = 'primary' | 'secondary' | 'accent' | 'danger';

interface ActionButtonProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: ActionTone;
  disabled?: boolean;
  onClick: () => void;
}

function ActionButton({
  icon,
  children,
  tone = 'secondary',
  disabled = false,
  onClick,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded border px-4 text-left text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-60',
        tone === 'primary' && 'border-primary bg-primary text-primary-foreground hover:brightness-110',
        tone === 'secondary' && 'border-border bg-secondary text-foreground hover:bg-muted',
        tone === 'accent' && 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15',
        tone === 'danger' && 'border-transparent bg-transparent text-destructive hover:bg-destructive/10'
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

export const LicenseActivationModal: React.FC = () => {
  const { t } = useTranslation();
  const { licenseInfo, isLoading, error, activate, startTrial, quitApp, clearError } = useLicenseStore();

  const [licenseKey, setLicenseKey] = useState('');
  const [currentLang, setCurrentLang] = useState<LanguageCode>(getCurrentLanguage());
  const [mode, setMode] = useState<'main' | 'activate'>('main');

  const handleActivate = async () => {
    if (!licenseKey.trim()) return;
    const success = await activate(licenseKey.trim());
    if (success) {
      setLicenseKey('');
    }
  };

  const handleLanguageChange = async (lang: LanguageCode) => {
    await changeLanguage(lang);
    setCurrentLang(lang);
  };

  const handleBuyLicense = () => {
    window.open(BUY_LICENSE_URL, '_blank');
  };

  const isExpired = licenseInfo?.status === 'expired';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-lg border border-border bg-card text-card-foreground shadow-2xl">
        <div className="absolute right-4 top-4">
          <div className="flex items-center gap-1 rounded border border-border bg-secondary p-1">
            <Globe className="ml-1 h-4 w-4 text-muted-foreground" />
            {Object.values(LANGUAGES).map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleLanguageChange(lang.code as LanguageCode)}
                className={cn(
                  'h-7 rounded px-2 text-xs font-medium transition-colors',
                  currentLang === lang.code
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {lang.code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 pt-20 sm:px-8 sm:pt-16">
          <div className="mb-7 max-w-sm">
            <h1 className="text-2xl font-semibold tracking-normal text-foreground">
              {t('license.welcome')}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(licenseInfo?.canStartTrial ? 'license.welcomeSubtitle' : 'license.activateNewKeyDescription')}
            </p>
            {isExpired && (
              <p className="mt-3 text-sm font-medium text-destructive">{t('license.expired')}</p>
            )}
          </div>

          {error && (
            <div className="mb-5 flex gap-2 rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error.startsWith('license.') ? t(error) : error}</span>
            </div>
          )}

          {mode === 'main' ? (
            <div className="space-y-3">
              <ActionButton
                tone="primary"
                icon={<KeyRound className="h-4 w-4" />}
                onClick={() => {
                  clearError();
                  setMode('activate');
                }}
                disabled={isLoading}
              >
                {t('license.activate')}
              </ActionButton>

              {licenseInfo?.canStartTrial && (
                <ActionButton
                  tone="accent"
                  icon={isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                  onClick={() => { void startTrial(); }}
                  disabled={isLoading}
                >
                  {t(isLoading ? 'license.startingTrial' : 'license.startTrial')}
                </ActionButton>
              )}

              <ActionButton
                tone="accent"
                icon={<ShoppingCart className="h-4 w-4" />}
                onClick={handleBuyLicense}
                disabled={isLoading}
              >
                {t('license.buyLicense')}
              </ActionButton>

              <div className="py-3">
                <div className="border-t border-border" />
              </div>

              <ActionButton
                tone="danger"
                icon={<LogOut className="h-4 w-4" />}
                onClick={quitApp}
                disabled={isLoading}
              >
                {t('license.quitApp')}
              </ActionButton>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label={t('license.licenseKey')}
                type="text"
                value={licenseKey}
                onChange={(event) => {
                  setLicenseKey(event.target.value);
                  clearError();
                }}
                placeholder={t('license.keyPlaceholder')}
                autoFocus
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    clearError();
                    setMode('main');
                    setLicenseKey('');
                  }}
                  disabled={isLoading}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleActivate}
                  disabled={!licenseKey.trim() || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('license.activating')}
                    </>
                  ) : (
                    t('license.activate')
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
