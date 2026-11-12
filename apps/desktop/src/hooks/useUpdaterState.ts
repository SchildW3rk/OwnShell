import { useEffect, useRef, useState } from 'react';
import type { DownloadProgress, UpdateInfo, UpdateStatus } from '../../electron/preload/updates';

/**
 * Hydrates the updater state once and follows live updater events.
 * Once an update was found, background "checking"/"not available" events do not hide it.
 */
export function useUpdaterState() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<Pick<UpdateInfo, 'version' | 'licenseCoverage'> | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const hasUpdateRef = useRef(false);

  useEffect(() => {
    const applyUpdateInfo = (info: Pick<UpdateInfo, 'version' | 'licenseCoverage'>) => {
      setUpdateInfo(info);
      setError(null);
      hasUpdateRef.current = true;
    };

    window.electronAPI.updater
      .getState()
      .then((state) => {
        setAutoUpdateEnabled(state.autoUpdateEnabled);
        if (state.updateInfo) applyUpdateInfo(state.updateInfo);
        setProgress(state.progress ?? null);
        if (state.status !== 'error' || !hasUpdateRef.current) {
          setStatus(state.status);
          setError(state.error ?? null);
        }
      })
      .catch(() => {
        // State hydration is best-effort; live updater events still drive the UI.
      });

    const cleanupFns: (() => void)[] = [
      window.electronAPI.updater.onChecking(() => {
        if (!hasUpdateRef.current) {
          setStatus('checking');
          setError(null);
        }
      }),
      window.electronAPI.updater.onUpdateAvailable((info) => {
        applyUpdateInfo(info);
        setStatus('available');
      }),
      window.electronAPI.updater.onUpdateNotAvailable(() => {
        // A manual check sets 'checking' locally; always resolve that, otherwise keep a found update.
        setStatus((prev) => (hasUpdateRef.current && prev !== 'checking' ? prev : 'idle'));
      }),
      window.electronAPI.updater.onDownloadProgress((prog) => {
        setStatus('downloading');
        setProgress(prog);
      }),
      window.electronAPI.updater.onUpdateDownloaded((info) => {
        applyUpdateInfo(info);
        setStatus('ready');
        setProgress(null);
      }),
      window.electronAPI.updater.onError((err) => {
        setStatus('error');
        setError(err.message);
      }),
    ];

    return () => {
      for (const cleanup of cleanupFns) cleanup();
    };
  }, []);

  return {
    status,
    setStatus,
    updateInfo,
    progress,
    error,
    setError,
    autoUpdateEnabled,
    setAutoUpdateEnabled,
  };
}
