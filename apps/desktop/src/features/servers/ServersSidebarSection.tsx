import React from 'react';
import { useTranslation } from 'react-i18next';

import { HostItem } from '../../components/HostItem';
import { OrganizedSidebarSection } from '../../components/sidebar/OrganizedSidebarSection';
import type { HostsTable, TerminalSession, WorkspacePane } from '../../screens/main-screen/types';

export interface ServersSidebarSectionProps {
  hosts: HostsTable[];
  sshHosts: HostsTable[];
  panes: WorkspacePane[];
  sessions: TerminalSession[];
  isSlim: boolean;
  isLoadingHosts: boolean;
  onAddHost: (connectionType: 'ssh' | 'sftp_only') => void;
  onHostSelect: (hostId: string) => void;
  onEditHost: (host: HostsTable) => void;
  onDeleteHost: (host: HostsTable) => void;
  onUpdateHostOrganization: (
    host: HostsTable,
    update: { favorite?: number; folder_id?: string | null }
  ) => void | Promise<void>;
}

export const ServersSidebarSection: React.FC<ServersSidebarSectionProps> = ({
  hosts,
  sshHosts,
  panes,
  sessions,
  isSlim,
  isLoadingHosts,
  onAddHost,
  onHostSelect,
  onEditHost,
  onDeleteHost,
  onUpdateHostOrganization,
}) => {
  const { t } = useTranslation();

  return (
    <OrganizedSidebarSection
      title={t('sidebar.servers')}
      resourceType="hosts"
      items={sshHosts}
      isLoading={isLoadingHosts}
      emptyMessage={t('sidebar.noHosts')}
      addTitle={t('sidebar.addHost', 'New host')}
      onAddItem={() => onAddHost('ssh')}
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
          isActive={panes.some(
            (pane) =>
              pane.type === 'terminal' &&
              sessions.find(
                (session) => session.id === pane.contentId && session.host?.id === host.id
              )
          )}
          onClick={() => onHostSelect(host.id)}
          onEdit={() => onEditHost(host)}
          onDelete={() => onDeleteHost(host)}
          isSlim={isSlim}
          {...organizationActions}
        />
      )}
    />
  );
};
