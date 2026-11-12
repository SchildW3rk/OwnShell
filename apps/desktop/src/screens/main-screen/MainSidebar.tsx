import React from 'react';

import {
  ApiClientSidebarSection,
  type ApiClientSidebarSectionProps,
} from '../../features/api-client/ApiClientSidebarSection';
import { DatabasesSidebarSection } from '../../features/databases/DatabasesSidebarSection';
import { FileTransferSidebarSection } from '../../features/file-transfer/FileTransferSidebarSection';
import { SecuritySidebarSection } from '../../features/security/SecuritySidebarSection';
import { ServersSidebarSection } from '../../features/servers/ServersSidebarSection';
import { StorageSidebarSection } from '../../features/storage/StorageSidebarSection';
import { ProjectsSidebarSection } from '../../features/projects/ProjectsSidebarSection';
import { Sidebar } from '../../components/sidebar';
import type {
  DBConnectionsTable,
  EditingS3Connection,
  HostsTable,
  ProjectsTable,
  S3ConnectionsTable,
  SidebarNavItem,
  SidebarSectionId,
  TerminalSession,
  WorkspacePane,
} from './types';

interface MainSidebarProps {
  navItems: SidebarNavItem[];
  activeSection: SidebarSectionId;
  onSectionChange: (section: SidebarSectionId) => void;
  isSlim: boolean;
  projects: ProjectsTable[];
  hosts: HostsTable[];
  sshHosts: HostsTable[];
  sftpHosts: HostsTable[];
  dbConnections: DBConnectionsTable[];
  s3Connections: S3ConnectionsTable[];
  panes: WorkspacePane[];
  sessions: TerminalSession[];
  isLoadingHosts: boolean;
  isLoadingProjects: boolean;
  isLoadingDB: boolean;
  isLoadingS3: boolean;
  showVault: boolean;
  onAddHost: (connectionType: 'ssh' | 'sftp_only') => void;
  onProjectSelect: (project: ProjectsTable) => void;
  onHostSelect: (hostId: string) => void;
  onSFTPHostSelect: (hostId: string) => void;
  onEditHost: (host: HostsTable) => void;
  onDeleteHost: (host: HostsTable) => void;
  onUpdateHostOrganization: (
    host: HostsTable,
    update: { favorite?: number; folder_id?: string | null }
  ) => void | Promise<void>;
  onAddDatabase: () => void;
  onDatabaseSelect: (connectionId: string) => void;
  onEditDatabase: (connection: DBConnectionsTable) => void;
  onDeleteDatabase: (connectionId: string) => void;
  onUpdateDatabaseOrganization: (
    connection: DBConnectionsTable,
    update: { favorite?: number; folder_id?: string | null }
  ) => void | Promise<void>;
  onAddS3: () => void;
  onS3Select: (connectionId: string) => void;
  onEditS3: (connection: EditingS3Connection) => void;
  onDeleteS3: (connectionId: string) => void;
  onUpdateS3Organization: (
    connection: S3ConnectionsTable,
    update: { favorite?: number; folder_id?: string | null }
  ) => void | Promise<void>;
  onOpenVault: () => void;
  onSelectApiRequest: (requestId: string) => void;
  onCreateApiCollection: (parentId?: string | null) => void;
  onCreateApiRequest: (collectionId?: string | null) => void;
  onEditApiCollection: ApiClientSidebarSectionProps['onEditCollection'];
  onDeleteApiCollection: (collectionId: string) => void;
  onEditApiRequest: ApiClientSidebarSectionProps['onEditRequest'];
  onDeleteApiRequest: (requestId: string) => void;
  onDuplicateApiRequest: (requestId: string) => void;
}

export const MainSidebar: React.FC<MainSidebarProps> = ({
  navItems,
  activeSection,
  onSectionChange,
  isSlim,
  projects,
  hosts,
  sshHosts,
  sftpHosts,
  dbConnections,
  s3Connections,
  panes,
  sessions,
  isLoadingHosts,
  isLoadingProjects,
  isLoadingDB,
  isLoadingS3,
  showVault,
  onAddHost,
  onProjectSelect,
  onHostSelect,
  onSFTPHostSelect,
  onEditHost,
  onDeleteHost,
  onUpdateHostOrganization,
  onAddDatabase,
  onDatabaseSelect,
  onEditDatabase,
  onDeleteDatabase,
  onUpdateDatabaseOrganization,
  onAddS3,
  onS3Select,
  onEditS3,
  onDeleteS3,
  onUpdateS3Organization,
  onOpenVault,
  onSelectApiRequest,
  onCreateApiCollection,
  onCreateApiRequest,
  onEditApiCollection,
  onDeleteApiCollection,
  onEditApiRequest,
  onDeleteApiRequest,
  onDuplicateApiRequest,
}) => {
  return (
    <Sidebar navItems={navItems} activeSection={activeSection} onSectionChange={onSectionChange}>
      {activeSection === 'projects' && (
        <ProjectsSidebarSection
          projects={projects}
          hosts={hosts}
          panes={panes}
          isLoading={isLoadingProjects}
          onProjectSelect={onProjectSelect}
        />
      )}

      {activeSection === 'servers' && (
        <ServersSidebarSection
          hosts={hosts}
          sshHosts={sshHosts}
          panes={panes}
          sessions={sessions}
          isSlim={isSlim}
          isLoadingHosts={isLoadingHosts}
          onAddHost={onAddHost}
          onHostSelect={onHostSelect}
          onEditHost={onEditHost}
          onDeleteHost={onDeleteHost}
          onUpdateHostOrganization={onUpdateHostOrganization}
        />
      )}

      {activeSection === 'databases' && (
        <DatabasesSidebarSection
          hosts={hosts}
          dbConnections={dbConnections}
          panes={panes}
          isSlim={isSlim}
          isLoadingDB={isLoadingDB}
          onAddDatabase={onAddDatabase}
          onDatabaseSelect={onDatabaseSelect}
          onEditDatabase={onEditDatabase}
          onDeleteDatabase={onDeleteDatabase}
          onUpdateDatabaseOrganization={onUpdateDatabaseOrganization}
        />
      )}

      {activeSection === 'filetransfer' && (
        <FileTransferSidebarSection
          hosts={hosts}
          sftpHosts={sftpHosts}
          panes={panes}
          isSlim={isSlim}
          isLoadingHosts={isLoadingHosts}
          onAddHost={onAddHost}
          onSFTPHostSelect={onSFTPHostSelect}
          onEditHost={onEditHost}
          onDeleteHost={onDeleteHost}
          onUpdateHostOrganization={onUpdateHostOrganization}
        />
      )}

      {activeSection === 'storage' && (
        <StorageSidebarSection
          s3Connections={s3Connections}
          panes={panes}
          isLoadingS3={isLoadingS3}
          onAddS3={onAddS3}
          onS3Select={onS3Select}
          onEditS3={onEditS3}
          onDeleteS3={onDeleteS3}
          onUpdateS3Organization={onUpdateS3Organization}
        />
      )}

      {activeSection === 'security' && (
        <SecuritySidebarSection showVault={showVault} onOpenVault={onOpenVault} />
      )}

      {activeSection === 'api' && (
        <ApiClientSidebarSection
          onSelectRequest={onSelectApiRequest}
          onCreateCollection={onCreateApiCollection}
          onCreateRequest={onCreateApiRequest}
          onEditCollection={onEditApiCollection}
          onDeleteCollection={onDeleteApiCollection}
          onEditRequest={onEditApiRequest}
          onDeleteRequest={onDeleteApiRequest}
          onDuplicateRequest={onDuplicateApiRequest}
        />
      )}
    </Sidebar>
  );
};
