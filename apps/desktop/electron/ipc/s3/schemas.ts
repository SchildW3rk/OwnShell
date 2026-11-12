import { z } from 'zod';
import { idSchema, noPayloadSchema, favoriteSchema, sortOrderSchema } from '../schemas/common';
export { idSchema, noPayloadSchema };

export const s3NameSchema = z.string().min(1).max(1024);
export const nullableIdSchema = idSchema.nullable().optional();

export const s3ConnectionInputSchema = z.object({
  label: z.string().min(1).max(255),
  endpoint: z.string().min(1).max(2048).url(),
  region: z.string().min(1).max(128),
  accessKeyId: z.string().min(1).max(1024),
  secretAccessKey: z.string().min(1).max(4096),
  bucketName: s3NameSchema.optional(),
  favorite: favoriteSchema.optional(),
  folder_id: nullableIdSchema,
  sort_order: sortOrderSchema.optional(),
});

export const s3ConnectionUpdateSchema = z.object({
  label: z.string().min(1).max(255).optional(),
  endpoint: z.string().min(1).max(2048).url().optional(),
  region: z.string().min(1).max(128).optional(),
  accessKeyId: z.string().min(1).max(1024).optional(),
  secretAccessKey: z.string().min(1).max(4096).optional(),
  bucketName: s3NameSchema.nullable().optional(),
  favorite: favoriteSchema.optional(),
  folder_id: nullableIdSchema,
  sort_order: sortOrderSchema.optional(),
});

export const s3ConnectionUpdateArgsSchema = z.tuple([idSchema, s3ConnectionUpdateSchema]);
export const s3TestConnectionSchema = s3ConnectionInputSchema.omit({
  label: true,
  bucketName: true,
});

export const s3BucketSchema = z.object({
  connectionId: idSchema,
  bucket: s3NameSchema,
});

export const s3ListObjectsSchema = s3BucketSchema.extend({
  prefix: z.string().max(4096).optional(),
  continuationToken: z.string().max(4096).optional(),
});

export const s3DeleteObjectsSchema = s3BucketSchema.extend({
  keys: z.array(z.string().min(1).max(4096)).min(1).max(1000),
});

export const s3PresignedUrlSchema = s3BucketSchema.extend({
  key: z.string().min(1).max(4096),
  expiresIn: z.number().finite().int().positive().max(604800).optional(),
});

export const s3CorsRuleSchema = z.object({
  id: z.string().max(255).optional(),
  allowedOrigins: z.array(z.string().min(1).max(2048)).min(1).max(100),
  allowedMethods: z.array(z.enum(['GET', 'PUT', 'POST', 'DELETE', 'HEAD'])).min(1).max(5),
  allowedHeaders: z.array(z.string().min(1).max(255)).max(100).optional(),
  exposeHeaders: z.array(z.string().min(1).max(255)).max(100).optional(),
  maxAgeSeconds: z.number().finite().int().nonnegative().max(86400).optional(),
});

export const s3PutCorsSchema = s3BucketSchema.extend({
  rules: z.array(s3CorsRuleSchema).min(1).max(100),
});
