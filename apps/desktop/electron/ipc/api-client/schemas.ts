import { z } from 'zod';
import { idSchema, noPayloadSchema } from '../schemas/common';
export { idSchema, noPayloadSchema };

export const nullableIdSchema = idSchema.nullable();
export const sortOrderSchema = z.number().finite().int().nonnegative().max(1000000);
export const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
export const bodyTypeSchema = z.enum(['none', 'json', 'form-data', 'form-urlencoded', 'raw', 'binary']);
export const authTypeSchema = z.enum(['none', 'bearer', 'basic', 'api-key', 'inherit']);
export const jsonConfigStringSchema = z.string().max(1024 * 1024);

export const collectionSchema = z.object({
  name: z.string().min(1).max(255),
  parent_id: nullableIdSchema.optional(),
  description: z.string().max(1024 * 1024).nullable().optional(),
  sort_order: sortOrderSchema.optional(),
});
export const collectionUpdateSchema = collectionSchema.partial();
export const collectionUpdateArgsSchema = z.tuple([idSchema, collectionUpdateSchema]);

export const collectionIdSchema = idSchema.nullable();
export const requestSchema = z.object({
  name: z.string().min(1).max(255),
  collection_id: nullableIdSchema.optional(),
  method: httpMethodSchema.optional(),
  url: z.string().max(4096).optional(),
  params: jsonConfigStringSchema.optional(),
  headers: jsonConfigStringSchema.optional(),
  body: z.string().max(10 * 1024 * 1024).optional(),
  body_type: bodyTypeSchema.optional(),
  auth_type: authTypeSchema.optional(),
  auth_config: jsonConfigStringSchema.optional(),
  network_host_id: nullableIdSchema.optional(),
  environment_id: nullableIdSchema.optional(),
  sort_order: sortOrderSchema.optional(),
});
export const requestUpdateSchema = requestSchema.partial().extend({
  last_executed_at: z.number().finite().int().nonnegative().nullable().optional(),
});
export const requestUpdateArgsSchema = z.tuple([idSchema, requestUpdateSchema]);
export const executeRequestSchema = z.object({
  method: httpMethodSchema,
  url: z.string().min(1).max(4096),
  params: jsonConfigStringSchema,
  headers: jsonConfigStringSchema,
  body: z.string().max(10 * 1024 * 1024),
  bodyType: bodyTypeSchema,
  authType: authTypeSchema,
  authConfig: jsonConfigStringSchema,
  networkHostId: nullableIdSchema,
  environmentId: nullableIdSchema,
});
