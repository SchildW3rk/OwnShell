import type { Kysely } from 'kysely';
import type {
  Database,
  NewS3Connection,
  S3ConnectionUpdate,
  S3ConnectionsTable,
} from '../schema';

/**
 * S3 Connection-related database operations
 */
export class S3ConnectionQueries {
  constructor(private db: Kysely<Database>) {}

  async getAll(): Promise<S3ConnectionsTable[]> {
    return this.db
      .selectFrom('s3_connections')
      .selectAll()
      .orderBy('favorite', 'desc')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc')
      .execute();
  }

  async getById(id: string): Promise<S3ConnectionsTable | undefined> {
    return this.db.selectFrom('s3_connections').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async create(connection: NewS3Connection): Promise<void> {
    await this.db
      .insertInto('s3_connections')
      .values({
        ...connection,
        favorite: connection.favorite ?? 0,
        folder_id: connection.folder_id ?? null,
        sort_order: connection.sort_order ?? 0,
      })
      .execute();
  }

  async update(id: string, update: S3ConnectionUpdate): Promise<void> {
    await this.db.updateTable('s3_connections').set(update).where('id', '=', id).execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('s3_connections').where('id', '=', id).execute();
  }

  async search(query: string): Promise<S3ConnectionsTable[]> {
    return this.db
      .selectFrom('s3_connections')
      .selectAll()
      .where((eb) =>
        eb.or([eb('label', 'like', `%${query}%`), eb('endpoint', 'like', `%${query}%`)])
      )
      .orderBy('favorite', 'desc')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc')
      .execute();
  }
}
