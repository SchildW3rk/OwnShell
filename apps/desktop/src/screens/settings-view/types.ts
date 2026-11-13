import type { LanguageCode } from '../../i18n/config';

export type SettingsTab = 'general' | 'data' | 'about';
export type BackupMode = 'none' | 'export' | 'import';
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export type { LanguageCode };
