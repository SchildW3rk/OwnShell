import type { IpcRenderer } from 'electron';

export function createVaultApi(ipcRenderer: IpcRenderer) {
  return {
    // Credentials
    credentials: {
      getAll: () => ipcRenderer.invoke('vault:credentials:get-all'),
      getById: (id: string) => ipcRenderer.invoke('vault:credentials:get-by-id', id),
      create: (data: {
        title: string;
        username: string | null;
        password: string;
        url: string | null;
        notes: string | null;
        tags: string[] | null;
      }) => ipcRenderer.invoke('vault:credentials:create', data),
      update: (
        id: string,
        data: {
          title?: string;
          username?: string | null;
          password?: string;
          url?: string | null;
          notes?: string | null;
          tags?: string[] | null;
          favorite?: number;
        }
      ) => ipcRenderer.invoke('vault:credentials:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('vault:credentials:delete', id),
      decryptPassword: (id: string) => ipcRenderer.invoke('vault:credentials:decrypt-password', id),
      openURL: (url: string) => ipcRenderer.invoke('vault:credentials:open-url', url),
      toggleFavorite: (id: string, favorite: number) =>
        ipcRenderer.invoke('vault:credentials:toggle-favorite', id, favorite),
    },
    // Environments
    environments: {
      getAll: () => ipcRenderer.invoke('vault:environments:get-all'),
      getById: (id: string) => ipcRenderer.invoke('vault:environments:get-by-id', id),
      getByProject: (project: string) =>
        ipcRenderer.invoke('vault:environments:get-by-project', project),
      create: (data: {
        name: string;
        project: string;
        description: string | null;
        variables: Array<{ key: string; value: string }>;
        host_id: string | null;
        default_remote_path: string | null;
      }) => ipcRenderer.invoke('vault:environments:create', data),
      update: (
        id: string,
        data: {
          name?: string;
          project?: string;
          description?: string | null;
          variables?: Array<{ key: string; value: string }>;
          host_id?: string | null;
          default_remote_path?: string | null;
          favorite?: number;
        }
      ) => ipcRenderer.invoke('vault:environments:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('vault:environments:delete', id),
      decryptVariables: (id: string) =>
        ipcRenderer.invoke('vault:environments:decrypt-variables', id),
      deployToSFTP: (envId: string, params: { connectionId: string; remotePath: string }) =>
        ipcRenderer.invoke('vault:environments:deploy-to-sftp', envId, params),
      getProjects: () => ipcRenderer.invoke('vault:environments:get-projects'),
      toggleFavorite: (id: string, favorite: number) =>
        ipcRenderer.invoke('vault:environments:toggle-favorite', id, favorite),
    },
  };
}
