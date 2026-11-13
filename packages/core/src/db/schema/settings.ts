export interface AppSettingsTable {
  key: string; // Primary key (e.g., 'master_password_hash', 'master_key_salt')
  value: string; // JSON-encoded value
  updated_at: number; // Unix timestamp in milliseconds
}

export interface NewSetting {
  key: string;
  value: string;
  updated_at: number;
}

/**
 * Well-known settings keys
 */
export const SETTINGS_KEYS = {
  MASTER_PASSWORD_HASH: 'master_password_hash',
  MASTER_KEY_SALT: 'master_key_salt',
  AUTO_LOCK_ENABLED: 'auto_lock_enabled',
  AUTO_LOCK_TIMEOUT: 'auto_lock_timeout', // In minutes
  // Language settings
  LANGUAGE: 'language',
  // Recovery key
  RECOVERY_KEY_HASH: 'recovery_key_hash', // Scrypt hash of recovery key for password reset
  // Docker Compose settings
  COMPOSE_BASE_PATH: 'compose_base_path', // Base path for compose projects (default: ~/docker-compose)
  // SFTP Transfer settings (v1.16.0)
  SFTP_PARALLEL_TRANSFERS: 'sftp_parallel_transfers', // Number of parallel transfers (1-10, default: 3)
  SFTP_RESUME_TRANSFERS: 'sftp_resume_transfers', // Resume interrupted transfers on startup (default: true)
} as const;
