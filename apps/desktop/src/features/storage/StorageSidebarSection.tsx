import React from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud } from 'lucide-react';

import { SidebarItem } from '../../components/sidebar';
import { OrganizedSidebarSection } from '../../components/sidebar/OrganizedSidebarSection';
import type {
  EditingS3Connection,
  S3ConnectionsTable,
  WorkspacePane,
} from '../../screens/main-screen/types';

export interface StorageSidebarSectionProps {
  s3Connections: S3ConnectionsTable[];
  panes: WorkspacePane[];
  isLoadingS3: boolean;
  onAddS3: () => void;
  onS3Select: (connectionId: string) => void;
  onEditS3: (connection: EditingS3Connection) => void;
  onDeleteS3: (connectionId: string) => void;
  onUpdateS3Organization: (
    connection: S3ConnectionsTable,
    update: { favorite?: number; folder_id?: string | null }
  ) => void | Promise<void>;
}

export const StorageSidebarSection: React.FC<StorageSidebarSectionProps> = ({
  s3Connections,
  panes,
  isLoadingS3,
  onAddS3,
  onS3Select,
  onEditS3,
  onDeleteS3,
  onUpdateS3Organization,
}) => {
  const { t } = useTranslation();

  return (
    <OrganizedSidebarSection
      title={t('sidebar.storage')}
      resourceType="s3"
      items={s3Connections}
      emptyMessage={t('sidebar.noConnections')}
      isLoading={isLoadingS3}
      addTitle={t('sidebar.addS3', 'New S3 connection')}
      onAddItem={onAddS3}
      onUpdateItemOrganization={onUpdateS3Organization}
      getItemMeta={(connection) => ({
        id: connection.id,
        label: connection.label,
        favorite: connection.favorite ?? 0,
        folder_id: connection.folder_id ?? null,
        sort_order: connection.sort_order ?? 0,
        created_at: connection.created_at,
      })}
      renderItem={(connection, organizationActions) => (
        <SidebarItem
          label={connection.label}
          icon={<Cloud className="w-4 h-4" />}
          isActive={panes.some((pane) => pane.type === 's3' && pane.contentId === connection.id)}
          onClick={() => onS3Select(connection.id)}
          onEdit={() =>
            onEditS3({
              id: connection.id,
              label: connection.label,
              endpoint: connection.endpoint,
              region: connection.region,
              bucket_name: connection.bucket_name,
            })
          }
          onDelete={() => onDeleteS3(connection.id)}
          {...organizationActions}
        />
      )}
    />
  );
};
