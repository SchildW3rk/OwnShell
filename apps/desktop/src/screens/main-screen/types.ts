import type {
  ApiCollectionsTable,
  ApiRequestsTable,
  DBConnectionsTable,
  HostsTable,
  ProjectsTable,
  S3ConnectionsTable,
} from '@ownshell/core';
import type { SidebarNavItem, SidebarSectionId } from '../../components/sidebar';
import type { TerminalSession } from '../../stores/useTerminalStore';
import type { WorkspacePane } from '../../stores/useWorkspaceStore';

export interface EditingS3Connection {
  id: string;
  label: string;
  endpoint: string;
  region: string;
  bucket_name: string | null;
}

export type {
  ApiCollectionsTable,
  ApiRequestsTable,
  DBConnectionsTable,
  HostsTable,
  ProjectsTable,
  S3ConnectionsTable,
  SidebarNavItem,
  SidebarSectionId,
  TerminalSession,
  WorkspacePane,
};
