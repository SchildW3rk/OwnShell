import type { Kysely } from 'kysely';
import type { Database, NewProject, ProjectsTable, ProjectUpdate } from '../schema';

export class ProjectQueries {
  constructor(private db: Kysely<Database>) {}

  async getAll(): Promise<ProjectsTable[]> {
    return this.db
      .selectFrom('projects')
      .selectAll()
      .orderBy('name', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
  }

  async getById(id: string): Promise<ProjectsTable | undefined> {
    return this.db.selectFrom('projects').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async create(project: NewProject): Promise<ProjectsTable> {
    return this.db.insertInto('projects').values(project).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, update: ProjectUpdate): Promise<ProjectsTable | undefined> {
    return this.db
      .updateTable('projects')
      .set(update)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('projects').where('id', '=', id).execute();
  }
}
