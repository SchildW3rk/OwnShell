import React, { useEffect, useState } from 'react';
import { AppCheckbox } from '@ownshell/ui';
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface RequestSettings {
  timeoutSeconds: number;
  followRedirects: boolean;
  verifyTls: boolean;
}

export const DEFAULT_REQUEST_SETTINGS: RequestSettings = {
  timeoutSeconds: 30,
  followRedirects: true,
  verifyTls: true,
};

const clampTimeout = (value: number) => Math.min(600, Math.max(1, Math.round(value)));

interface RequestSettingsEditorProps {
  settings: RequestSettings;
  onChange: (settings: RequestSettings) => void;
}

export const RequestSettingsEditor: React.FC<RequestSettingsEditorProps> = ({ settings, onChange }) => {
  const { t } = useTranslation();
  // Free text while typing; committed (clamped to 1..600) on blur.
  const [timeoutText, setTimeoutText] = useState(String(settings.timeoutSeconds));
  useEffect(() => setTimeoutText(String(settings.timeoutSeconds)), [settings.timeoutSeconds]);

  const commitTimeout = () => {
    const value = Number(timeoutText);
    const next = Number.isFinite(value) && timeoutText.trim() ? clampTimeout(value) : settings.timeoutSeconds;
    setTimeoutText(String(next));
    if (next !== settings.timeoutSeconds) onChange({ ...settings, timeoutSeconds: next });
  };

  return (
    <div className="h-full overflow-auto p-4 space-y-5 max-w-xl">
      <div className="space-y-1.5">
        <label htmlFor="api-request-timeout" className="block text-sm font-medium text-foreground">
          {t('api.settings.timeout')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="api-request-timeout"
            type="number"
            min={1}
            max={600}
            value={timeoutText}
            onChange={(event) => setTimeoutText(event.target.value)}
            onBlur={commitTimeout}
            onKeyDown={(event) => event.key === 'Enter' && commitTimeout()}
            className="w-24 px-2 py-1.5 bg-secondary border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-sm text-muted-foreground">{t('api.settings.seconds')}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t('api.settings.timeoutHint')}</p>
      </div>

      <AppCheckbox
        id="api-request-follow-redirects"
        checked={settings.followRedirects}
        onCheckedChange={(followRedirects) => onChange({ ...settings, followRedirects })}
        label={t('api.settings.followRedirects')}
        description={t('api.settings.followRedirectsHint')}
      />

      <div className="space-y-2">
        <AppCheckbox
          id="api-request-verify-tls"
          checked={settings.verifyTls}
          onCheckedChange={(verifyTls) => onChange({ ...settings, verifyTls })}
          label={t('api.settings.verifyTls')}
          description={t('api.settings.verifyTlsHint')}
        />
        {!settings.verifyTls && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
          >
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{t('api.settings.tlsOffWarning')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
