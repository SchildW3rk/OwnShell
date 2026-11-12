import React from 'react';
import { Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { useThemeStore } from '../../stores/useThemeStore';

export const ThemeToggle: React.FC = () => {
  const { t } = useTranslation();
  const { mode, setMode } = useThemeStore();

  return (
    <div>
      <p className="block text-sm font-medium text-foreground mb-2">{t('settings.theme')}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('system')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded border transition-all duration-200',
            mode === 'system'
              ? 'bg-primary text-white border-primary'
              : 'bg-card text-muted-foreground border-border hover:bg-secondary'
          )}
        >
          <SettingsIcon className="w-4 h-4" />
          <span className="text-sm font-medium">System</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('dark')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded border transition-all duration-200',
            mode === 'dark'
              ? 'bg-primary text-white border-primary'
              : 'bg-card text-muted-foreground border-border hover:bg-secondary'
          )}
        >
          <Moon className="w-4 h-4" />
          <span className="text-sm font-medium">Dark</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('light')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded border transition-all duration-200',
            mode === 'light'
              ? 'bg-primary text-white border-primary'
              : 'bg-card text-muted-foreground border-border hover:bg-secondary'
          )}
        >
          <Sun className="w-4 h-4" />
          <span className="text-sm font-medium">Light</span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{t('settings.themeDescription')}</p>
    </div>
  );
};
