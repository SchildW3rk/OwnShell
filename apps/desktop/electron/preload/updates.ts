import type { IpcRenderer, IpcRendererEvent } from 'electron';
import type { UpdateLicenseCoverage } from '../license/types';

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
  /** 'uncovered' when the stored license's updatesUntil is before this release. */
  licenseCoverage?: UpdateLicenseCoverage;
}

export interface UpdateNotAvailableInfo {
  version: string;
}

export interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateError {
  message: string;
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdaterState {
  status: UpdateStatus;
  updateInfo?: UpdateInfo;
  progress?: DownloadProgress;
  error?: string;
  autoUpdateEnabled: boolean;
  updatedAt: number;
}

export function createReleasesApi(ipcRenderer: IpcRenderer) {
  return {
    getChangelog: (version: string) =>
      ipcRenderer.invoke('releases:changelog', version) as Promise<{
        success: boolean;
        release?: {
          version: string;
          name: string;
          body: string;
          publishedAt: string;
        };
        error?: string;
      }>,
    getLatest: () =>
      ipcRenderer.invoke('releases:latest') as Promise<{
        success: boolean;
        release?: {
          version: string;
          name: string;
          body: string;
          publishedAt: string;
        };
        error?: string;
      }>,
    getAll: (limit?: number) =>
      ipcRenderer.invoke('releases:all', limit) as Promise<{
        success: boolean;
        releases?: Array<{
          version: string;
          name: string;
          body: string;
          publishedAt: string;
        }>;
        error?: string;
      }>,
  };
}

export function createUpdaterApi(ipcRenderer: IpcRenderer) {
  return {
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    downloadUpdate: () => ipcRenderer.invoke('updater:download'),
    installUpdate: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:version'),
    getState: () => ipcRenderer.invoke('updater:getState') as Promise<UpdaterState>,
    // Auto-update setting (v1.22.0)
    getAutoUpdate: () =>
      ipcRenderer.invoke('updater:getAutoUpdate') as Promise<{ enabled: boolean }>,
    setAutoUpdate: (enabled: boolean) =>
      ipcRenderer.invoke('updater:setAutoUpdate', enabled) as Promise<{
        success: boolean;
        error?: string;
      }>,

    // Events from main process
    onChecking: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('updater:checking', handler);
      return () => ipcRenderer.removeListener('updater:checking', handler);
    },
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
      const handler = (_event: IpcRendererEvent, info: UpdateInfo) => callback(info);
      ipcRenderer.on('updater:available', handler);
      return () => ipcRenderer.removeListener('updater:available', handler);
    },
    onUpdateNotAvailable: (callback: (info: UpdateNotAvailableInfo) => void) => {
      const handler = (_event: IpcRendererEvent, info: UpdateNotAvailableInfo) => callback(info);
      ipcRenderer.on('updater:not-available', handler);
      return () => ipcRenderer.removeListener('updater:not-available', handler);
    },
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
      const handler = (_event: IpcRendererEvent, progress: DownloadProgress) => callback(progress);
      ipcRenderer.on('updater:progress', handler);
      return () => ipcRenderer.removeListener('updater:progress', handler);
    },
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => {
      const handler = (_event: IpcRendererEvent, info: UpdateInfo) => callback(info);
      ipcRenderer.on('updater:downloaded', handler);
      return () => ipcRenderer.removeListener('updater:downloaded', handler);
    },
    onError: (callback: (error: UpdateError) => void) => {
      const handler = (_event: IpcRendererEvent, error: UpdateError) => callback(error);
      ipcRenderer.on('updater:error', handler);
      return () => ipcRenderer.removeListener('updater:error', handler);
    },
  };
}
