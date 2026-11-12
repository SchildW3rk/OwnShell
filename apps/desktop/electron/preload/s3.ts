import type { IpcRenderer } from 'electron';

export function createS3ConnectionsApi(ipcRenderer: IpcRenderer) {
  return {
    getAll: () => ipcRenderer.invoke('db:s3:get-all'),
    getById: (id: string) => ipcRenderer.invoke('db:s3:get-by-id', id),
    create: (data: {
      label: string;
      endpoint: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucketName?: string;
      favorite?: number;
      folder_id?: string | null;
      sort_order?: number;
    }) => ipcRenderer.invoke('db:s3:create', data),
    update: (
      id: string,
      update: {
        label?: string;
        endpoint?: string;
        region?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        bucketName?: string | null;
        favorite?: number;
        folder_id?: string | null;
        sort_order?: number;
      }
    ) => ipcRenderer.invoke('db:s3:update', id, update),
    delete: (id: string) => ipcRenderer.invoke('db:s3:delete', id),
  };
}

export function createS3Api(ipcRenderer: IpcRenderer) {
  return {
    testConnection: (config: {
      endpoint: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    }) => ipcRenderer.invoke('s3:test-connection', config),
    listBuckets: (connectionId: string) => ipcRenderer.invoke('s3:list-buckets', connectionId),
    listObjects: (params: {
      connectionId: string;
      bucket: string;
      prefix?: string;
      continuationToken?: string;
    }) => ipcRenderer.invoke('s3:list-objects', params),
    deleteObjects: (params: { connectionId: string; bucket: string; keys: string[] }) =>
      ipcRenderer.invoke('s3:delete-objects', params),
    getPresignedUrl: (params: {
      connectionId: string;
      bucket: string;
      key: string;
      expiresIn?: number;
    }) => ipcRenderer.invoke('s3:get-presigned-url', params),
    getCORS: (params: { connectionId: string; bucket: string }) =>
      ipcRenderer.invoke('s3:get-cors', params),
    putCORS: (params: {
      connectionId: string;
      bucket: string;
      rules: Array<{
        id?: string;
        allowedOrigins: string[];
        allowedMethods: ('GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD')[];
        allowedHeaders?: string[];
        exposeHeaders?: string[];
        maxAgeSeconds?: number;
      }>;
    }) => ipcRenderer.invoke('s3:put-cors', params),
    deleteCORS: (params: { connectionId: string; bucket: string }) =>
      ipcRenderer.invoke('s3:delete-cors', params),
  };
}
