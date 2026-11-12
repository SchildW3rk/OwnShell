import type {
  HttpMethod,
  RequestAuthType,
  RequestBodyType,
  VaultEnvironmentsTable,
} from '@ownshell/core';

export interface HttpRequestConfig {
  method: HttpMethod;
  url: string;
  params: string;
  headers: string;
  body: string;
  bodyType: RequestBodyType;
  authType: RequestAuthType;
  authConfig: string;
  networkHostId: string | null;
  environmentId: string | null;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
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

export interface EnvironmentVariable {
  key: string;
  value_encrypted: string;
}

export type HttpEnvironment = VaultEnvironmentsTable | null;
