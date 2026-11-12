import type { IpcRenderer } from 'electron';

export function createNativeSshApi(ipcRenderer: IpcRenderer) {
  return {
    create: (params: { hostId: string; cols?: number; rows?: number }) =>
      ipcRenderer.invoke('native-ssh:create', params) as Promise<{
        success: boolean;
        sessionId?: string;
        pid?: number;
        error?: string;
      }>,
  };
}
