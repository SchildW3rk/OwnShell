/**
 * Vault Credentials table (v1.17.0)
 * Secure storage for login credentials, passwords, and sensitive data
 */
export interface VaultCredentialsTable {
  id: string; // UUID v4
  title: string; // Display name, e.g., "GitHub Account", "AWS Console"
  username: string | null; // Login/Email/Username
  password_encrypted: string; // AES-256-GCM encrypted password
  url: string | null; // Website URL (auto-launch capability)
  notes: string | null; // Additional notes/description
  tags: string | null; // JSON stringified array: ["work", "personal"]
  favorite: number; // SQLite boolean (0/1) for favorites
  created_at: number; // Unix timestamp in milliseconds
  updated_at: number; // Unix timestamp in milliseconds
  last_used_at: number | null; // Tracking for "Recently Used" feature
}

export interface NewVaultCredential {
  id: string;
  title: string;
  username: string | null;
  password_encrypted: string;
  url: string | null;
  notes: string | null;
  tags: string | null;
  favorite: number;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
}

export interface VaultCredentialUpdate {
  title?: string;
  username?: string | null;
  password_encrypted?: string;
  url?: string | null;
  notes?: string | null;
  tags?: string | null;
  favorite?: number;
  updated_at: number;
  last_used_at?: number | null;
}

/**
 * Vault Environments table (v1.17.0)
 * Manage environment variable sets for different projects/stages
 */
export interface VaultEnvironmentsTable {
  id: string; // UUID v4
  name: string; // ENV set name, e.g., "Frontend Production"
  project: string; // Project grouping, e.g., "Frontend", "Backend"
  description: string | null; // Optional description
  variables: string; // JSON stringified array: [{key: "API_KEY", value_encrypted: "..."}]
  host_id: string | null; // Optional FK to hosts table (linked SFTP server)
  default_remote_path: string | null; // Default .env path on server, e.g., "/var/www/.env"
  favorite: number; // SQLite boolean (0/1) for favorites
  created_at: number; // Unix timestamp in milliseconds
  updated_at: number; // Unix timestamp in milliseconds
  last_deployed_at: number | null; // Track last SFTP deployment
}

export interface NewVaultEnvironment {
  id: string;
  name: string;
  project: string;
  description: string | null;
  variables: string; // JSON: [{key: "API_KEY", value_encrypted: "..."}]
  host_id: string | null;
  default_remote_path: string | null;
  favorite: number;
  created_at: number;
  updated_at: number;
  last_deployed_at: number | null;
}

export interface VaultEnvironmentUpdate {
  name?: string;
  project?: string;
  description?: string | null;
  variables?: string;
  host_id?: string | null;
  default_remote_path?: string | null;
  favorite?: number;
  updated_at: number;
  last_deployed_at?: number | null;
}
