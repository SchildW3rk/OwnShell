import { z } from 'zod';
import { idSchema, noPayloadSchema, portSchema, favoriteSchema, sortOrderSchema } from '../schemas/common';
export { idSchema, noPayloadSchema };

export const nullableIdSchema = idSchema.nullable().optional();
export const secretSchema = z.string().max(1024 * 1024);
export const sidebarFolderResourceTypeSchema = z.enum(['hosts', 's3', 'databases']);

export const hostSchema = z.object({
  label: z.string().min(1).max(255),
  hostname: z.string().min(1).max(255),
  port: portSchema.optional(),
  username: z.string().min(1).max(255),
  auth_type: z.enum(['password', 'key']),
  password: secretSchema.optional(),
  password_encrypted: secretSchema.optional(),
  key_id: nullableIdSchema,
  jump_host_id: nullableIdSchema,
  connection_type: z.enum(['ssh', 'sftp_only']).optional(),
  favorite: favoriteSchema.optional(),
  folder_id: nullableIdSchema,
  sort_order: sortOrderSchema.optional(),
});
export const hostUpdateSchema = hostSchema.partial();
export const hostUpdateArgsSchema = z.tuple([idSchema, hostUpdateSchema]);
export const jumpChainSchema = z.object({
  hostId: idSchema.nullable(),
  jumpHostId: z.string().max(255),
});

export const keyTypeSchema = z.enum(['rsa', 'ed25519']);
export const keyCreateSchema = z.object({
  label: z.string().min(1).max(255),
  type: keyTypeSchema,
  public_key: z.string().max(1024 * 1024).nullable().optional(),
  private_key: z.string().min(1).max(1024 * 1024),
  passphrase: secretSchema.optional(),
});
export const keyUpdateSchema = z.object({
  label: z.string().min(1).max(255).optional(),
  type: keyTypeSchema.optional(),
  public_key: z.string().max(1024 * 1024).nullable().optional(),
  private_key_encrypted: secretSchema.optional(),
  passphrase_encrypted: secretSchema.nullable().optional(),
});
export const keyUpdateArgsSchema = z.tuple([idSchema, keyUpdateSchema]);

export const settingKeySchema = z.string().min(1).max(255);
export const settingSetArgsSchema = z.tuple([
  settingKeySchema,
  z.string().max(1024 * 1024),
]);

export const tunnelSchema = z.object({
  host_id: idSchema,
  local_port: portSchema,
  remote_host: z.string().min(1).max(255),
  remote_port: portSchema,
  name: z.string().min(1).max(255),
  auto_start: z.boolean().optional(),
});
export const tunnelUpdateSchema = tunnelSchema.partial();
export const tunnelUpdateArgsSchema = z.tuple([idSchema, tunnelUpdateSchema]);

export const snippetCategorySchema = z.string().min(1).max(255).nullable().optional();
export const snippetCreateSchema = z.object({
  label: z.string().min(1).max(255),
  command: z.string().min(1).max(1024 * 1024),
  category: snippetCategorySchema,
});
export const snippetUpdateSchema = z.object({
  label: z.string().min(1).max(255).optional(),
  command: z.string().min(1).max(1024 * 1024).optional(),
  category: snippetCategorySchema,
});
export const snippetUpdateArgsSchema = z.tuple([idSchema, snippetUpdateSchema]);

export const sidebarFolderListSchema = sidebarFolderResourceTypeSchema.optional();
export const sidebarFolderCreateSchema = z.object({
  resource_type: sidebarFolderResourceTypeSchema,
  name: z.string().min(1).max(80),
  sort_order: sortOrderSchema.optional(),
});
export const sidebarFolderUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  sort_order: sortOrderSchema.optional(),
});
export const sidebarFolderUpdateArgsSchema = z.tuple([idSchema, sidebarFolderUpdateSchema]);

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  host_id: idSchema,
  repository_path: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    .regex(/^[^\u0000\r\n]+$/),
  compose_project: z.string().trim().max(255).nullable().optional(),
});
export const projectUpdateSchema = projectCreateSchema.partial();
export const projectUpdateArgsSchema = z.tuple([idSchema, projectUpdateSchema]);
