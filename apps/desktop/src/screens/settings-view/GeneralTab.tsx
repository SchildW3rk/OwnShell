import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bug,
  CheckCircle,
  Download,
  Globe,
  Loader2,
  Lock,
  Mail,
  Palette,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Type,
} from 'lucide-react';
import { Button, Input, Select, Tabs, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { LANGUAGES, changeLanguage } from '../../i18n/config';
import {
  EDITOR_FONT_PRESETS,
  MAX_EDITOR_FONT_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  TERMINAL_FONT_PRESETS,
  clampEditorFontSize,
  clampTerminalFontSize,
  normalizeTerminalFontFamily,
} from '../../utils/appearance';
import { ThemeToggle } from './ThemeToggle';
import type { LanguageCode, UpdateStatus } from './types';

interface GeneralTabProps {
  currentLang: LanguageCode;
  autoLockTimeout: string;
  appVersion: string;
  autoUpdateEnabled: boolean;
  updateStatus: UpdateStatus;
  availableVersion: string | null;
  downloadProgress: number;
  updateError: string | null;
  onLanguageChange: (language: LanguageCode) => void;
  onAutoLockTimeoutChange: (value: string) => void;
  onToggleAutoUpdate: (enabled: boolean) => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onShowUpdateDetails: () => void;
  onSave: () => void;
}

type GeneralSection = 'language' | 'design' | 'fonts' | 'security' | 'updates' | 'support';

export const GeneralTab: React.FC<GeneralTabProps> = ({
  currentLang,
  autoLockTimeout,
  appVersion,
  autoUpdateEnabled,
  updateStatus,
  availableVersion,
  downloadProgress,
  updateError,
  onLanguageChange,
  onAutoLockTimeoutChange,
  onToggleAutoUpdate,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onShowUpdateDetails,
  onSave,
}) => {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<GeneralSection>('language');
  const terminalFontFamily = useAppearanceStore((state) => state.terminalFontFamily);
  const terminalFontSize = useAppearanceStore((state) => state.terminalFontSize);
  const editorFontFamily = useAppearanceStore((state) => state.editorFontFamily);
  const editorFontSize = useAppearanceStore((state) => state.editorFontSize);
  const setTerminalFontFamily = useAppearanceStore((state) => state.setTerminalFontFamily);
  const setTerminalFontSize = useAppearanceStore((state) => state.setTerminalFontSize);
  const setEditorFontFamily = useAppearanceStore((state) => state.setEditorFontFamily);
  const setEditorFontSize = useAppearanceStore((state) => state.setEditorFontSize);
  const resetAppearance = useAppearanceStore((state) => state.resetAppearance);

  const selectedTerminalPreset =
    TERMINAL_FONT_PRESETS.find((preset) => preset.value === terminalFontFamily)?.value ?? 'custom';
  const selectedEditorPreset =
    EDITOR_FONT_PRESETS.find((preset) => preset.value === editorFontFamily)?.value ?? 'custom';

  useEffect(() => {
    const normalized = normalizeTerminalFontFamily(terminalFontFamily);
    if (normalized !== terminalFontFamily) {
      setTerminalFontFamily(normalized);
    }
  }, [terminalFontFamily, setTerminalFontFamily]);

  const hasKnownUpdate =
    Boolean(availableVersion) &&
    (updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'ready');

  const updateStatusLabel =
    updateStatus === 'checking'
      ? t('settings.checking')
      : updateStatus === 'available'
        ? t('settings.updateAvailableStatus')
        : updateStatus === 'downloading'
          ? t('settings.downloadProgress', { progress: downloadProgress })
          : updateStatus === 'ready'
            ? t('settings.readyToInstall')
            : updateStatus === 'error'
              ? t('settings.updateError')
              : t('settings.upToDate');

  const sectionTabs = [
    { id: 'language', label: t('settings.language'), icon: <Globe className="h-4 w-4" /> },
    { id: 'design', label: t('settings.designTab'), icon: <Palette className="h-4 w-4" /> },
    { id: 'fonts', label: t('settings.fontsTab'), icon: <Type className="h-4 w-4" /> },
    { id: 'security', label: t('settings.securityTab'), icon: <Shield className="h-4 w-4" /> },
    { id: 'updates', label: t('settings.updates'), icon: <RefreshCw className="h-4 w-4" /> },
    { id: 'support', label: t('settings.supportTab'), icon: <Bug className="h-4 w-4" /> },
  ];

  return (
    <div className="max-w-3xl space-y-5">
      <Tabs
        tabs={sectionTabs}
        activeTab={activeSection}
        onChange={(tabId) => setActiveSection(tabId as GeneralSection)}
        variant="pills"
        className="rounded border border-border bg-secondary/40 p-1"
      />

      {activeSection === 'language' && (
        <section className="space-y-4 rounded border border-border bg-secondary p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/20">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">{t('settings.language')}</h4>
              <p className="text-xs text-muted-foreground">
                {t('settings.languageDescription')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {Object.values(LANGUAGES).map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={async () => {
                  await changeLanguage(lang.code as LanguageCode);
                  onLanguageChange(lang.code as LanguageCode);
                }}
                className={cn(
                  'min-w-28 rounded px-4 py-2 text-sm font-medium transition-colors',
                  currentLang === lang.code
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-foreground hover:bg-muted'
                )}
              >
                {lang.nativeName}
              </button>
            ))}
          </div>
        </section>
      )}

      {activeSection === 'design' && (
        <section className="space-y-4">
          <ThemeToggle />
        </section>
      )}

      {activeSection === 'fonts' && (
        <section className="space-y-4 rounded border border-border bg-secondary p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/20">
                <Type className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-foreground">
                  {t('settings.appearance')}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t('settings.appearanceDescription')}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={resetAppearance}
              className="no-drag shrink-0"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('settings.resetAppearance')}
            </Button>
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <div className="grid gap-4 md:grid-cols-[1fr_9rem]">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  {t('settings.editorFont')}
                </label>
                <Select
                  value={selectedEditorPreset}
                  onChange={(event) => {
                    if (event.target.value === 'custom') return;
                    setEditorFontFamily(event.target.value);
                  }}
                  options={[
                    ...EDITOR_FONT_PRESETS.map((preset) => ({
                      value: preset.value,
                      label: preset.label,
                    })),
                    ...(selectedEditorPreset === 'custom'
                      ? [{ value: 'custom', label: t('settings.customFont') }]
                      : []),
                  ]}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  {t('settings.editorFontSize')}
                </label>
                <Input
                  type="number"
                  min={MIN_EDITOR_FONT_SIZE}
                  max={MAX_EDITOR_FONT_SIZE}
                  value={editorFontSize}
                  onChange={(event) => setEditorFontSize(Number(event.target.value))}
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Input
                value={editorFontFamily}
                onChange={(event) => setEditorFontFamily(event.target.value)}
                className="font-mono"
                aria-label={t('settings.editorFontCustom')}
              />
              <p className="text-xs text-muted-foreground">{t('settings.editorFontDescription')}</p>
            </div>

            <div
              className="rounded border border-border bg-background px-3 py-2 text-foreground"
              style={{
                fontFamily: editorFontFamily,
                fontSize: `${clampEditorFontSize(editorFontSize)}px`,
              }}
            >
              <span className="text-primary">SELECT</span>
              <span> * </span>
              <span className="text-primary">FROM</span>
              <span> sessions </span>
              <span className="text-primary">LIMIT</span>
              <span> 10;</span>
            </div>
          </div>

          <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-[1fr_9rem]">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                {t('settings.terminalFont')}
              </label>
              <Select
                value={selectedTerminalPreset}
                onChange={(event) => {
                  if (event.target.value === 'custom') return;
                  setTerminalFontFamily(event.target.value);
                }}
                options={[
                  ...TERMINAL_FONT_PRESETS.map((preset) => ({
                    value: preset.value,
                    label: preset.label,
                  })),
                  ...(selectedTerminalPreset === 'custom'
                    ? [{ value: 'custom', label: t('settings.customFont') }]
                    : []),
                ]}
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                {t('settings.terminalFontSize')}
              </label>
              <Input
                type="number"
                min={MIN_TERMINAL_FONT_SIZE}
                max={MAX_TERMINAL_FONT_SIZE}
                value={terminalFontSize}
                onChange={(event) => setTerminalFontSize(Number(event.target.value))}
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Input
              value={terminalFontFamily}
              onChange={(event) => setTerminalFontFamily(event.target.value)}
              className="font-mono"
              aria-label={t('settings.terminalFontCustom')}
            />
            <p className="text-xs text-muted-foreground">{t('settings.terminalFontDescription')}</p>
          </div>

          <div
            className="rounded border border-border bg-background px-3 py-2 text-foreground"
            style={{
              fontFamily: terminalFontFamily,
              fontSize: `${clampTerminalFontSize(terminalFontSize)}px`,
            }}
          >
            <span className="text-success">~/ownshell</span>
            <span className="text-muted-foreground"> on </span>
            <span className="text-primary">main</span>
            <span className="text-muted-foreground"> ❯ </span>
            <span>{t('settings.terminalPreview')}</span>
          </div>
        </section>
      )}

      {activeSection === 'security' && (
        <section className="space-y-5 rounded border border-border bg-secondary p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/20">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">{t('settings.autoLock')}</h4>
              <p className="text-xs text-muted-foreground">{t('settings.autoLockDescription')}</p>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-4">
              <Input
                type="number"
                min="1"
                max="60"
                value={autoLockTimeout}
                onChange={(e) => onAutoLockTimeoutChange(e.target.value)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">{t('settings.minutes')}</span>
            </div>
          </div>

          <Button variant="primary" onClick={onSave} className="no-drag">
            {t('settings.save')}
          </Button>
        </section>
      )}

      {activeSection === 'support' && (
        <section className="space-y-5 rounded border border-border bg-secondary p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/20">
              <Bug className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-foreground">
                {t('settings.supportTitle')}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.supportDescription')}
              </p>
            </div>
          </div>

          <div className="rounded border border-border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('settings.supportEmailLabel')}
            </p>
            <a
              href="mailto:support@ownshell.app?subject=OwnShell%20Feedback"
              className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80"
            >
              <Mail className="h-4 w-4" />
              support@ownshell.app
            </a>
          </div>

          <p className="text-xs text-muted-foreground">{t('settings.supportPrivacyNote')}</p>
        </section>
      )}

      {activeSection === 'updates' && (
        <section className="space-y-5 rounded border border-border bg-secondary p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-background">
                <RefreshCw className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-foreground">{t('settings.updates')}</h4>
                <p className="text-xs text-muted-foreground">{t('settings.updatesDescription')}</p>
              </div>
            </div>
            {updateStatus === 'checking' && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium text-foreground">{t('settings.autoUpdate')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.autoUpdateDescription')}</p>
            </div>
            <button
              type="button"
              onClick={() => onToggleAutoUpdate(!autoUpdateEnabled)}
              aria-pressed={autoUpdateEnabled}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                autoUpdateEnabled ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  autoUpdateEnabled ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('settings.currentVersion')}
              </p>
              <p className="mt-1 font-mono text-sm font-medium text-foreground">{appVersion}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('settings.availableVersion')}
              </p>
              <p className="mt-1 font-mono text-sm font-medium text-foreground">
                {availableVersion ?? t('settings.noUpdateAvailable')}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('settings.updateStatus')}
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    updateStatus === 'error'
                      ? 'bg-destructive'
                      : updateStatus === 'ready'
                        ? 'bg-success'
                        : updateStatus === 'available' ||
                            updateStatus === 'downloading' ||
                            updateStatus === 'checking'
                          ? 'bg-primary'
                          : 'bg-muted-foreground'
                  )}
                />
                <span className="truncate text-sm font-medium text-foreground">
                  {updateStatusLabel}
                </span>
              </div>
            </div>
          </div>

          {updateStatus === 'downloading' && (
            <div className="space-y-2 border-t border-border pt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.downloadProgress', { progress: downloadProgress })}
              </p>
            </div>
          )}

          {updateStatus === 'error' && updateError && (
            <div className="flex items-center gap-2 border-t border-border pt-4">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">{updateError}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            {updateStatus !== 'ready' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onCheckForUpdates}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                className="no-drag w-full sm:w-auto"
              >
                {updateStatus === 'checking' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('settings.checking')}
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('settings.checkForUpdates')}
                  </>
                )}
              </Button>
            ) : (
              <div className="hidden sm:block" />
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {hasKnownUpdate && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onShowUpdateDetails}
                  className="no-drag w-full sm:w-auto"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('update.whatsNew', 'Was ist neu?')}
                </Button>
              )}
              {updateStatus === 'available' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onDownloadUpdate}
                  className="no-drag w-full sm:w-auto"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t('settings.downloadUpdate')}
                </Button>
              )}
              {updateStatus === 'ready' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onInstallUpdate}
                  className="no-drag w-full sm:w-auto"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {t('settings.installNow')}
                </Button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
