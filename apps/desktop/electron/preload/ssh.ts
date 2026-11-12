import type { IpcRenderer, IpcRendererEvent } from 'electron';

export interface TunnelStatusEvent {
  id: string;
  sessionId: string;
  config: { localPort: number; remoteHost: string; remotePort: number; description?: string };
  status: 'starting' | 'active' | 'error' | 'stopped';
  error?: string;
  connectedClients: number;
  bytesTransferred: { sent: number; received: number };
  createdAt: Date;
}

export function createSSHApi(ipcRenderer: IpcRenderer) {
  return {
    connect: (params: {
      hostId: string;
      hostname: string;
      port: number;
      username: string;
      passwordEncrypted?: string;
      privateKeyEncrypted?: string;
      passphraseEncrypted?: string;
      authType: 'password' | 'key';
      jumpHostId?: string | null; // Jump host to connect through (multi-hop SSH)
    }) => ipcRenderer.invoke('ssh:connect', params),
    // Fire-and-forget for minimal latency - no Promise overhead
    send: (sessionId: string, data: string): void => {
      ipcRenderer.send('ssh:send', { sessionId, data });
    },
    resize: (sessionId: string, cols: number, rows: number): void => {
      ipcRenderer.send('ssh:resize', { sessionId, cols, rows });
    },
    disconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', { sessionId }),
    // Detached Sessions API (v1.20.0)
    attach: (sessionId: string, viewerId: string) =>
      ipcRenderer.invoke('ssh:attach', { sessionId, viewerId }),
    detach: (sessionId: string, viewerId: string) =>
      ipcRenderer.invoke('ssh:detach', { sessionId, viewerId }),
    findSessionForHost: (hostId: string) =>
      ipcRenderer.invoke('ssh:findSessionForHost', { hostId }),
    getSessions: () => ipcRenderer.invoke('ssh:get-sessions'),
    // Data can be string (legacy) or Uint8Array (optimized binary transfer)
    onData: (callback: (event: { sessionId: string; data: string | Uint8Array }) => void) => {
      const subscription = (
        _event: IpcRendererEvent,
        data: { sessionId: string; data: string | Uint8Array }
      ) => {
        callback(data);
      };
      ipcRenderer.on('ssh:session:data', subscription);
      return () => ipcRenderer.removeListener('ssh:session:data', subscription);
    },
    onClosed: (callback: (event: { sessionId: string }) => void) => {
      const subscription = (_event: IpcRendererEvent, data: { sessionId: string }) => {
        callback(data);
      };
      ipcRenderer.on('ssh:session:closed', subscription);
      return () => ipcRenderer.removeListener('ssh:session:closed', subscription);
    },
    onError: (
      callback: (event: { sessionId: string; error: { message: string; name: string } }) => void
    ) => {
      const subscription = (
        _event: IpcRendererEvent,
        data: { sessionId: string; error: { message: string; name: string } }
      ) => {
        callback(data);
      };
      ipcRenderer.on('ssh:session:error', subscription);
      return () => ipcRenderer.removeListener('ssh:session:error', subscription);
    },
    // Detached Sessions Events (v1.20.0)
    onSessionIdleTimeout: (callback: (event: { sessionId: string; hostId: string }) => void) => {
      const subscription = (
        _event: IpcRendererEvent,
        data: { sessionId: string; hostId: string }
      ) => {
        callback(data);
      };
      ipcRenderer.on('ssh:session-idle-timeout', subscription);
      return () => ipcRenderer.removeListener('ssh:session-idle-timeout', subscription);
    },
  };
}

export function createSftpApi(ipcRenderer: IpcRenderer) {
  return {
    list: (sessionId: string, path: string) =>
      ipcRenderer.invoke('ssh:sftp:list', { sessionId, path }),
    download: (sessionId: string, remotePath: string) =>
      ipcRenderer.invoke('ssh:sftp:download', { sessionId, remotePath }),
    upload: (sessionId: string, remotePath: string) =>
      ipcRenderer.invoke('ssh:sftp:upload', { sessionId, remotePath }),
    delete: (sessionId: string, path: string) =>
      ipcRenderer.invoke('ssh:sftp:delete', { sessionId, path }),
    mkdir: (sessionId: string, path: string) =>
      ipcRenderer.invoke('ssh:sftp:mkdir', { sessionId, path }),
    rename: (sessionId: string, oldPath: string, newPath: string) =>
      ipcRenderer.invoke('ssh:sftp:rename', { sessionId, oldPath, newPath }),
    chmod: (sessionId: string, path: string, mode: number) =>
      ipcRenderer.invoke('ssh:sftp:chmod', { sessionId, path, mode }),
    readFile: (sessionId: string, path: string, maxSize?: number) =>
      ipcRenderer.invoke('ssh:sftp:read-file', { sessionId, path, maxSize }) as Promise<{
        success: boolean;
        content?: string;
        encoding?: 'utf-8' | 'latin1';
        size?: number;
        error?: { message: string };
      }>,
    writeFile: (sessionId: string, path: string, content: string, encoding: 'utf-8' | 'latin1') =>
      ipcRenderer.invoke('ssh:sftp:write-file', { sessionId, path, content, encoding }),

    // Temp file operations (for SQLite remote files)
    downloadToTemp: (sessionId: string, remotePath: string, prefix?: string) =>
      ipcRenderer.invoke('ssh:sftp:download-to-temp', {
        sessionId,
        remotePath,
        prefix,
      }) as Promise<{
        success: boolean;
        localPath?: string;
        remotePath?: string;
        error?: { message: string };
      }>,
    uploadFromTemp: (sessionId: string, localPath: string, remotePath: string) =>
      ipcRenderer.invoke('ssh:sftp:upload-from-temp', {
        sessionId,
        localPath,
        remotePath,
      }) as Promise<{
        success: boolean;
        error?: { message: string };
      }>,
    cleanupTemp: (localPath: string) =>
      ipcRenderer.invoke('ssh:sftp:cleanup-temp', { localPath }) as Promise<{
        success: boolean;
      }>,

    onProgress: (
      callback: (event: {
        sessionId: string;
        operation: 'download' | 'upload';
        remotePath: string;
        progress: { total: number; transferred: number; percentage: number };
      }) => void
    ) => {
      const subscription = (
        _event: IpcRendererEvent,
        data: {
          sessionId: string;
          operation: 'download' | 'upload';
          remotePath: string;
          progress: { total: number; transferred: number; percentage: number };
        }
      ) => {
        callback(data);
      };
      ipcRenderer.on('ssh:sftp:progress', subscription);
      return () => ipcRenderer.removeListener('ssh:sftp:progress', subscription);
    },
  };
}

export function createTunnelApi(ipcRenderer: IpcRenderer) {
  return {
    // Active tunnel operations
    start: (
      sessionId: string,
      config: { localPort: number; remoteHost: string; remotePort: number; description?: string }
    ) => ipcRenderer.invoke('ssh:tunnel:start', { sessionId, config }),
    stop: (tunnelId: string) => ipcRenderer.invoke('ssh:tunnel:stop', { tunnelId }),
    list: (sessionId: string) => ipcRenderer.invoke('ssh:tunnel:list', { sessionId }),
    discoverServices: (sessionId: string) =>
      ipcRenderer.invoke('ssh:tunnel:discover-services', { sessionId }),

    // Saved tunnel configs (database)
    getSaved: (hostId: string) => ipcRenderer.invoke('db:tunnels:get-by-host', hostId),
    getAutoStart: (hostId: string) => ipcRenderer.invoke('db:tunnels:get-auto-start', hostId),
    save: (tunnelConfig: {
      host_id: string;
      local_port: number;
      remote_host: string;
      remote_port: number;
      name: string;
      auto_start: boolean;
    }) => ipcRenderer.invoke('db:tunnels:create', tunnelConfig),
    update: (
      id: string,
      update: {
        local_port?: number;
        remote_host?: string;
        remote_port?: number;
        name?: string;
        auto_start?: boolean;
      }
    ) => ipcRenderer.invoke('db:tunnels:update', id, update),
    deleteSaved: (id: string) => ipcRenderer.invoke('db:tunnels:delete', id),

    // Status events
    onStatusChange: (callback: (state: TunnelStatusEvent) => void) => {
      const subscription = (_event: IpcRendererEvent, data: TunnelStatusEvent) => {
        callback(data);
      };
      ipcRenderer.on('ssh:tunnel:status', subscription);
      return () => ipcRenderer.removeListener('ssh:tunnel:status', subscription);
    },
  };
}
