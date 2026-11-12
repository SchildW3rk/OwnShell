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
  /** 1..600, default 30. */
  timeoutSeconds?: number;
  /** Default true. */
  followRedirects?: boolean;
  /** Default true. */
  verifyTls?: boolean;
  /** Renderer-chosen id so the send can be cancelled. */
  executionId?: string;
}

/** Why a 3xx was shown instead of followed. */
export type RedirectNotice = 'REDIRECT_OTHER_HOST' | 'REDIRECT_LIMIT';

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
  redirectNotice?: RedirectNotice;
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
