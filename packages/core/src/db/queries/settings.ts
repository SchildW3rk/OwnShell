import type { Kysely } from 'kysely';
import type { Database, NewSetting } from '../schema';

/**
 * App Settings-related database operations
 */
export class SettingsQueries {
  constructor(private db: Kysely<Database>) {}

  async get(key: string): Promise<string | undefined> {
    const result = await this.db
      .selectFrom('app_settings')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst();

    return result?.value;
  }

  async set(setting: NewSetting): Promise<void> {
    await this.db
      .insertInto('app_settings')
      .values(setting)
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          value: setting.value,
          updated_at: setting.updated_at,
        })
      )
      .execute();
  }

  async delete(key: string): Promise<void> {
    await this.db.deleteFrom('app_settings').where('key', '=', key).execute();
  }

  async getAll(): Promise<Record<string, string>> {
    const settings = await this.db.selectFrom('app_settings').select(['key', 'value']).execute();

    return settings.reduce(
      (acc, { key, value }) => {
        acc[key] = value;
        return acc;
      },
      {} as Record<string, string>
    );
  }
}
