import { z } from 'zod';
import { idSchema, noPayloadSchema } from '../schemas/common';
export { noPayloadSchema };

export const sftpPathSchema = z.string().min(1).max(4096);

export const sftpConnectSchema = z.object({
  hostId: idSchema,
  hostname: z.string().min(1).max(255),
  port: z.number().finite().int().positive().max(65535),
  username: z.string().min(1).max(255),
  authType: z.enum(['password', 'key']),
  passwordEncrypted: z.string().min(1).optional(),
  privateKeyEncrypted: z.string().min(1).optional(),
  passphraseEncrypted: z.string().min(1).optional(),
  jumpHostId: idSchema.nullable().optional(),
  hostLabel: z.string().min(1).max(255).optional(),
});

export const connectionIdSchema = z.object({ connectionId: idSchema });
export const transferIdSchema = z.object({ transferId: idSchema });
export const hostIdSchema = z.object({ hostId: idSchema });

export const sftpPathOperationSchema = connectionIdSchema.extend({
  path: sftpPathSchema,
});

export const sftpRenameSchema = connectionIdSchema.extend({
  oldPath: sftpPathSchema,
  newPath: sftpPathSchema,
});

export const sftpChmodSchema = sftpPathOperationSchema.extend({
  mode: z.number().finite().int().min(0).max(0o7777),
});

export const sftpReadFileSchema = sftpPathOperationSchema.extend({
  maxSize: z.number().finite().int().positive().max(25 * 1024 * 1024).optional(),
});

export const sftpWriteFileSchema = sftpPathOperationSchema.extend({
  content: z.string().max(50 * 1024 * 1024),
  encoding: z.enum(['utf-8', 'latin1']),
});

export const transferItemSchema = z.object({
  hostId: idSchema,
  type: z.enum(['upload', 'download']),
  localPath: sftpPathSchema,
  remotePath: sftpPathSchema,
  fileSize: z.number().finite().int().nonnegative().optional(),
  priority: z.number().finite().int().optional(),
});

export const transferAddBulkSchema = z.object({
  items: z.array(transferItemSchema.omit({ priority: true })).min(1).max(500),
});

export const transferAddDirectorySchema = transferItemSchema
  .omit({ fileSize: true, priority: true })
  .extend({ connectionId: idSchema });

export const transferHistorySchema = z
  .object({
    limit: z.number().finite().int().positive().max(1000).optional(),
  })
  .optional();

export const clearHistorySchema = z
  .object({
    before: z.number().finite().int().nonnegative().optional(),
  })
  .optional();

export const setParallelSchema = z.object({
  max: z.number().finite().int().positive().max(16),
});

export const saveDialogSchema = z.object({
  defaultPath: z.string().max(4096).optional(),
  title: z.string().max(255).optional(),
});

export const openDialogSchema = z.object({
  title: z.string().max(255).optional(),
  multiple: z.boolean().optional(),
  directories: z.boolean().optional(),
});

export const localDirectorySchema = z.object({
  path: z.string().max(4096).optional(),
});
