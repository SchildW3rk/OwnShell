/**
 * HTTP Methods supported by API Client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Request body type
 */
export type RequestBodyType = 'none' | 'json' | 'form-data' | 'form-urlencoded' | 'raw' | 'binary';

/**
 * Authentication type
 */
export type RequestAuthType = 'none' | 'bearer' | 'basic' | 'api-key' | 'inherit';

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
  sort_order: number; // For drag & drop ordering
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
  updated_at: number;
  last_executed_at?: number | null;
}
