import type { DBType } from './types';

export const DB_TYPES: DBType[] = ['postgres', 'mysql', 'mongodb', 'redis', 'sqlite'];

export const DEFAULT_PORTS: Record<DBType, number> = {
  postgres: 5432,
  mysql: 3306,
  redis: 6379,
  mongodb: 27017,
  sqlite: 0,
};

export const DB_TYPE_LABELS: Record<DBType, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
  redis: 'Redis',
  mongodb: 'MongoDB',
};
