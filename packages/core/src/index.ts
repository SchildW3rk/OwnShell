/**
 * @ownshell/core
 *
 * Shared business logic for OwnShell SSH Client
 * Platform-agnostic code for Desktop and Mobile apps
 */

// Database
export * from './db/schema';
export * from './db/queries';
// Explicit named exports for better bundler compatibility
export {
  HostQueries,
  KeyQueries,
  SettingsQueries,
  S3ConnectionQueries,
  DBConnectionQueries,
  DBQueryHistoryQueries,
  SidebarFolderQueries,
  ProjectQueries,
} from './db/queries';

// Cryptography
export * from './crypto/encryption';

// SSH
export * from './ssh/types';

// S3 Object Storage
export * from './s3/types';

// Database Explorer
export * from './db-explorer';
