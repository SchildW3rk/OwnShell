import type { IpcRenderer, IpcRendererEvent } from 'electron';
import type { RunRequestResult, RunSummary } from '../http/collection-runner';
import type { StreamMessage } from '../http/sse';
import type { WebSocketConnectResult, WebSocketEvent } from '../ipc/api-client/websocket';
import type { ApiRequestHistoryTable } from '@ownshell/core';
import type { ImportCounts } from '../http/api-import';
import type { PublicVariable, VariableInput } from '../http/api-variables';
import type { ImportErrorCode, ImportWarningCode, PostmanEnvironmentImport } from '../http/postman-import';
import type { HttpRequestConfig, HttpResponse } from '../http/types';

type RequestSettingsColumns = {
  timeout_seconds?: number | null;
  follow_redirects?: 0 | 1 | null;
  verify_tls?: 0 | 1 | null;
  /** Request-level variables, JSON [{ key, value, enabled }]. */
  variables?: string;
  /** 0 = cookie jar off for this request; null = on. */
  cookie_jar?: 0 | 1 | null;
  kind?: 'http' | 'websocket';
  /** Runner assertions / captures, JSON arrays. */
  assertions?: string;
  captures?: string;
};

/** Owner of an OAuth 2.0 auth config (and its cached token). */
export type ApiAuthOwner = { type: 'request' | 'collection'; id: string };

/** A jar cookie as the renderer sees it: never the value. */
export interface ApiCookieInfo {
  id: string;
  domain: string;
  path: string;
  name: string;
  host_only: number;
  secure: number;
  expires_at: number | null;
}

export type ApiImportResult =
  | (ImportCounts & { kind: 'collection'; warnings: Partial<Record<ImportWarningCode, number>> })
  | PostmanEnvironmentImport
  | { errorCode: ImportErrorCode }
  | null;

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
        auth_type?: 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'inherit';
        auth_config?: string;
      }) => ipcRenderer.invoke('api:collections:create', data),
      update: (
        id: string,
        data: {
          name?: string;
          parent_id?: string | null;
          description?: string | null;
          sort_order?: number;
          auth_type?: 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'inherit';
          auth_config?: string;
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
        body_type?: 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary' | 'graphql';
        raw_content_type?: 'text' | 'json' | 'xml' | 'html';
        auth_type?: 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'inherit';
        auth_config?: string;
        network_host_id?: string | null;
        environment_id?: string | null;
        sort_order?: number;
      } & RequestSettingsColumns) => ipcRenderer.invoke('api:requests:create', data),
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
          body_type?: 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary' | 'graphql';
          raw_content_type?: 'text' | 'json' | 'xml' | 'html';
          auth_type?: 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'inherit';
          auth_config?: string;
          network_host_id?: string | null;
          environment_id?: string | null;
          sort_order?: number;
          last_executed_at?: number | null;
        } & RequestSettingsColumns
      ) => ipcRenderer.invoke('api:requests:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('api:requests:delete', id),
      duplicate: (id: string) => ipcRenderer.invoke('api:requests:duplicate', id),
      /**
       * Execute an HTTP request
       * @param config - Request configuration (environmentId used to auto-decrypt vault variables)
       * @returns HTTP response with status, headers, body, time, and size
       */
      execute: (config: HttpRequestConfig): Promise<HttpResponse> =>
        ipcRenderer.invoke('api:requests:execute', config),
      /** Cancels a running execute() started with the same `executionId`. */
      cancel: (executionId: string): Promise<void> =>
        ipcRenderer.invoke('api:requests:cancel', executionId),
      /** Live text/event-stream data of running executes (bounded batches). */
      onStream: (callback: (message: StreamMessage) => void) => {
        const subscription = (_event: IpcRendererEvent, message: StreamMessage) => callback(message);
        ipcRenderer.on('api:stream', subscription);
        return () => {
          ipcRenderer.removeListener('api:stream', subscription);
        };
      },
      /** Builds a curl command from the same preparation as a send. */
      exportCurl: (
        config: HttpRequestConfig,
        resolveVariables: boolean
      ): Promise<{ command?: string; errorCode?: string; errorDetail?: string; errorScopes?: string[] }> =>
        ipcRenderer.invoke('api:requests:export-curl', { config, resolveVariables }),
    },
    webSocket: {
      /** Opens a WebSocket with the same preparation as a send (auth, variables, SSH host, TLS setting). */
      connect: (connectionId: string, config: HttpRequestConfig): Promise<WebSocketConnectResult> =>
        ipcRenderer.invoke('api:ws:connect', { connectionId, config }),
      send: (connectionId: string, text: string): Promise<void> =>
        ipcRenderer.invoke('api:ws:send', { connectionId, text }),
      /** Closes an open connection or cancels a pending connect. */
      close: (connectionId: string): Promise<void> => ipcRenderer.invoke('api:ws:close', connectionId),
      onEvent: (callback: (event: WebSocketEvent) => void) => {
        const subscription = (_event: IpcRendererEvent, payload: WebSocketEvent) => callback(payload);
        ipcRenderer.on('api:ws:event', subscription);
        return () => {
          ipcRenderer.removeListener('api:ws:event', subscription);
        };
      },
    },
    runner: {
      /** Runs every saved request of a folder in order; cancel with requests.cancel(runId). */
      run: (runId: string, collectionId: string, stopOnFailure: boolean): Promise<RunSummary> =>
        ipcRenderer.invoke('api:runner:run', { runId, collectionId, stopOnFailure }),
      onProgress: (callback: (progress: { runId: string; result: RunRequestResult }) => void) => {
        const subscription = (_event: IpcRendererEvent, progress: { runId: string; result: RunRequestResult }) =>
          callback(progress);
        ipcRenderer.on('api:runner:progress', subscription);
        return () => {
          ipcRenderer.removeListener('api:runner:progress', subscription);
        };
      },
    },
    /** Saves new sort_order values for collections and requests in one transaction. */
    reorder: (changes: {
      collections: Array<{ id: string; sort_order: number }>;
      requests: Array<{ id: string; sort_order: number }>;
    }): Promise<void> => ipcRenderer.invoke('api:items:reorder', changes),
    variables: {
      /** Global API variables; secret values are never returned. */
      getGlobal: (): Promise<PublicVariable[]> => ipcRenderer.invoke('api:variables:get-global'),
      /** Replaces the variables of a folder, or the global ones when `collectionId` is null. */
      set: (collectionId: string | null, variables: VariableInput[]): Promise<void> =>
        ipcRenderer.invoke('api:variables:set', { collectionId, variables }),
    },
    history: {
      list: (): Promise<ApiRequestHistoryTable[]> => ipcRenderer.invoke('api:history:list'),
      clear: (): Promise<void> => ipcRenderer.invoke('api:history:clear'),
    },
    transfer: {
      /** Picks a Postman collection or environment file; null when cancelled. */
      importPostman: (): Promise<ApiImportResult> => ipcRenderer.invoke('api:import:postman'),
      importOwnShell: (): Promise<ApiImportResult> => ipcRenderer.invoke('api:import:ownshell'),
      exportOwnShell: (collectionId: string): Promise<{ filePath: string } | null> =>
        ipcRenderer.invoke('api:export:ownshell', collectionId),
    },
    oauth: {
      /** Whether a token is cached and when it expires; the token itself never leaves the main process. */
      status: (
        owner: ApiAuthOwner
      ): Promise<{ hasToken: boolean; expiresAt: number | null; canRefresh: boolean }> =>
        ipcRenderer.invoke('api:oauth:status', owner),
      /** Requests a new token (Authorization Code opens the system browser). */
      getToken: (
        config: HttpRequestConfig,
        owner: ApiAuthOwner
      ): Promise<{ ok: boolean; errorCode?: string; errorDetail?: string; errorScopes?: string[] }> =>
        ipcRenderer.invoke('api:oauth:get-token', { config, owner }),
      clearToken: (owner: ApiAuthOwner): Promise<void> => ipcRenderer.invoke('api:oauth:clear-token', owner),
    },
    cookies: {
      list: (): Promise<ApiCookieInfo[]> => ipcRenderer.invoke('api:cookies:list'),
      delete: (id: string): Promise<void> => ipcRenderer.invoke('api:cookies:delete', id),
      clear: (): Promise<void> => ipcRenderer.invoke('api:cookies:clear'),
    },
    files: {
      /** Opens a file dialog; returns null when cancelled. The main process re-validates the file on send. */
      pick: (): Promise<{ path: string; name: string; size: number; contentType: string } | null> =>
        ipcRenderer.invoke('api:files:pick'),
    },
  };
}
