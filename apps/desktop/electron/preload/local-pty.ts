import type { IpcRenderer, IpcRendererEvent } from 'electron';

export function createLocalPtyApi(ipcRenderer: IpcRenderer) {
  return {
    create: (params?: {
      shell?: string;
      cwd?: string;
      cols?: number;
      rows?: number;
      env?: Record<string, string>;
    }) =>
      ipcRenderer.invoke('pty:create', params) as Promise<{
        success: boolean;
        sessionId?: string;
        pid?: number;
        error?: string;
      }>,
    write: (sessionId: string, data: string): void => {
      ipcRenderer.send('pty:write', { sessionId, data });
    },
    resize: (sessionId: string, cols: number, rows: number): void => {
      ipcRenderer.send('pty:resize', { sessionId, cols, rows });
    },
    kill: (sessionId: string) => ipcRenderer.invoke('pty:kill', sessionId),
    onData: (callback: (event: { sessionId: string; data: string }) => void) => {
      const subscription = (
        _event: IpcRendererEvent,
        data: { sessionId: string; data: string }
      ) => {
        callback(data);
      };
      ipcRenderer.on('pty:data', subscription);
      return () => ipcRenderer.removeListener('pty:data', subscription);
    },
    onExit: (
      callback: (event: { sessionId: string; exitCode: number; signal?: number }) => void
    ) => {
      const subscription = (
        _event: IpcRendererEvent,
        data: { sessionId: string; exitCode: number; signal?: number }
      ) => {
        callback(data);
      };
      ipcRenderer.on('pty:exit', subscription);
      return () => ipcRenderer.removeListener('pty:exit', subscription);
    },
  };
}

