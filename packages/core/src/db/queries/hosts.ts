import type { Kysely } from 'kysely';
import type {
  Database,
  HostUpdate,
  HostsTable,
  KeyUpdate,
  KeysTable,
  NewHost,
  NewKey,
} from '../schema';

/**
 * Host-related database operations
 */
export class HostQueries {
  constructor(private db: Kysely<Database>) {}

  async getAll(): Promise<HostsTable[]> {
    return this.db
      .selectFrom('hosts')
      .selectAll()
      .orderBy('favorite', 'desc')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc')
      .execute();
  }

  async getById(id: string): Promise<HostsTable | undefined> {
    return this.db.selectFrom('hosts').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async create(host: NewHost): Promise<void> {
    const hostWithDefaults = {
      ...host,
      connection_type: host.connection_type ?? 'ssh',
      favorite: host.favorite ?? 0,
      folder_id: host.folder_id ?? null,
      sort_order: host.sort_order ?? 0,
    };
    await this.db.insertInto('hosts').values(hostWithDefaults).execute();
  }

  async update(id: string, update: HostUpdate): Promise<void> {
    await this.db.updateTable('hosts').set(update).where('id', '=', id).execute();
  }

  /** Stores an SSH host key fingerprint only if none is stored yet; returns the one on record. */
  async claimHostKey(id: string, fingerprint: string): Promise<string | null> {
    await this.db
      .updateTable('hosts')
      .set({ host_key_fingerprint: fingerprint, updated_at: Date.now() })
      .where('id', '=', id)
      .where('host_key_fingerprint', 'is', null)
      .execute();
    const row = await this.db
      .selectFrom('hosts')
      .select('host_key_fingerprint')
      .where('id', '=', id)
      .executeTakeFirst();
    return row?.host_key_fingerprint ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('hosts').where('id', '=', id).execute();
  }

  async search(query: string): Promise<HostsTable[]> {
    return this.db
      .selectFrom('hosts')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('label', 'like', `%${query}%`),
          eb('hostname', 'like', `%${query}%`),
          eb('username', 'like', `%${query}%`),
        ])
      )
      .orderBy('favorite', 'desc')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc')
      .execute();
  }
}

/**
 * SSH Key-related database operations
 */
export class KeyQueries {
  constructor(private db: Kysely<Database>) {}

  async getAll(): Promise<KeysTable[]> {
    return this.db.selectFrom('keys').selectAll().orderBy('created_at', 'desc').execute();
  }

  async getById(id: string): Promise<KeysTable | undefined> {
    return this.db.selectFrom('keys').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async create(key: NewKey): Promise<void> {
    await this.db.insertInto('keys').values(key).execute();
  }

  async update(id: string, update: KeyUpdate): Promise<void> {
    await this.db.updateTable('keys').set(update).where('id', '=', id).execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('keys').where('id', '=', id).execute();
  }

  async getByType(type: 'rsa' | 'ed25519'): Promise<KeysTable[]> {
    return this.db
      .selectFrom('keys')
      .selectAll()
      .where('type', '=', type)
      .orderBy('created_at', 'desc')
      .execute();
  }
}
