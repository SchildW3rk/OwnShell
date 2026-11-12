import type { Kysely } from 'kysely';
import type {
  Database,
  NewSidebarFolder,
  SidebarFolderResourceType,
  SidebarFoldersTable,
  SidebarFolderUpdate,
} from '../schema';

/**
 * Sidebar folder operations shared by Hosts, S3 and database connections.
 */
export class SidebarFolderQueries {
  constructor(private db: Kysely<Database>) {}

  async getAll(resourceType?: SidebarFolderResourceType): Promise<SidebarFoldersTable[]> {
    let query = this.db.selectFrom('sidebar_folders').selectAll();

    if (resourceType) {
      query = query.where('resource_type', '=', resourceType);
    }

    return query.orderBy('sort_order', 'asc').orderBy('created_at', 'asc').execute();
  }

  async create(folder: NewSidebarFolder): Promise<void> {
    await this.db
      .insertInto('sidebar_folders')
      .values({
        ...folder,
        sort_order: folder.sort_order ?? 0,
      })
      .execute();
  }

  async update(id: string, update: SidebarFolderUpdate): Promise<void> {
    await this.db.updateTable('sidebar_folders').set(update).where('id', '=', id).execute();
  }

  async delete(id: string): Promise<void> {
    const folder = await this.db
      .selectFrom('sidebar_folders')
      .select(['id', 'resource_type'])
      .where('id', '=', id)
      .executeTakeFirst();

    if (!folder) {
      return;
    }

    const now = Date.now();

    if (folder.resource_type === 'hosts') {
      await this.db
        .updateTable('hosts')
        .set({ folder_id: null, updated_at: now })
        .where('folder_id', '=', id)
        .execute();
    }

    if (folder.resource_type === 's3') {
      await this.db
        .updateTable('s3_connections')
        .set({ folder_id: null, updated_at: now })
        .where('folder_id', '=', id)
        .execute();
    }

    if (folder.resource_type === 'databases') {
      await this.db
        .updateTable('db_connections')
        .set({ folder_id: null, updated_at: now })
        .where('folder_id', '=', id)
        .execute();
    }

    await this.db.deleteFrom('sidebar_folders').where('id', '=', id).execute();
  }
}
