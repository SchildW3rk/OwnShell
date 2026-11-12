/**
 * i18n Configuration
 *
 * Internationalization setup using i18next
 * - Supports English (en) and German (de)
 * - Detects system language by default
 * - Persists language preference in app_settings database
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/common.json';
import de from './locales/de/common.json';

// Available languages
export const LANGUAGES = {
  en: { code: 'en', name: 'English', nativeName: 'English' },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch' },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

// Initialize i18n
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      de: { common: de },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common'],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      // Detection order: localStorage first, then browser language
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'ownshell-language',
    },
    react: {
      useSuspense: false, // Disable suspense for better control
    },
  });

/**
 * Load saved language from database and apply it
 * Call this after the app is unlocked and electronAPI is available
 */
export async function loadSavedLanguage(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const savedLang = await window.electronAPI.settings.get('language');
      if (savedLang && (savedLang === 'en' || savedLang === 'de')) {
        await i18n.changeLanguage(savedLang);
        // Also sync to localStorage for faster initial load next time
        localStorage.setItem('ownshell-language', savedLang);
      }
    }
  } catch (error) {
    console.warn('Failed to load saved language:', error);
  }
}

/**
 * Change language and persist to database
 */
export async function changeLanguage(lang: LanguageCode): Promise<void> {
  await i18n.changeLanguage(lang);
  localStorage.setItem('ownshell-language', lang);

  // Persist to database if available
  try {
    if (typeof window !== 'undefined' && window.electronAPI) {
      await window.electronAPI.settings.set('language', lang);
    }
  } catch (error) {
    console.warn('Failed to save language preference:', error);
  }
}

/**
 * Get current language code
 */
export function getCurrentLanguage(): LanguageCode {
  return (i18n.language?.substring(0, 2) as LanguageCode) || 'en';
}

export default i18n;
