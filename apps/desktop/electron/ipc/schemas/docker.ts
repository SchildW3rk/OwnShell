import { z } from 'zod';
import { idSchema, terminalDataSchema, sshPathSchema } from './common';

const terminalSizeSchema = z.object({
  cols: z.number().finite().int().min(1).max(1000),
  rows: z.number().finite().int().min(1).max(1000),
});

const sshSessionSchema = z.object({
  sessionId: idSchema,
});

const hasPathTraversal = (value: string): boolean => value.split('/').some((part) => part === '..');
const isAnchoredRemotePath = (value: string): boolean =>
  value.startsWith('/') || value.startsWith('~/') || value.startsWith('$HOME/');
const isDangerousRemoteDirectory = (value: string): boolean => {
  const normalized = value.replace(/\/+$/, '') || value;
  return normalized === '/' || normalized === '~' || normalized === '$HOME' || normalized === '.';
};

const remoteShellPathSchema = sshPathSchema
  .regex(/^[^\0\r\n]*$/)
  .refine((value) => !hasPathTraversal(value), {
    message: 'Path traversal is not allowed',
  });
const dockerComposeBasePathSchema = remoteShellPathSchema.refine(
  (value) => !isDangerousRemoteDirectory(value),
  {
    message: 'Base path must not point to a root or home directory',
  }
);
const dockerComposeProjectPathSchema = dockerComposeBasePathSchema
  .refine(isAnchoredRemotePath, {
    message: 'Project path must be absolute or home-relative',
  })
  .refine((value) => value.split('/').filter(Boolean).length >= 2, {
    message: 'Project path must include a parent directory and project name',
  });

const dockerIdentifierSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/);
const dockerContainerIdSchema = dockerIdentifierSchema;
export const dockerContainerSchema = sshSessionSchema.extend({
  containerId: dockerContainerIdSchema,
});
const dockerLogsBaseSchema = dockerContainerSchema.extend({
  tail: z.number().finite().int().positive().max(10000).optional(),
});
const dockerExecSessionBaseSchema = z.object({
  execSessionId: idSchema,
});
const dockerComposePathBaseSchema = sshSessionSchema.extend({
  path: remoteShellPathSchema,
});

export const dockerPsSchema = sshSessionSchema.extend({
  all: z.boolean().optional(),
});

export const dockerActionSchema = dockerContainerSchema.extend({
  action: z.enum(['start', 'stop', 'restart', 'remove']),
});

export const dockerLogsSchema = dockerLogsBaseSchema;

export const dockerComposeActionSchema = sshSessionSchema.extend({
  projectName: dockerIdentifierSchema,
  action: z.enum(['start', 'stop', 'restart']),
});

export const dockerImageRemoveSchema = sshSessionSchema.extend({
  imageId: z.string().min(1).max(255),
  force: z.boolean().optional(),
});

export const dockerPruneImagesSchema = sshSessionSchema.extend({
  all: z.boolean().optional(),
});

export const dockerNetworkCreateSchema = sshSessionSchema.extend({
  name: dockerIdentifierSchema,
  driver: dockerIdentifierSchema.max(64).optional(),
  subnet: z.string().min(1).max(128).regex(/^[0-9a-fA-F:./]+$/).optional(),
  gateway: z.string().min(1).max(128).regex(/^[0-9a-fA-F:.]+$/).optional(),
  ipv6: z.boolean().optional(),
  internal: z.boolean().optional(),
});

export const dockerNetworkRemoveSchema = sshSessionSchema.extend({
  networkId: dockerIdentifierSchema,
});

export const dockerExecStartSchema = dockerContainerSchema.extend({
  shell: z.string().min(1).max(255).regex(/^\/[A-Za-z0-9_./+-]+$/).optional(),
  cols: z.number().finite().int().min(1).max(1000).optional(),
  rows: z.number().finite().int().min(1).max(1000).optional(),
});

export const dockerExecSessionSchema = dockerExecSessionBaseSchema;

export const dockerExecSendSchema = dockerExecSessionBaseSchema.extend({
  data: terminalDataSchema,
});

export const dockerExecResizeSchema = dockerExecSessionBaseSchema.extend(terminalSizeSchema.shape);

export const dockerComposeProjectSchema = sshSessionSchema.extend({
  projectName: dockerIdentifierSchema,
});

export const dockerComposePathSchema = dockerComposePathBaseSchema;

export const dockerComposeFileWriteSchema = dockerComposePathBaseSchema.extend({
  content: z.string().max(2 * 1024 * 1024),
});

export const dockerComposeUpSchema = dockerComposePathBaseSchema.extend({
  detached: z.boolean().optional(),
  build: z.boolean().optional(),
});

export const dockerComposeDownSchema = dockerComposePathBaseSchema.extend({
  removeVolumes: z.boolean().optional(),
  removeOrphans: z.boolean().optional(),
});

export const dockerNetworkMemberSchema = dockerContainerSchema.extend({
  networkName: dockerIdentifierSchema,
});

export const dockerLogsStreamStartSchema = dockerLogsBaseSchema;

export const dockerLogsStreamStopSchema = z.object({
  streamId: idSchema,
});

export const dockerComposeDiscoverSchema = sshSessionSchema.extend({
  basePath: dockerComposeBasePathSchema.optional(),
});

export const dockerComposeCreateSchema = sshSessionSchema.extend({
  projectName: dockerIdentifierSchema,
  composeContent: z.string().min(1).max(2 * 1024 * 1024),
  basePath: dockerComposeBasePathSchema.optional(),
});

export const dockerComposeUpdateSchema = sshSessionSchema.extend({
  composePath: remoteShellPathSchema,
  composeContent: z.string().min(1).max(2 * 1024 * 1024),
});

export const dockerComposeCommandSchema = sshSessionSchema.extend({
  projectPath: dockerComposeProjectPathSchema,
  command: z.enum(['up', 'down', 'restart', 'pull', 'build', 'logs']),
  args: z.array(z.string().max(255)).max(20).optional(),
});

export const dockerComposeRemoveSchema = sshSessionSchema.extend({
  projectPath: dockerComposeProjectPathSchema,
  removeVolumes: z.boolean().optional(),
});

export const dockerComposeReadSchema = sshSessionSchema.extend({
  composePath: remoteShellPathSchema,
});

// Local Docker requests have no session identifier. They deliberately reuse the
// same constrained identifiers and enums as the SSH transport.
export const localDockerPsSchema = dockerPsSchema.omit({ sessionId: true });
export const localDockerContainerSchema = dockerContainerSchema.omit({ sessionId: true });
export const localDockerActionSchema = dockerActionSchema.omit({ sessionId: true });
export const localDockerLogsSchema = dockerLogsSchema.omit({ sessionId: true });
export const localDockerComposeActionSchema = dockerComposeActionSchema.omit({ sessionId: true });
export const localDockerImageRemoveSchema = dockerImageRemoveSchema.omit({ sessionId: true });
export const localDockerPruneImagesSchema = dockerPruneImagesSchema.omit({ sessionId: true });
export const localDockerNetworkCreateSchema = dockerNetworkCreateSchema.omit({ sessionId: true });
export const localDockerNetworkRemoveSchema = dockerNetworkRemoveSchema.omit({ sessionId: true });
export const localDockerNetworkMemberSchema = dockerNetworkMemberSchema.omit({ sessionId: true });
