import type { Kysely } from 'kysely';
import type {
  Database,
  DBConnectionUpdate,
  DBConnectionsTable,
  DBQueryHistoryTable,
  NewDBConnection,
  NewDBQueryHistory,
} from '../schema';

/**
 * Database Connection-related database operations (DB Explorer)
 */
export class DBConnectionQueries {
  constructor(private db: Kysely<Database>) {}

  async getAll(): Promise<DBConnectionsTable[]> {
    return this.db
      .selectFrom('db_connections')
      .selectAll()
      .orderBy('favorite', 'desc')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc')
      .execute();
  }

  async getById(id: string): Promise<DBConnectionsTable | undefined> {
    return this.db.selectFrom('db_connections').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async getByHostId(hostId: string): Promise<DBConnectionsTable[]> {
    return this.db
      .selectFrom('db_connections')
      .selectAll()
      .where('ssh_host_id', '=', hostId)
      .orderBy('favorite', 'desc')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc')
      .execute();
  }

  async create(connection: NewDBConnection): Promise<void> {
    await this.db
      .insertInto('db_connections')
      .values({
        ...connection,
        read_only: connection.read_only ?? 0,
        favorite: connection.favorite ?? 0,
        folder_id: connection.folder_id ?? null,
        sort_order: connection.sort_order ?? 0,
      })
      .execute();
  }

  async update(id: string, update: DBConnectionUpdate): Promise<void> {
    await this.db.updateTable('db_connections').set(update).where('id', '=', id).execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('db_query_history').where('connection_id', '=', id).execute();
    await this.db.deleteFrom('db_connections').where('id', '=', id).execute();
  }

  async search(query: string): Promise<DBConnectionsTable[]> {
    return this.db
      .selectFrom('db_connections')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('name', 'like', `%${query}%`),
          eb('host', 'like', `%${query}%`),
          eb('database', 'like', `%${query}%`),
        ])
      )
      .orderBy('favorite', 'desc')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc')
      .execute();
  }
}

/**
 * Database Query History operations
 */
export class DBQueryHistoryQueries {
  constructor(private db: Kysely<Database>) {}

  async getByConnection(connectionId: string, limit = 100): Promise<DBQueryHistoryTable[]> {
    return this.db
      .selectFrom('db_query_history')
      .selectAll()
      .where('connection_id', '=', connectionId)
      .orderBy('executed_at', 'desc')
      .limit(limit)
      .execute();
  }

  async getAll(limit = 100): Promise<DBQueryHistoryTable[]> {
    return this.db
      .selectFrom('db_query_history')
      .selectAll()
      .orderBy('executed_at', 'desc')
      .limit(limit)
      .execute();
  }

  async add(entry: NewDBQueryHistory): Promise<void> {
    await this.db.insertInto('db_query_history').values(entry).execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('db_query_history').where('id', '=', id).execute();
  }

  async clearForConnection(connectionId: string): Promise<void> {
    await this.db
      .deleteFrom('db_query_history')
      .where('connection_id', '=', connectionId)
      .execute();
  }

  async clearAll(): Promise<void> {
    await this.db.deleteFrom('db_query_history').execute();
  }

  async search(query: string, connectionId?: string): Promise<DBQueryHistoryTable[]> {
    let queryBuilder = this.db
      .selectFrom('db_query_history')
      .selectAll()
      .where('query', 'like', `%${query}%`);

    if (connectionId) {
      queryBuilder = queryBuilder.where('connection_id', '=', connectionId);
    }

    return queryBuilder.orderBy('executed_at', 'desc').limit(50).execute();
  }

  async getSuccessful(connectionId: string, limit = 50): Promise<DBQueryHistoryTable[]> {
    return this.db
      .selectFrom('db_query_history')
      .selectAll()
      .where('connection_id', '=', connectionId)
      .where('success', '=', 1)
      .orderBy('executed_at', 'desc')
      .limit(limit)
      .execute();
  }
}
