/**
 * Main App Component
 *
 * Handles routing between Setup, Lock, and Main screens
 * Includes i18n initialization
 */

import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/useAuthStore';
import { useInitializeTheme } from './stores/useThemeStore';
import { SidebarProvider } from './components/sidebar';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

// Initialize i18n (must be imported before any components that use translations)
import './i18n/config';
import { loadSavedLanguage } from './i18n';

// Settings key for last seen version
const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';

const SetupScreen = React.lazy(() =>
  import('./screens/SetupScreen').then((module) => ({ default: module.SetupScreen }))
);
const LockScreen = React.lazy(() =>
  import('./screens/LockScreen').then((module) => ({ default: module.LockScreen }))
);
const MainScreen = React.lazy(() =>
  import('./screens/MainScreen').then((module) => ({ default: module.MainScreen }))
);
const WhatsNewModal = React.lazy(() =>
  import('./components/changelog/WhatsNewModal').then((module) => ({
    default: module.WhatsNewModal,
  }))
);

/**
 * Compare two semantic version strings
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export const App: React.FC = () => {
  const { isSetup, isLocked, checkSetup } = useAuthStore();

  // What's New modal state
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const appReadyForUpdates = !isLocked && isSetup;

  // Initialize theme system
  useInitializeTheme();

  // Check setup status on mount
  useEffect(() => {
    checkSetup();
  }, [checkSetup]);

  // Load saved language preference after unlock
  useEffect(() => {
    if (!isLocked && isSetup) {
      loadSavedLanguage();
    }
  }, [isLocked, isSetup]);

  // Check for app update and show What's New modal
  useEffect(() => {
    if (appReadyForUpdates) {
      const checkForNewVersion = async () => {
        try {
          // Get current app version
          const version = await window.electronAPI.updater.getVersion();
          setCurrentVersion(version);

          // Get last seen version from settings
          const lastSeenResult = await window.electronAPI.settings.get(LAST_SEEN_VERSION_KEY);
          const lastSeenVersion = lastSeenResult || '0.0.0';

          // Compare versions - show modal if current > lastSeen
          if (version && compareVersions(version, lastSeenVersion) > 0) {
            setShowWhatsNew(true);
          }
        } catch (error) {
          console.error('Failed to check for new version:', error);
        }
      };

      checkForNewVersion();
    }
  }, [appReadyForUpdates]);

  // Handle What's New modal close
  const handleWhatsNewClose = async () => {
    setShowWhatsNew(false);

    // Save current version as last seen
    if (currentVersion) {
      try {
        await window.electronAPI.settings.set(LAST_SEEN_VERSION_KEY, currentVersion);
      } catch (error) {
        console.error('Failed to save last seen version:', error);
      }
    }
  };

  // Routing logic
  const getScreen = () => {
    if (!isSetup) {
      return <SetupScreen />;
    }

    if (isLocked) {
      return <LockScreen />;
    }

    return (
      <SidebarProvider>
        <MainScreen />
      </SidebarProvider>
    );
  };

  return (
    <>
      <React.Suspense fallback={<AppLoadingFallback />}>{getScreen()}</React.Suspense>
      {/* What's New Modal - shown after app update */}
      {showWhatsNew && currentVersion && (
        <React.Suspense fallback={null}>
          <WhatsNewModal
            version={currentVersion}
            isOpen={showWhatsNew}
            onClose={handleWhatsNewClose}
          />
        </React.Suspense>
      )}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
          },
          success: {
            iconTheme: {
              primary: 'hsl(var(--success))',
              secondary: 'hsl(var(--background))',
            },
          },
          error: {
            iconTheme: {
              primary: 'hsl(var(--destructive))',
              secondary: 'hsl(var(--background))',
            },
          },
        }}
      />
    </>
  );
};

const AppLoadingFallback: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-5 w-5 animate-spin text-primary" />
  </div>
);
