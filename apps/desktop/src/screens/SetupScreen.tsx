/**
 * Setup Screen
 *
 * First-time master password creation with recovery key display
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppCheckbox, Button, Input } from '@ownshell/ui';
import { useAuthStore } from '../stores/useAuthStore';
import { Key, Copy, Check, AlertTriangle } from 'lucide-react';
import logoImage from '../assets/logo.svg';
import { validateMasterPassword } from '../lib/validation';

export const SetupScreen: React.FC = () => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');

  // Recovery key modal state
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [hasCopied, setHasCopied] = useState(false);
  const [hasConfirmed, setHasConfirmed] = useState(false);

  const { initialize, completeSetup, isLoading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateMasterPassword(password, confirmation);
    if (validationError) {
      setError(t(validationError));
      return;
    }

    try {
      const result = await initialize(password);
      // Show recovery key modal instead of proceeding directly
      setRecoveryKey(result.recoveryKey);
      setShowRecoveryModal(true);
    } catch (err) {
      setError(t('setup.createFailed'));
    }
  };

  const handleCopyRecoveryKey = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleContinue = async () => {
    setError('');

    try {
      // Now complete setup - this will set isSetup=true, isLocked=false
      // and the App component will switch to MainScreen
      await completeSetup();
      // Clear sensitive data from memory only after setup is complete.
      setRecoveryKey('');
      setShowRecoveryModal(false);
    } catch (err) {
      setError(t('setup.completeFailed'));
    }
  };

  // Recovery Key Modal
  if (showRecoveryModal) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-full max-w-lg p-8 bg-background-secondary rounded-lg border border-border">
          {/* Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-warning/20 rounded-full flex items-center justify-center mb-4">
              <Key className="w-8 h-8 text-warning" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t('recovery.title')}</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {t('recovery.description')}
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

          {/* Recovery Key Display */}
          <div className="bg-background-tertiary rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                {t('recovery.keyLabel')}
              </span>
              <button
                type="button"
                onClick={handleCopyRecoveryKey}
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
              {recoveryKey}
            </div>
          </div>

          {/* Instructions */}
          <div className="text-sm text-muted-foreground space-y-2 mb-6">
            <p>{t('recovery.instruction1')}</p>
            <p>{t('recovery.instruction2')}</p>
          </div>

          {/* Confirmation Checkbox */}
          <AppCheckbox
            checked={hasConfirmed}
            onCheckedChange={setHasConfirmed}
            label={t('recovery.confirmCheckbox')}
            className="mb-6"
          />

          {/* Continue Button */}
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

  // Main Setup Form
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 bg-background-secondary rounded-lg border border-border">
        <div className="flex flex-col items-center mb-8">
          <img src={logoImage} alt="OwnShell" className="w-20 h-20 rounded-xl mb-4" />
          <h1 className="text-2xl font-bold text-foreground">{t('setup.title')}</h1>
          <p className="text-sm text-muted-foreground mt-2 text-center">{t('setup.description')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t('setup.masterPassword')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('setup.masterPasswordPlaceholder')}
            autoFocus
          />

          <Input
            label={t('setup.confirmPassword')}
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={t('setup.confirmPasswordPlaceholder')}
          />

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive rounded text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="bg-background-tertiary p-3 rounded text-xs text-muted-foreground space-y-1">
            <p>{t('setup.requirementsTitle')}</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>{t('setup.requirementLength')}</li>
              <li>{t('setup.requirementUppercase')}</li>
              <li>{t('setup.requirementLowercase')}</li>
              <li>{t('setup.requirementNumber')}</li>
            </ul>
          </div>

          <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
            {t('setup.createButton')}
          </Button>
        </form>
      </div>
    </div>
  );
};
