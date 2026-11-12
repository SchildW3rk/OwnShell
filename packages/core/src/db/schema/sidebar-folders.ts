export type SidebarFolderResourceType = 'hosts' | 's3' | 'databases';

export interface SidebarFoldersTable {
  id: string; // UUID v4
  resource_type: SidebarFolderResourceType;
  name: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface NewSidebarFolder {
  id: string;
  resource_type: SidebarFolderResourceType;
  name: string;
  sort_order?: number;
  created_at: number;
  updated_at: number;
}

export interface SidebarFolderUpdate {
  name?: string;
  sort_order?: number;
  updated_at: number;
}
