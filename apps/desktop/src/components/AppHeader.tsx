/**
 * AppHeader Component (v1.18.0)
 *
 * Unified top header spanning the entire app width
 * - Sidebar toggle (left)
 * - Logo + App name (left-center)
 * - Language, Theme, Settings, Lock buttons (right)
 * - Platform-aware padding for macOS traffic lights
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { PanelLeftClose, PanelLeft, Globe, Sun, Moon, Monitor, Settings, Lock } from 'lucide-react';
import logoImage from '../assets/logo.svg';
import { cn } from '@ownshell/ui';
import { useSidebar } from './sidebar/SidebarContext';
import { useThemeStore } from '../stores/useThemeStore';
import { useAuthStore } from '../stores/useAuthStore';
import { LANGUAGES, changeLanguage, getCurrentLanguage, type LanguageCode } from '../i18n/config';

/** Fixed header height */
const HEADER_HEIGHT = 48;

interface AppHeaderProps {
  /** Navigate to settings view */
  onOpenSettings: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onOpenSettings }) => {
  const { t } = useTranslation();
  const { mode: themeMode, cycleTheme } = useThemeStore();
  const { lock } = useAuthStore();
  const { toggleSlim, isSlim, isCollapsed, toggleCollapsed } = useSidebar();

  const isMac = navigator.platform.includes('Mac');
  const currentLang = getCurrentLanguage();

  // Theme icon based on current mode
  const ThemeIcon = themeMode === 'dark' ? Moon : themeMode === 'light' ? Sun : Monitor;

  // Toggle language between available options
  const handleLanguageToggle = () => {
    const langCodes = Object.keys(LANGUAGES) as LanguageCode[];
    const currentIndex = langCodes.indexOf(currentLang);
    const nextIndex = (currentIndex + 1) % langCodes.length;
    changeLanguage(langCodes[nextIndex]);
  };

  // Handle sidebar toggle
  const handleSidebarToggle = () => {
    if (isCollapsed) {
      toggleCollapsed();
    } else {
      toggleSlim();
    }
  };

  return (
    <header
      className={cn(
        'flex items-center justify-between border-b border-border bg-background',
        'drag-region', // Allow window dragging
        'transition-colors duration-200'
      )}
      style={{ height: HEADER_HEIGHT, minHeight: HEADER_HEIGHT }}
    >
      {/* Left Section: Sidebar Toggle + Logo */}
      <div className={cn('flex items-center gap-2 h-full', isMac ? 'pl-20' : 'pl-3')}>
        {/* Sidebar Toggle */}
        <button
          type="button"
          onClick={handleSidebarToggle}
          className="no-drag p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title={isSlim ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          {isSlim || isCollapsed ? (
            <PanelLeft className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>

        {/* Logo + App Name */}
        <div className="flex items-center gap-2">
          <img src={logoImage} alt="OwnShell" className="w-6 h-6 rounded flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground hidden sm:block">
            {t('app.name')}
          </span>
        </div>
      </div>

      {/* Right Section: Actions */}
      <div className="flex items-center gap-1 pr-3 h-full">
        {/* Language Toggle */}
        <button
          type="button"
          onClick={handleLanguageToggle}
          className="no-drag flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title={t('settings.language')}
        >
          <Globe className="w-4 h-4" />
          <span className="text-xs font-medium uppercase">{currentLang}</span>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={cycleTheme}
          className="no-drag p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title={`${t('settings.theme')}: ${themeMode}`}
        >
          <ThemeIcon className="w-4 h-4" />
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="no-drag p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title={t('settings.title')}
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-border mx-1" />

        {/* Lock */}
        <button
          type="button"
          onClick={lock}
          className="no-drag p-2 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
          title={t('sidebar.lock')}
        >
          <Lock className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

export default AppHeader;
