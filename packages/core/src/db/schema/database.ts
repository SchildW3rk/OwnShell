import type {
  ApiCollectionsTable,
  ApiCookiesTable,
  ApiOAuthTokensTable,
  ApiRequestHistoryTable,
  ApiRequestsTable,
} from './api-client';
import type { DBConnectionsTable, DBQueryHistoryTable } from './db-connections';
import type {
  HostsTable,
  HostTunnelsTable,
  KeysTable,
  SnippetsTable,
} from './hosts';
import type { S3ConnectionsTable } from './s3';
import type { SidebarFoldersTable } from './sidebar-folders';
import type { ProjectsTable } from './projects';
import type { AppSettingsTable } from './settings';
import type { TransferHistoryTable, TransferQueueTable } from './transfers';
import type { VaultCredentialsTable, VaultEnvironmentsTable } from './vault';

export interface Database {
  hosts: HostsTable;
  keys: KeysTable;
  app_settings: AppSettingsTable;
  host_tunnels: HostTunnelsTable;
  snippets: SnippetsTable;
  s3_connections: S3ConnectionsTable;
  db_connections: DBConnectionsTable;
  db_query_history: DBQueryHistoryTable;
  transfer_queue: TransferQueueTable;
  transfer_history: TransferHistoryTable;
  vault_credentials: VaultCredentialsTable;
  vault_environments: VaultEnvironmentsTable;
  api_collections: ApiCollectionsTable;
  api_requests: ApiRequestsTable;
  api_request_history: ApiRequestHistoryTable;
  api_oauth_tokens: ApiOAuthTokensTable;
  api_cookies: ApiCookiesTable;
  sidebar_folders: SidebarFoldersTable;
  projects: ProjectsTable;
}
