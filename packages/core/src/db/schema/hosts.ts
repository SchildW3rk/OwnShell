/**
 * Host connection type (v1.16.0)
 * - 'ssh': Full SSH connection (terminal + SFTP)
 * - 'sftp_only': SFTP-only connection (no terminal)
 */
export type HostConnectionType = 'ssh' | 'sftp_only';

export interface HostsTable {
  id: string; // UUID v4
  label: string; // Display name e.g., "Production Server"
  hostname: string; // IP address or domain
  port: number; // Default: 22
  username: string;
  auth_type: 'password' | 'key';
  password_encrypted: string | null; // AES-256-GCM encrypted, null if using key
  key_id: string | null; // Foreign key to keys table, null if using password
  jump_host_id: string | null; // Self-referencing FK for SSH jump host (bastion/gateway)
  connection_type: HostConnectionType; // v1.16.0: 'ssh' (default) or 'sftp_only'
  favorite: number; // SQLite boolean (0/1) for sidebar favorites
  folder_id: string | null; // Optional sidebar folder
  sort_order: number; // Manual ordering hook for sidebar organization
  host_key_fingerprint?: string | null; // TOFU SSH host key ("SHA256:<base64>"), null until first connect; not part of backups
  created_at: number; // Unix timestamp in milliseconds
  updated_at: number; // Unix timestamp in milliseconds
}

export interface NewHost {
  id: string;
  label: string;
  hostname: string;
  port: number;
  username: string;
  auth_type: 'password' | 'key';
  password_encrypted: string | null;
  key_id: string | null;
  jump_host_id: string | null;
  connection_type?: HostConnectionType; // v1.16.0: defaults to 'ssh'
  favorite?: number;
  folder_id?: string | null;
  sort_order?: number;
  created_at: number;
  updated_at: number;
}

export interface HostUpdate {
  label?: string;
  hostname?: string;
  port?: number;
  username?: string;
  auth_type?: 'password' | 'key';
  password_encrypted?: string | null;
  key_id?: string | null;
  jump_host_id?: string | null;
  connection_type?: HostConnectionType; // v1.16.0
  favorite?: number;
  folder_id?: string | null;
  sort_order?: number;
  host_key_fingerprint?: string | null;
  updated_at: number;
}

export interface KeysTable {
  id: string; // UUID v4
  label: string; // Display name e.g., "My MacBook Key"
  type: 'rsa' | 'ed25519';
  public_key: string; // Plain text (public keys are safe to store unencrypted)
  private_key_encrypted: string; // AES-256-GCM encrypted private key
  passphrase_encrypted: string | null; // AES-256-GCM encrypted passphrase, null if no passphrase
  created_at: number; // Unix timestamp in milliseconds
  updated_at: number; // Unix timestamp in milliseconds
}

export interface NewKey {
  id: string;
  label: string;
  type: 'rsa' | 'ed25519';
  public_key: string;
  private_key_encrypted: string;
  passphrase_encrypted: string | null;
  created_at: number;
  updated_at: number;
}

export interface KeyUpdate {
  label?: string;
  updated_at: number;
}

export interface HostTunnelsTable {
  id: string; // UUID v4
  host_id: string; // Foreign key to hosts table
  local_port: number; // Local port to listen on (e.g., 8080)
  remote_host: string; // Remote host to connect to (e.g., '127.0.0.1')
  remote_port: number; // Remote port to connect to (e.g., 80)
  name: string; // Display name (e.g., 'Web Server', 'Database')
  auto_start: number; // 0 or 1 (SQLite boolean) - start when SSH connects
  created_at: number; // Unix timestamp in milliseconds
  updated_at: number; // Unix timestamp in milliseconds
}

export interface NewHostTunnel {
  id: string;
  host_id: string;
  local_port: number;
  remote_host: string;
  remote_port: number;
  name: string;
  auto_start: number;
  created_at: number;
  updated_at: number;
}

export interface HostTunnelUpdate {
  local_port?: number;
  remote_host?: string;
  remote_port?: number;
  name?: string;
  auto_start?: number;
  updated_at: number;
}

export interface SnippetsTable {
  id: string; // UUID v4
  label: string; // Display name (e.g., "Restart Nginx")
  command: string; // Command to execute (e.g., "sudo systemctl restart nginx")
  category: string | null; // Optional grouping (e.g., "Docker", "System")
  created_at: number; // Unix timestamp in milliseconds
  updated_at: number; // Unix timestamp in milliseconds
}

export interface NewSnippet {
  id: string;
  label: string;
  command: string;
  category: string | null;
  created_at: number;
  updated_at: number;
}

export interface SnippetUpdate {
  label?: string;
  command?: string;
  category?: string | null;
  updated_at: number;
}
