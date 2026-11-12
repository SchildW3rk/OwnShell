import React from 'react';
import { useTranslation } from 'react-i18next';
import logoUrl from '../../assets/logo.svg';

interface AboutTabProps {
  appVersion: string;
}

export const AboutTab: React.FC<AboutTabProps> = ({ appVersion }) => {
  const { t } = useTranslation();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="p-6 bg-secondary rounded border border-border">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-primary/20 bg-background shadow-sm">
            <img src={logoUrl} alt="" className="h-16 w-16" />
          </div>
          <div>
            <h4 className="text-lg font-semibold text-foreground">{t('app.name')}</h4>
            <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-t border-border">
            <span className="text-muted-foreground">{t('settings.version')}</span>
            <span className="text-foreground font-mono">{appVersion}</span>
          </div>
          <div className="flex justify-between py-2 border-t border-border">
            <span className="text-muted-foreground">{t('settings.platform')}</span>
            <span className="text-foreground">Electron + React</span>
          </div>
          <div className="flex justify-between py-2 border-t border-border">
            <span className="text-muted-foreground">{t('settings.database')}</span>
            <span className="text-foreground">SQLite (AES-256-GCM)</span>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">{t('settings.securityNote')}</p>
        </div>
      </div>
    </div>
  );
};
