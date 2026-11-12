export type DatabaseUserAccessLevel = 'login' | 'read' | 'readWrite' | 'admin';

export interface CreateDatabaseUserOptions {
  password: string;
  host?: string;
  database?: string;
  schema?: string;
  accessLevel?: DatabaseUserAccessLevel;
}
