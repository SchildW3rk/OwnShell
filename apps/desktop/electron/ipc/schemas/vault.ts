import { z } from 'zod';
import { idSchema, noPayloadSchema } from './common';
export { idSchema, noPayloadSchema };


const favoriteSchema = z.union([z.literal(0), z.literal(1)]);
const tagsSchema = z.array(z.string().min(1).max(128)).max(50).nullable();

export const vaultUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, 'Only HTTP(S) URLs are allowed');

export const createCredentialSchema = z.object({
  title: z.string().min(1).max(255),
  username: z.string().max(255).nullable(),
  password: z.string().max(1024 * 1024),
  url: z.string().max(2048).nullable(),
  notes: z.string().max(1024 * 1024).nullable(),
  tags: tagsSchema,
});

const updateCredentialSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  username: z.string().max(255).nullable().optional(),
  password: z.string().max(1024 * 1024).optional(),
  url: z.string().max(2048).nullable().optional(),
  notes: z.string().max(1024 * 1024).nullable().optional(),
  tags: tagsSchema.optional(),
  favorite: favoriteSchema.optional(),
});

export const credentialUpdateArgsSchema = z.tuple([idSchema, updateCredentialSchema]);
export const favoriteArgsSchema = z.tuple([idSchema, favoriteSchema]);

const envVariableSchema = z.object({
  key: z.string().min(1).max(255).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  value: z.string().max(1024 * 1024),
});

export const createEnvironmentSchema = z.object({
  name: z.string().min(1).max(255),
  project: z.string().min(1).max(255),
  description: z.string().max(1024 * 1024).nullable(),
  variables: z.array(envVariableSchema).max(1000),
  host_id: idSchema.nullable(),
  default_remote_path: z.string().min(1).max(4096).nullable(),
});

const updateEnvironmentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  project: z.string().min(1).max(255).optional(),
  description: z.string().max(1024 * 1024).nullable().optional(),
  variables: z.array(envVariableSchema).max(1000).optional(),
  host_id: idSchema.nullable().optional(),
  default_remote_path: z.string().min(1).max(4096).nullable().optional(),
  favorite: favoriteSchema.optional(),
});

export const environmentUpdateArgsSchema = z.tuple([idSchema, updateEnvironmentSchema]);
export const projectSchema = z.string().min(1).max(255);
export const deployToSftpArgsSchema = z.tuple([
  idSchema,
  z.object({
    connectionId: idSchema,
    remotePath: z.string().min(1).max(4096),
  }),
]);
