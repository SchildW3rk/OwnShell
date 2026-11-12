import type { HttpMethod, RequestAuthType, RequestBodyType } from '@ownshell/core';

export type RawContentType = 'text' | 'json' | 'xml' | 'html';

export interface HttpRequestConfig {
  method: HttpMethod;
  url: string;
  params: string;
  headers: string;
  body: string;
  bodyType: RequestBodyType;
  rawContentType?: RawContentType;
  authType: RequestAuthType;
  authConfig: string;
  /** Collection the request lives in; used to resolve `inherit` auth. */
  collectionId?: string | null;
  networkHostId: string | null;
  environmentId: string | null;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Decoded text body; empty when the body is binary. */
  body: string;
  /** Raw bytes for binary bodies (images, PDFs, octet-stream, ...). */
  bodyBytes?: Uint8Array;
  time: number;
  size: number;
  /** Set for failures the UI can explain (see ApiRequestErrorCode). */
  errorCode?: string;
  errorDetail?: string;
  timings?: {
    prepareMs: number;
    headersMs: number;
    bodyReadMs: number;
    totalMs: number;
  };
}

export interface KeyValueItem {
  key: string;
  value: string;
  enabled: boolean;
}

export interface AuthConfig {
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  addTo?: 'header' | 'query';
}
