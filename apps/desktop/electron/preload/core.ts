import type { IpcRenderer, IpcRendererEvent } from 'electron';
import type { LicenseInfo } from '../license/types';
import type { VaultCounts } from '../backup/types';

export function createCryptoApi(ipcRenderer: IpcRenderer) {
  return {
    isSetup: () => ipcRenderer.invoke('crypto:is-setup'),
    initialize: (password: string) =>
      ipcRenderer.invoke('crypto:initialize', password) as Promise<{
        success: boolean;
        recoveryKey: string;
      }>,
    unlock: (password: string) => ipcRenderer.invoke('crypto:unlock', password),
    completeSetup: () =>
      ipcRenderer.invoke('crypto:complete-setup') as Promise<{
        success: boolean;
        error?: string;
      }>,
    lock: () => ipcRenderer.invoke('crypto:lock'),
    isUnlocked: () => ipcRenderer.invoke('crypto:is-unlocked'),
    encryptData: (plaintext: string) => ipcRenderer.invoke('crypto:encrypt-data', plaintext),
    decryptData: (encrypted: string) => ipcRenderer.invoke('crypto:decrypt-data', encrypted),
    resetWithRecovery: (recoveryKey: string, newPassword: string) =>
      ipcRenderer.invoke('crypto:reset-with-recovery', recoveryKey, newPassword) as Promise<{
        success: boolean;
        error?: string;
        newRecoveryKey?: string;
      }>,
    getAutoLockTimeout: () => ipcRenderer.invoke('crypto:get-auto-lock-timeout') as Promise<number>,
    setAutoLockTimeout: (minutes: number) =>
      ipcRenderer.invoke('crypto:set-auto-lock-timeout', minutes) as Promise<{
        success: boolean;
        error?: string;
      }>,
    onAutoLocked: (callback: (reason: string) => void) => {
      const subscription = (_event: IpcRendererEvent, data: { reason: string }) => {
        callback(data.reason);
      };
      ipcRenderer.on('auth:auto-locked', subscription);
      return () => ipcRenderer.removeListener('auth:auto-locked', subscription);
    },
  };
}

export function createHostsApi(ipcRenderer: IpcRenderer) {
  return {
    getAll: () => ipcRenderer.invoke('db:hosts:get-all'),
    getById: (id: string) => ipcRenderer.invoke('db:hosts:get-by-id', id),
    create: (host: Record<string, unknown>) => ipcRenderer.invoke('db:hosts:create', host),
    update: (id: string, update: Record<string, unknown>) =>
      ipcRenderer.invoke('db:hosts:update', id, update),
    delete: (id: string) => ipcRenderer.invoke('db:hosts:delete', id),
    resetHostKey: (id: string) => ipcRenderer.invoke('db:hosts:reset-host-key', id),
    /**
     * Validate jump host chain for circular references
     * @param hostId - The host being configured (null for new hosts)
     * @param jumpHostId - The proposed jump host ID
     * @returns { valid: boolean, error?: string, chain?: string[] }
     */
    validateJumpChain: (hostId: string | null, jumpHostId: string) =>
      ipcRenderer.invoke('db:hosts:validate-jump-chain', { hostId, jumpHostId }),
  };
}

export function createSidebarFoldersApi(ipcRenderer: IpcRenderer) {
  return {
    getAll: (resourceType?: 'hosts' | 's3' | 'databases') =>
      ipcRenderer.invoke('db:sidebar-folders:get-all', resourceType),
    create: (data: {
      resource_type: 'hosts' | 's3' | 'databases';
      name: string;
      sort_order?: number;
    }) => ipcRenderer.invoke('db:sidebar-folders:create', data),
    update: (id: string, update: { name?: string; sort_order?: number }) =>
      ipcRenderer.invoke('db:sidebar-folders:update', id, update),
    delete: (id: string) => ipcRenderer.invoke('db:sidebar-folders:delete', id),
  };
}

export function createKeysApi(ipcRenderer: IpcRenderer) {
  return {
    getAll: () => ipcRenderer.invoke('db:keys:get-all'),
    getById: (id: string) => ipcRenderer.invoke('db:keys:get-by-id', id),
    create: (key: Record<string, unknown>) => ipcRenderer.invoke('db:keys:create', key),
    update: (id: string, update: Record<string, unknown>) =>
      ipcRenderer.invoke('db:keys:update', id, update),
    delete: (id: string) => ipcRenderer.invoke('db:keys:delete', id),
    getByType: (type: 'rsa' | 'ed25519') => ipcRenderer.invoke('db:keys:get-by-type', type),
  };
}

export function createFilePickerApi(ipcRenderer: IpcRenderer) {
  return {
    openSSHKey: () => ipcRenderer.invoke('file-picker:open-ssh-key'),
    openSQLiteFile: () =>
      ipcRenderer.invoke('file-picker:open-sqlite-file') as Promise<{
        success: boolean;
        filePath?: string;
        error?: string;
      }>,
  };
}

export function createSettingsApi(ipcRenderer: IpcRenderer) {
  return {
    get: (key: string) => ipcRenderer.invoke('db:settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('db:settings:set', key, value),
    getAll: () => ipcRenderer.invoke('db:settings:get-all'),
  };
}

export function createSnippetsApi(ipcRenderer: IpcRenderer) {
  return {
    list: (category?: string) => ipcRenderer.invoke('db:snippets:list', category),
    create: (data: { label: string; command: string; category?: string }) =>
      ipcRenderer.invoke('db:snippets:create', data),
    update: (id: string, update: { label?: string; command?: string; category?: string | null }) =>
      ipcRenderer.invoke('db:snippets:update', id, update),
    delete: (id: string) => ipcRenderer.invoke('db:snippets:delete', id),
    getCategories: () => ipcRenderer.invoke('db:snippets:get-categories'),
  };
}

export function createBackupApi(ipcRenderer: IpcRenderer) {
  return {
    export: (password: string) =>
      ipcRenderer.invoke('system:backup:export', password) as Promise<{
        success: boolean;
        filePath?: string;
        error?: string;
      }>,
    import: (password: string) =>
      ipcRenderer.invoke('system:backup:import', password) as Promise<{
        success: boolean;
        counts?: VaultCounts;
        error?: string;
      }>,
    preview: (password: string) =>
      ipcRenderer.invoke('system:backup:preview', password) as Promise<{
        success: boolean;
        preview?: {
          exportedAt: number;
          appVersion: string;
          counts: VaultCounts;
        };
        error?: string;
      }>,
  };
}

export function createLicenseApi(ipcRenderer: IpcRenderer) {
  return {
    getStatus: () =>
      ipcRenderer.invoke('license:get-status') as Promise<LicenseInfo>,
    activate: (key: string) =>
      ipcRenderer.invoke('license:activate', key) as Promise<{
        success: boolean;
        error?: string;
        info?: LicenseInfo;
      }>,
    startTrial: () =>
      ipcRenderer.invoke('license:start-trial') as Promise<{
        success: boolean;
        errorCode?: string;
        info?: LicenseInfo;
      }>,
    deactivate: () =>
      ipcRenderer.invoke('license:deactivate') as Promise<{
        success: boolean;
        error?: string;
        requiresOnline?: boolean;
      }>,
    isValid: () => ipcRenderer.invoke('license:is-valid') as Promise<boolean>,
  };
}

export function createAppApi(ipcRenderer: IpcRenderer) {
  return {
    quit: () => ipcRenderer.invoke('app:quit'),
  };
}
