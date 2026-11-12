import React from 'react';
import { useTranslation } from 'react-i18next';

import { HostItem } from '../../components/HostItem';
import { OrganizedSidebarSection } from '../../components/sidebar/OrganizedSidebarSection';
import type { HostsTable, WorkspacePane } from '../../screens/main-screen/types';

export interface FileTransferSidebarSectionProps {
  hosts: HostsTable[];
  sftpHosts: HostsTable[];
  panes: WorkspacePane[];
  isSlim: boolean;
  isLoadingHosts: boolean;
  onAddHost: (connectionType: 'ssh' | 'sftp_only') => void;
  onSFTPHostSelect: (hostId: string) => void;
  onEditHost: (host: HostsTable) => void;
  onDeleteHost: (host: HostsTable) => void;
  onUpdateHostOrganization: (
    host: HostsTable,
    update: { favorite?: number; folder_id?: string | null }
  ) => void | Promise<void>;
}

export const FileTransferSidebarSection: React.FC<FileTransferSidebarSectionProps> = ({
  hosts,
  sftpHosts,
  panes,
  isSlim,
  isLoadingHosts,
  onAddHost,
  onSFTPHostSelect,
  onEditHost,
  onDeleteHost,
  onUpdateHostOrganization,
}) => {
  const { t } = useTranslation();

  return (
    <OrganizedSidebarSection
      title={t('sidebar.fileTransfer', 'File Transfer')}
      resourceType="hosts"
      items={sftpHosts}
      emptyMessage={t('sidebar.noFileTransfer', 'No SFTP connections')}
      isLoading={isLoadingHosts}
      addTitle={t('sidebar.addSftpHost', 'New SFTP host')}
      onAddItem={() => onAddHost('sftp_only')}
      onUpdateItemOrganization={onUpdateHostOrganization}
      getItemMeta={(host) => ({
        id: host.id,
        label: host.label,
        favorite: host.favorite ?? 0,
        folder_id: host.folder_id ?? null,
        sort_order: host.sort_order ?? 0,
        created_at: host.created_at,
      })}
      renderItem={(host, organizationActions) => (
        <HostItem
          host={host}
          hosts={hosts}
          isActive={panes.some((pane) => pane.type === 'sftp' && pane.contentId === host.id)}
          onClick={() => onSFTPHostSelect(host.id)}
          onEdit={() => onEditHost(host)}
          onDelete={() => onDeleteHost(host)}
          isSlim={isSlim}
          {...organizationActions}
        />
      )}
    />
  );
};
