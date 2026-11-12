import type { IpcRenderer, IpcRendererEvent } from 'electron';

export interface SftpTransferProgressEvent {
  transferId: string;
  hostId: string;
  type: 'upload' | 'download';
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  localPath: string;
  remotePath: string;
  fileName: string;
  fileSize: number | null;
  transferred: number;
  percentage: number;
  error?: string;
}

export interface SftpQueueChangedEvent {
  totalCount: number;
  pendingCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

export function createSftpStandaloneApi(ipcRenderer: IpcRenderer) {
  return {
    // Connection management
    connect: (params: {
      hostId: string;
      hostname: string;
      port: number;
      username: string;
      authType: 'password' | 'key';
      passwordEncrypted?: string;
      privateKeyEncrypted?: string;
      passphraseEncrypted?: string;
      jumpHostId?: string | null;
      hostLabel?: string;
    }) => ipcRenderer.invoke('sftp:connect', params),
    disconnect: (connectionId: string) => ipcRenderer.invoke('sftp:disconnect', { connectionId }),
    getConnections: () => ipcRenderer.invoke('sftp:get-connections'),
    isConnected: (connectionId: string) =>
      ipcRenderer.invoke('sftp:is-connected', { connectionId }),

    // File operations
    list: (connectionId: string, path: string) =>
      ipcRenderer.invoke('sftp:list', { connectionId, path }),
    stat: (connectionId: string, path: string) =>
      ipcRenderer.invoke('sftp:stat', { connectionId, path }),
    mkdir: (connectionId: string, path: string) =>
      ipcRenderer.invoke('sftp:mkdir', { connectionId, path }),
    delete: (connectionId: string, path: string) =>
      ipcRenderer.invoke('sftp:delete', { connectionId, path }),
    rename: (connectionId: string, oldPath: string, newPath: string) =>
      ipcRenderer.invoke('sftp:rename', { connectionId, oldPath, newPath }),
    chmod: (connectionId: string, path: string, mode: number) =>
      ipcRenderer.invoke('sftp:chmod', { connectionId, path, mode }),
    readFile: (connectionId: string, path: string, maxSize?: number) =>
      ipcRenderer.invoke('sftp:read-file', { connectionId, path, maxSize }) as Promise<{
        success: boolean;
        content?: string;
        encoding?: 'utf-8' | 'latin1';
        size?: number;
        error?: { message: string };
      }>,
    writeFile: (
      connectionId: string,
      path: string,
      content: string,
      encoding: 'utf-8' | 'latin1'
    ) => ipcRenderer.invoke('sftp:write-file', { connectionId, path, content, encoding }),

    // File dialogs
    showSaveDialog: (params?: { defaultPath?: string; title?: string }) =>
      ipcRenderer.invoke('sftp:show-save-dialog', params || {}),
    showOpenDialog: (params?: { title?: string; multiple?: boolean; directories?: boolean }) =>
      ipcRenderer.invoke('sftp:show-open-dialog', params || {}),

    // Local filesystem operations (for standalone browser dual-pane)
    listLocalDirectory: (path: string) =>
      ipcRenderer.invoke('sftp:list-local-directory', { path }) as Promise<{
        success: boolean;
        files?: Array<{
          name: string;
          path: string;
          isDirectory: boolean;
          size: number;
          modifiedAt: number;
        }>;
        error?: { message: string };
      }>,
  };
}

export function createSftpTransferApi(ipcRenderer: IpcRenderer) {
  return {
    // Queue operations
    add: (params: {
      hostId: string;
      type: 'upload' | 'download';
      localPath: string;
      remotePath: string;
      fileSize?: number;
      priority?: number;
    }) => ipcRenderer.invoke('sftp:transfer:add', params),
    addBulk: (
      items: Array<{
        hostId: string;
        type: 'upload' | 'download';
        localPath: string;
        remotePath: string;
        fileSize?: number;
      }>
    ) => ipcRenderer.invoke('sftp:transfer:add-bulk', { items }),
    addDirectory: (params: {
      hostId: string;
      type: 'upload' | 'download';
      localPath: string;
      remotePath: string;
      connectionId: string;
    }) => ipcRenderer.invoke('sftp:transfer:add-directory', params),

    // Transfer control
    pause: (transferId: string) => ipcRenderer.invoke('sftp:transfer:pause', { transferId }),
    resume: (transferId: string) => ipcRenderer.invoke('sftp:transfer:resume', { transferId }),
    cancel: (transferId: string) => ipcRenderer.invoke('sftp:transfer:cancel', { transferId }),
    cancelAll: (hostId: string) => ipcRenderer.invoke('sftp:transfer:cancel-all', { hostId }),

    // Queue & history
    getQueue: () => ipcRenderer.invoke('sftp:transfer:get-queue'),
    getHistory: (limit?: number) => ipcRenderer.invoke('sftp:transfer:get-history', { limit }),
    clearHistory: (before?: number) =>
      ipcRenderer.invoke('sftp:transfer:clear-history', { before }),

    // Settings
    setParallel: (max: number) => ipcRenderer.invoke('sftp:transfer:set-parallel', { max }),
    getStats: () => ipcRenderer.invoke('sftp:transfer:get-stats'),

    // Events
    onProgress: (callback: (event: SftpTransferProgressEvent) => void) => {
      const subscription = (_event: IpcRendererEvent, data: SftpTransferProgressEvent) => {
        callback(data);
      };
      ipcRenderer.on('sftp:transfer:progress', subscription);
      return () => ipcRenderer.removeListener('sftp:transfer:progress', subscription);
    },
    onQueueChanged: (callback: (event: SftpQueueChangedEvent) => void) => {
      const subscription = (_event: IpcRendererEvent, data: SftpQueueChangedEvent) => {
        callback(data);
      };
      ipcRenderer.on('sftp:transfer:queue-changed', subscription);
      return () => ipcRenderer.removeListener('sftp:transfer:queue-changed', subscription);
    },
  };
}
