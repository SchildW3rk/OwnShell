import type { ApiCollectionsTable, ApiRequestsTable } from '@ownshell/core';

export interface ContextMenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

export type ApiCollectionTreeItem = ApiCollectionsTable & {
  children?: ApiCollectionTreeItem[];
  requests?: ApiRequestsTable[];
};
