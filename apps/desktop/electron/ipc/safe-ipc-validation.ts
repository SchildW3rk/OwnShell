import { z } from 'zod';

export type SafeIpcValidation<T> =
  | { success: true; data: T }
  | { success: false; issues: Array<{ path: string; code: string }> };

export function validateSafeIpcPayload<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  payload: unknown
): SafeIpcValidation<z.infer<TSchema>> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
      })),
    };
  }

  return { success: true, data: parsed.data };
}
