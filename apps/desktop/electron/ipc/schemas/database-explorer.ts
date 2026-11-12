import { z } from 'zod';
import { idSchema, noPayloadSchema, favoriteSchema, sortOrderSchema } from './common';
export { idSchema, noPayloadSchema };

export const optionalIdentifierSchema = z.string().min(1).optional();
export const recordSchema = z.record(z.string(), z.unknown());
export const QUERY_HISTORY_ENABLED_SETTING = 'dbExplorer.queryHistory.enabled';

export const dbConnectionTypeSchema = z.enum(['postgres', 'mysql', 'redis', 'sqlite', 'mongodb']);
export const dbNetworkConnectionTypeSchema = z.enum(['postgres', 'mysql', 'redis', 'mongodb']);
export const mongoReadPreferenceSchema = z.enum([
  'primary',
  'primaryPreferred',
  'secondary',
  'secondaryPreferred',
  'nearest',
]);
export const dbConnectionBaseSchema = z.object({
  name: z.string().min(1),
  type: dbConnectionTypeSchema,
  host: z.string().min(1).nullable().optional(),
  port: z.number().finite().int().positive().max(65535).nullable().optional(),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z
    .string()
    .max(10 * 1024)
    .optional(),
  connectionUri: z.string().max(4096).optional(),
  connectionMode: z.enum(['local', 'ssh']).optional(),
  sshHostId: z.string().min(1).optional(),
  sshTunnelEnabled: z.boolean().optional(),
  sslEnabled: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  authDatabase: z.string().min(1).max(256).optional(),
  replicaSet: z.string().min(1).max(256).optional(),
  directConnection: z.boolean().optional(),
  readPreference: mongoReadPreferenceSchema.optional(),
  color: z.string().max(64).optional(),
  filePath: z.string().min(1).optional(),
  isRemote: z.boolean().optional(),
  remoteHostId: z.string().min(1).optional(),
  executionMode: z.enum(['direct', 'docker']).optional(),
  dockerContainer: z.string().min(1).optional(),
  favorite: favoriteSchema.optional(),
  folderId: z.string().min(1).nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const dbConnectionUpdateSchema = dbConnectionBaseSchema.partial().extend({
  host: z.string().min(1).nullable().optional(),
  port: z.number().finite().int().positive().max(65535).nullable().optional(),
  database: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  password: z
    .string()
    .max(10 * 1024)
    .nullable()
    .optional(),
  connectionUri: z.string().max(4096).nullable().optional(),
  sshHostId: z.string().min(1).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  authDatabase: z.string().min(1).max(256).nullable().optional(),
  replicaSet: z.string().min(1).max(256).nullable().optional(),
  readPreference: mongoReadPreferenceSchema.nullable().optional(),
  filePath: z.string().min(1).nullable().optional(),
  remoteHostId: z.string().min(1).nullable().optional(),
  dockerContainer: z.string().min(1).nullable().optional(),
});

export const dbConnectionUpdateArgsSchema = z.tuple([idSchema, dbConnectionUpdateSchema]);

export const dbConnectionTestSchema = z.object({
  name: z.string().min(1).optional(),
  type: dbNetworkConnectionTypeSchema,
  host: z.string().min(1),
  port: z.number().finite().int().positive().max(65535),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z
    .string()
    .max(10 * 1024)
    .optional(),
  connectionUri: z.string().max(4096).optional(),
  connectionMode: z.enum(['local', 'ssh']).optional(),
  sshHostId: z.string().min(1).optional(),
  sshTunnelEnabled: z.boolean().optional(),
  sslEnabled: z.boolean().optional(),
  authDatabase: z.string().min(1).max(256).optional(),
  replicaSet: z.string().min(1).max(256).optional(),
  directConnection: z.boolean().optional(),
  readPreference: mongoReadPreferenceSchema.optional(),
  executionMode: z.enum(['direct', 'docker']).optional(),
  dockerContainer: z.string().min(1).optional(),
});

export const dbExplorerConnectSchema = z.object({
  configId: z.string().min(1),
  sshSessionId: z.string().min(1).optional(),
});

export const tableTargetSchema = z.object({
  connectionId: z.string().min(1),
  tableName: z.string().min(1),
  schema: optionalIdentifierSchema,
});

export const tableDataSchema = tableTargetSchema.extend({
  limit: z.number().finite().int().positive().max(1000).optional(),
  offset: z.number().finite().int().nonnegative().optional(),
  orderBy: z.string().min(1).optional(),
  orderDirection: z.enum(['ASC', 'DESC']).optional(),
});

export const querySchema = z.object({
  connectionId: z.string().min(1),
  sql: z.string().min(1),
});

export const updateRowSchema = tableTargetSchema.extend({
  primaryKey: recordSchema,
  changes: recordSchema,
});

export const deleteRowSchema = tableTargetSchema.extend({
  primaryKey: recordSchema,
});

export const insertRowSchema = tableTargetSchema.extend({
  data: recordSchema,
});

export const rowCountSchema = tableTargetSchema;

export const historySchema = z.object({
  connectionId: z.string().min(1),
  limit: z.number().finite().int().positive().max(500).optional(),
});

export const connectionOnlySchema = z.object({
  connectionId: z.string().min(1),
});

export const ddlNamedObjectSchema = z.object({
  connectionId: z.string().min(1),
  name: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const createDatabaseUserSchema = z.object({
  connectionId: z.string().min(1),
  username: z.string().trim().min(1).max(255),
  options: z.object({
    password: z
      .string()
      .min(1)
      .max(10 * 1024),
    host: z.string().trim().min(1).max(255).optional(),
    database: z.string().trim().min(1).max(255).optional(),
    schema: z.string().trim().min(1).max(63).optional(),
    accessLevel: z.enum(['login', 'read', 'readWrite', 'admin']).optional(),
  }),
});

export const ddlDropNamedObjectSchema = z.object({
  connectionId: z.string().min(1),
  name: z.string().min(1),
  cascade: z.boolean().optional(),
});

export const createTableSchema = z.object({
  connectionId: z.string().min(1),
  name: z.string().min(1),
  columns: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        length: z.number().finite().int().positive().optional(),
        precision: z.number().finite().int().positive().optional(),
        scale: z.number().finite().int().nonnegative().optional(),
        nullable: z.boolean().optional(),
        primaryKey: z.boolean().optional(),
        defaultValue: z.union([z.string(), z.null()]).optional(),
        unique: z.boolean().optional(),
      })
    )
    .min(1),
  schema: optionalIdentifierSchema,
});

export const dropTableSchema = z.object({
  connectionId: z.string().min(1),
  name: z.string().min(1),
  schema: optionalIdentifierSchema,
  cascade: z.boolean().optional(),
});

export const exportDatabaseSchema = z.object({
  connectionId: z.string().min(1),
  configId: z.string().min(1),
  operationId: z.string().min(1).optional(),
  compress: z.boolean(),
  tables: z.array(z.string().min(1)).optional(),
  schemaOnly: z.boolean().optional(),
  dataOnly: z.boolean().optional(),
  clean: z.boolean().optional(),
  noOwner: z.boolean().optional(),
  create: z.boolean().optional(),
});

export const importDatabaseSchema = z.object({
  connectionId: z.string().min(1),
  configId: z.string().min(1),
  operationId: z.string().min(1).optional(),
  clearMode: z.enum(['none', 'truncate', 'drop']).optional(),
});

export const dbTypeSchema = z.object({
  dbType: z.enum(['postgres', 'mysql', 'redis', 'sqlite', 'mongodb']),
});

export const redisKeySchema = z.object({
  connectionId: z.string().min(1),
  key: z.string().min(1),
});

export const redisScanKeysSchema = z.object({
  connectionId: z.string().min(1),
  pattern: z.string().optional(),
  cursor: z.string().optional(),
  count: z.number().finite().int().positive().max(10000).optional(),
  type: z.enum(['string', 'hash', 'list', 'set', 'zset']).optional(),
});

export const redisSetStringSchema = redisKeySchema.extend({
  value: z.string(),
  ttl: z.number().finite().int().positive().optional(),
});

export const redisHashSchema = redisKeySchema.extend({
  fields: z.record(z.string(), z.string()),
});

export const redisHashDeleteSchema = redisKeySchema.extend({
  fields: z.array(z.string().min(1)).min(1),
});

export const redisListPushSchema = redisKeySchema.extend({
  values: z.array(z.string()).min(1),
  direction: z.enum(['left', 'right']),
});

export const redisListPopSchema = redisKeySchema.extend({
  direction: z.enum(['left', 'right']),
});

export const redisListSetSchema = redisKeySchema.extend({
  index: z.number().finite().int().nonnegative(),
  value: z.string(),
});

export const redisMembersSchema = redisKeySchema.extend({
  members: z.array(z.string()).min(1),
});

export const redisZSetAddSchema = redisKeySchema.extend({
  members: z.array(z.object({ member: z.string(), score: z.number().finite() })).min(1),
});

export const redisDeleteKeysSchema = z.object({
  connectionId: z.string().min(1),
  keys: z.array(z.string().min(1)).min(1).max(1000),
});

export const redisRenameKeySchema = z.object({
  connectionId: z.string().min(1),
  oldKey: z.string().min(1),
  newKey: z.string().min(1),
});

export const redisSetTtlSchema = redisKeySchema.extend({
  seconds: z.number().finite().int().positive(),
});

export const redisExecuteSchema = z.object({
  connectionId: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).max(100),
});

export const mongoCollectionSchema = z.object({
  connectionId: z.string().min(1),
  collection: z.string().min(1),
});

export const mongoCollectionNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (name) =>
      !name.includes('\0') &&
      !name.includes('$') &&
      !name.startsWith('.') &&
      !name.endsWith('.') &&
      !name.startsWith('system.'),
    'Invalid MongoDB collection name'
  );

export const mongoCreateCollectionSchema = z.object({
  connectionId: z.string().min(1),
  name: mongoCollectionNameSchema,
  options: z
    .object({
      capped: z.boolean().optional(),
      size: z.number().finite().int().positive().optional(),
    })
    .optional(),
});

export const mongoFindDocumentsSchema = mongoCollectionSchema.extend({
  filter: recordSchema.optional(),
  projection: z.record(z.string(), z.number()).optional(),
  sort: z.record(z.string(), z.union([z.literal(1), z.literal(-1)])).optional(),
  skip: z.number().finite().int().nonnegative().optional(),
  limit: z.number().finite().int().positive().max(1000).optional(),
});

export const mongoDocumentIdSchema = mongoCollectionSchema.extend({
  id: z.string().min(1),
});

export const mongoFilterSchema = mongoCollectionSchema.extend({
  filter: recordSchema.optional(),
});

export const mongoRequiredFilterSchema = mongoCollectionSchema.extend({
  filter: recordSchema,
});

export const mongoInsertDocumentSchema = mongoCollectionSchema.extend({
  document: recordSchema,
});

export const mongoUpdateDocumentSchema = mongoDocumentIdSchema.extend({
  update: recordSchema,
  options: z
    .object({
      upsert: z.boolean().optional(),
      replace: z.boolean().optional(),
    })
    .optional(),
});

export const mongoAggregateSchema = mongoCollectionSchema.extend({
  pipeline: z.array(recordSchema).max(100),
});

export const mongoCreateIndexSchema = mongoCollectionSchema.extend({
  keys: z.record(z.string(), z.union([z.literal(1), z.literal(-1), z.literal('text')])),
  options: z
    .object({
      unique: z.boolean().optional(),
      sparse: z.boolean().optional(),
      expireAfterSeconds: z.number().finite().int().positive().optional(),
      name: z.string().min(1).optional(),
    })
    .optional(),
});

export const mongoDropIndexSchema = mongoCollectionSchema.extend({
  indexName: z.string().min(1),
});

export const mongoRunCommandSchema = z.object({
  connectionId: z.string().min(1),
  command: recordSchema,
});
