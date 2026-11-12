import type { IpcRenderer } from 'electron';

export function createApiClientApi(ipcRenderer: IpcRenderer) {
  return {
    // Collections
    collections: {
      getAll: () => ipcRenderer.invoke('api:collections:get-all'),
      getById: (id: string) => ipcRenderer.invoke('api:collections:get-by-id', id),
      create: (data: {
        name: string;
        parent_id?: string | null;
        description?: string | null;
        sort_order?: number;
      }) => ipcRenderer.invoke('api:collections:create', data),
      update: (
        id: string,
        data: {
          name?: string;
          parent_id?: string | null;
          description?: string | null;
          sort_order?: number;
        }
      ) => ipcRenderer.invoke('api:collections:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('api:collections:delete', id),
    },
    // Requests
    requests: {
      getAll: () => ipcRenderer.invoke('api:requests:get-all'),
      getById: (id: string) => ipcRenderer.invoke('api:requests:get-by-id', id),
      getByCollection: (collectionId: string | null) =>
        ipcRenderer.invoke('api:requests:get-by-collection', collectionId),
      create: (data: {
        name: string;
        collection_id?: string | null;
        method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
        url?: string;
        params?: string;
        headers?: string;
        body?: string;
        body_type?: 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary';
        auth_type?: 'none' | 'bearer' | 'basic' | 'api-key' | 'inherit';
        auth_config?: string;
        network_host_id?: string | null;
        environment_id?: string | null;
        sort_order?: number;
      }) => ipcRenderer.invoke('api:requests:create', data),
      update: (
        id: string,
        data: {
          name?: string;
          collection_id?: string | null;
          method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
          url?: string;
          params?: string;
          headers?: string;
          body?: string;
          body_type?: 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary';
          auth_type?: 'none' | 'bearer' | 'basic' | 'api-key' | 'inherit';
          auth_config?: string;
          network_host_id?: string | null;
          environment_id?: string | null;
          sort_order?: number;
          last_executed_at?: number | null;
        }
      ) => ipcRenderer.invoke('api:requests:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('api:requests:delete', id),
      duplicate: (id: string) => ipcRenderer.invoke('api:requests:duplicate', id),
      /**
       * Execute an HTTP request
       * @param config - Request configuration (environmentId used to auto-decrypt vault variables)
       * @returns HTTP response with status, headers, body, time, and size
       */
      execute: (config: {
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
        url: string;
        params: string;
        headers: string;
        body: string;
        bodyType: 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary';
        authType: 'none' | 'bearer' | 'basic' | 'api-key' | 'inherit';
        authConfig: string;
        networkHostId: string | null;
        environmentId: string | null;
      }) => ipcRenderer.invoke('api:requests:execute', config),
    },
  };
}
