/**
 * HTTP Methods supported by API Client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Request body type
 */
export type RequestBodyType = 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary' | 'graphql';

/**
 * Request kind (migration 019): an HTTP request or a WebSocket connection
 */
export type ApiRequestKind = 'http' | 'websocket';

/**
 * Authentication type
 */
export type RequestAuthType = 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'inherit';

/**
 * Content type of a raw request body
 */
export type RawRequestContentType = 'text' | 'json' | 'xml' | 'html';

/**
 * API Collections table (v1.18.0)
 * Folders for organizing API requests (supports nesting)
 */
export interface ApiCollectionsTable {
  id: string; // UUID v4
  parent_id: string | null; // Self-referencing FK for nested folders
  name: string; // Display name, e.g., "User APIs", "Auth Endpoints"
  description: string | null; // Optional description
  sort_order: number; // For drag & drop ordering
  auth_type: RequestAuthType; // 'inherit' = use parent folder's auth (root: none)
  auth_config: string; // JSON, same shape as api_requests.auth_config
  variables: string; // JSON: [{ id, key, value, enabled, secret, value_encrypted? }] (migration 017)
  created_at: number; // Unix timestamp in milliseconds
  updated_at: number; // Unix timestamp in milliseconds
}

export interface NewApiCollection {
  id: string;
  parent_id: string | null;
  name: string;
  description?: string | null;
  sort_order?: number;
  auth_type?: RequestAuthType;
  auth_config?: string;
  variables?: string;
  created_at: number;
  updated_at: number;
}

export interface ApiCollectionUpdate {
  parent_id?: string | null;
  name?: string;
  description?: string | null;
  sort_order?: number;
  auth_type?: RequestAuthType;
  auth_config?: string;
  variables?: string;
  updated_at: number;
}

/**
 * API Requests table (v1.18.0)
 * Individual HTTP requests with full configuration
 */
export interface ApiRequestsTable {
  id: string; // UUID v4
  collection_id: string | null; // FK to api_collections (null = root level)
  name: string; // Display name, e.g., "Get Users", "Create Post"
  method: HttpMethod; // HTTP method
  url: string; // URL with optional {{variables}}, e.g., "{{BASE_URL}}/api/users"
  params: string; // JSON: [{ key, value, enabled }]
  headers: string; // JSON: [{ key, value, enabled }]
  body: string; // Raw body content
  body_type: RequestBodyType; // Body content type
  raw_content_type: RawRequestContentType; // Content-Type for body_type 'raw'
  auth_type: RequestAuthType; // Authentication type
  auth_config: string; // JSON: { token, username, password, key, value, addTo }
  network_host_id: string | null; // FK to hosts (for SSH tunneling) - null = direct
  environment_id: string | null; // FK to vault_environments (for {{variables}})
  sort_order: number; // Manual order within the folder
  timeout_seconds: number | null; // 1..600, null = 30 (migration 016)
  follow_redirects: number | null; // 0/1, null = follow
  verify_tls: number | null; // 0/1, null = verify
  variables: string; // JSON: [{ key, value, enabled }] request-level variables (migration 017)
  cookie_jar: number | null; // 0/1, null = use the cookie jar (migration 018)
  kind: ApiRequestKind; // migration 019
  assertions: string; // JSON: runner assertions [{ id, enabled, type, ... }] (migration 019)
  captures: string; // JSON: runner captures [{ id, enabled, variable, path }] (migration 019)
  created_at: number; // Unix timestamp in milliseconds
  updated_at: number; // Unix timestamp in milliseconds
  last_executed_at: number | null; // Track last execution
}

export interface NewApiRequest {
  id: string;
  collection_id?: string | null;
  name: string;
  method?: HttpMethod;
  url?: string;
  params?: string;
  headers?: string;
  body?: string;
  body_type?: RequestBodyType;
  raw_content_type?: RawRequestContentType;
  auth_type?: RequestAuthType;
  auth_config?: string;
  network_host_id?: string | null;
  environment_id?: string | null;
  sort_order?: number;
  timeout_seconds?: number | null;
  follow_redirects?: number | null;
  verify_tls?: number | null;
  variables?: string;
  cookie_jar?: number | null;
  kind?: ApiRequestKind;
  assertions?: string;
  captures?: string;
  created_at: number;
  updated_at: number;
  last_executed_at?: number | null;
}

export interface ApiRequestUpdate {
  collection_id?: string | null;
  name?: string;
  method?: HttpMethod;
  url?: string;
  params?: string;
  headers?: string;
  body?: string;
  body_type?: RequestBodyType;
  raw_content_type?: RawRequestContentType;
  auth_type?: RequestAuthType;
  auth_config?: string;
  network_host_id?: string | null;
  environment_id?: string | null;
  sort_order?: number;
  timeout_seconds?: number | null;
  follow_redirects?: number | null;
  verify_tls?: number | null;
  variables?: string;
  cookie_jar?: number | null;
  kind?: ApiRequestKind;
  assertions?: string;
  captures?: string;
  updated_at: number;
  last_executed_at?: number | null;
}

/**
 * API request history (migration 017): the last executions, without bodies, headers
 * or resolved secrets. `url` is the template with {{placeholders}}.
 */
export interface ApiRequestHistoryTable {
  id: string;
  request_id: string | null;
  method: HttpMethod;
  url: string;
  status: number; // 0 = failed before a response
  duration_ms: number;
  response_size: number;
  created_at: number; // Unix timestamp in milliseconds
}

/**
 * Cached OAuth 2.0 tokens (migration 018), one row per auth owner
 * ('request:<id>' / 'collection:<id>'). Tokens are encrypted with the master key,
 * never sent to the renderer and never part of a backup.
 */
export interface ApiOAuthTokensTable {
  owner_key: string;
  fingerprint: string; // hash of grant, URLs, client id, scopes, audience: a changed config ignores the token
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: number | null; // Unix ms, null = no expiry given
  updated_at: number;
}

/** API client cookie jar (migration 018); values encrypted, never in history, export or backup. */
export interface ApiCookiesTable {
  id: string;
  domain: string;
  path: string;
  name: string;
  value_encrypted: string;
  host_only: number; // 1 = no Domain attribute: only the exact host
  secure: number;
  expires_at: number | null; // Unix ms, null = session cookie
  created_at: number;
}
