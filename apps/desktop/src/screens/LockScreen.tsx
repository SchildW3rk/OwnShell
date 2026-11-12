/**
 * Lock Screen
 *
 * Unlock app with master password or recover with recovery key
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@ownshell/ui';
import { useAuthStore } from '../stores/useAuthStore';
import { Key, ArrowLeft, AlertTriangle, Copy, Check } from 'lucide-react';
import logoImage from '../assets/logo.svg';
import { validateMasterPassword } from '../lib/validation';

type Mode = 'unlock' | 'recovery' | 'newRecoveryKey';

export const LockScreen: React.FC = () => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('unlock');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Recovery mode state
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // New recovery key display state
  const [newRecoveryKey, setNewRecoveryKey] = useState('');
  const [hasCopied, setHasCopied] = useState(false);
  const [hasConfirmed, setHasConfirmed] = useState(false);

  const { unlock, resetWithRecovery, completeRecovery, isLoading } = useAuthStore();

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const success = await unlock(password);

    if (!success) {
      setError(t('lock.wrongPassword'));
      setPassword('');
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateMasterPassword(newPassword, confirmPassword);
    if (validationError) {
      setError(t(validationError));
      return;
    }

    const result = await resetWithRecovery(recoveryKey, newPassword);

    if (result.success && result.newRecoveryKey) {
      // Show new recovery key
      setNewRecoveryKey(result.newRecoveryKey);
      setMode('newRecoveryKey');
    } else {
      setError(result.error || t('recovery.failed'));
    }
  };

  const handleCopyNewRecoveryKey = async () => {
    try {
      await navigator.clipboard.writeText(newRecoveryKey);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleContinue = async () => {
    setError('');

    try {
      await completeRecovery();
      // Clear sensitive data only after recovery completion is acknowledged.
      setNewRecoveryKey('');
    } catch (err) {
      setError(t('recovery.completeFailed'));
    }
  };

  const resetToUnlock = () => {
    setMode('unlock');
    setError('');
    setRecoveryKey('');
    setNewPassword('');
    setConfirmPassword('');
  };

  // New Recovery Key Display (after successful recovery)
  if (mode === 'newRecoveryKey') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-full max-w-lg p-8 bg-background-secondary rounded-lg border border-border">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mb-4">
              <Key className="w-8 h-8 text-success" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t('recovery.resetSuccess')}</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {t('recovery.newKeyDescription')}
            </p>
          </div>

          {/* Warning */}
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm text-warning">
                <p className="font-semibold mb-1">{t('recovery.warningTitle')}</p>
                <p>{t('recovery.warningText')}</p>
              </div>
            </div>
          </div>

          {/* New Recovery Key Display */}
          <div className="bg-background-tertiary rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                {t('recovery.newKeyLabel')}
              </span>
              <button
                type="button"
                onClick={handleCopyNewRecoveryKey}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                {hasCopied ? (
                  <>
                    <Check className="w-3 h-3" />
                    {t('recovery.copied')}
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    {t('recovery.copy')}
                  </>
                )}
              </button>
            </div>
            <div className="font-mono text-lg text-foreground tracking-wider text-center py-3 select-all">
              {newRecoveryKey}
            </div>
          </div>

          {/* Data cleared notice */}
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-destructive">{t('recovery.dataCleared')}</p>
          </div>

          {/* Confirmation Checkbox */}
          <label className="flex items-start gap-3 mb-6 cursor-pointer group">
            <input
              type="checkbox"
              checked={hasConfirmed}
              onChange={(e) => setHasConfirmed(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              {t('recovery.confirmCheckbox')}
            </span>
          </label>

          {error && (
            <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            onClick={handleContinue}
            variant="primary"
            className="w-full"
            disabled={!hasConfirmed || isLoading}
            isLoading={isLoading}
          >
            {t('recovery.continue')}
          </Button>
        </div>
      </div>
    );
  }

  // Recovery Mode UI
  if (mode === 'recovery') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-full max-w-md p-8 bg-background-secondary rounded-lg border border-border">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-warning/20 rounded-full flex items-center justify-center mb-4">
              <Key className="w-8 h-8 text-warning" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t('recovery.resetTitle')}</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {t('recovery.resetDescription')}
            </p>
          </div>

          {/* Warning about data loss */}
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-6">
            <p className="text-sm text-destructive">{t('recovery.dataLossWarning')}</p>
          </div>

          <form onSubmit={handleRecovery} className="space-y-4">
            <Input
              label={t('recovery.enterKey')}
              type="text"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              autoFocus
              className="font-mono"
            />

            <Input
              label={t('recovery.newPassword')}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('setup.masterPasswordPlaceholder')}
            />

            <Input
              label={t('setup.confirmPassword')}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('setup.confirmPasswordPlaceholder')}
            />

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive rounded text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={resetToUnlock}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="primary" className="flex-1" isLoading={isLoading}>
                {t('recovery.resetButton')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Default: Unlock Mode
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 bg-background-secondary rounded-lg border border-border">
        <div className="flex flex-col items-center mb-8">
          <img src={logoImage} alt="OwnShell" className="w-20 h-20 rounded-xl mb-4" />
          <h1 className="text-2xl font-bold text-foreground">
            {t('lock.title')}{' '}
            <span className="text-muted-foreground font-normal">{t('lock.subtitle')}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-2">{t('lock.description')}</p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <Input
            label={t('lock.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('setup.masterPasswordPlaceholder')}
            error={error}
            autoFocus
          />

          <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
            {isLoading ? t('lock.unlocking') : t('lock.unlockButton')}
          </Button>

          {/* Forgot Password Link */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setMode('recovery')}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {t('lock.forgotPassword')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
