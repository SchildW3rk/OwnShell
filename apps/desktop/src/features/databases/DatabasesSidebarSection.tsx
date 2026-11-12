import React from 'react';
import { useTranslation } from 'react-i18next';

import { DBConnectionItem } from '../../components/db-explorer';
import { OrganizedSidebarSection } from '../../components/sidebar/OrganizedSidebarSection';
import type { DBConnectionsTable, HostsTable, WorkspacePane } from '../../screens/main-screen/types';

export interface DatabasesSidebarSectionProps {
  hosts: HostsTable[];
  dbConnections: DBConnectionsTable[];
  panes: WorkspacePane[];
  isSlim: boolean;
  isLoadingDB: boolean;
  onAddDatabase: () => void;
  onDatabaseSelect: (connectionId: string) => void;
  onEditDatabase: (connection: DBConnectionsTable) => void;
  onDeleteDatabase: (connectionId: string) => void;
  onUpdateDatabaseOrganization: (
    connection: DBConnectionsTable,
    update: { favorite?: number; folder_id?: string | null }
  ) => void | Promise<void>;
}

export const DatabasesSidebarSection: React.FC<DatabasesSidebarSectionProps> = ({
  hosts,
  dbConnections,
  panes,
  isSlim,
  isLoadingDB,
  onAddDatabase,
  onDatabaseSelect,
  onEditDatabase,
  onDeleteDatabase,
  onUpdateDatabaseOrganization,
}) => {
  const { t } = useTranslation();

  return (
    <OrganizedSidebarSection
      title={t('sidebar.databases', 'Databases')}
      resourceType="databases"
      items={dbConnections}
      emptyMessage={t('sidebar.noDatabases', 'No database connections')}
      isLoading={isLoadingDB}
      addTitle={t('sidebar.addDatabase', 'New database connection')}
      onAddItem={onAddDatabase}
      onUpdateItemOrganization={onUpdateDatabaseOrganization}
      getItemMeta={(connection) => ({
        id: connection.id,
        label: connection.name,
        favorite: connection.favorite ?? 0,
        folder_id: connection.folder_id ?? null,
        sort_order: connection.sort_order ?? 0,
        created_at: connection.created_at,
      })}
      renderItem={(connection, organizationActions) => (
        <DBConnectionItem
          connection={connection}
          hostName={hosts.find((host) => host.id === connection.ssh_host_id)?.label}
          isActive={panes.some(
            (pane) => pane.type === 'database' && pane.contentId === connection.id
          )}
          onClick={() => onDatabaseSelect(connection.id)}
          onEdit={() => onEditDatabase(connection)}
          onDelete={() => onDeleteDatabase(connection.id)}
          isSlim={isSlim}
          {...organizationActions}
        />
      )}
    />
  );
};
