import { z } from 'zod';

export const createEnvironmentSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(1, t('vault.errors.envNameRequired')),
    project: z.string().min(1, t('vault.errors.projectRequired')),
    description: z.string().optional(),
    host_id: z.string().optional(),
    default_remote_path: z.string().optional(),
    variables: z
      .array(
        z.object({
          key: z.string().min(1, t('vault.errors.variableKeyRequired')),
          value: z.string(),
        })
      )
      .min(1, t('vault.errors.atLeastOneVariableRequired')),
  });
