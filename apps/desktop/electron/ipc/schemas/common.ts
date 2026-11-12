import { z } from 'zod';

export const idSchema = z.string().min(1);
export const noPayloadSchema = z.undefined();
export const portSchema = z.number().finite().int().positive().max(65535);
export const favoriteSchema = z.number().int().min(0).max(1);
export const sortOrderSchema = z.number().int().min(0).max(1000000);
export const terminalDataSchema = z.string().max(1024 * 1024);
export const sshPathSchema = z.string().min(1).max(4096);
