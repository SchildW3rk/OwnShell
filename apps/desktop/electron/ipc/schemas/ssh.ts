import { z } from 'zod';
import { idSchema, noPayloadSchema, portSchema, terminalDataSchema, sshPathSchema } from './common';
export { noPayloadSchema };
import { isSafeGitCodePath } from '../../projects/git-code';
import {
  MAX_GIT_HISTORY_SKIP,
  isSafeGitHistoryQuery,
} from '../../projects/git-history';

const terminalSizeSchema = z.object({
  cols: z.number().finite().int().min(1).max(1000),
  rows: z.number().finite().int().min(1).max(1000),
});


export const sshConnectSchema = z.object({
  hostId: idSchema,
  hostname: z.string().min(1).max(255),
  port: portSchema,
  username: z.string().min(1).max(255),
  passwordEncrypted: z.string().min(1).optional(),
  privateKeyEncrypted: z.string().min(1).optional(),
  passphraseEncrypted: z.string().min(1).optional(),
  authType: z.enum(['password', 'key']),
  jumpHostId: idSchema.nullable().optional(),
});

export const sshSessionSchema = z.object({
  sessionId: idSchema,
});

export const sshSendSchema = sshSessionSchema.extend({
  data: terminalDataSchema,
});

export const sshResizeSchema = sshSessionSchema.extend(terminalSizeSchema.shape);

export const sshSftpPathSchema = sshSessionSchema.extend({
  path: sshPathSchema,
});

export const sshSftpRemotePathSchema = sshSessionSchema.extend({
  remotePath: sshPathSchema,
});

export const sshSftpRenameSchema = sshSessionSchema.extend({
  oldPath: sshPathSchema,
  newPath: sshPathSchema,
});

export const sshSftpChmodSchema = sshSftpPathSchema.extend({
  mode: z.number().finite().int().min(0).max(0o7777),
});

export const sshSftpReadFileSchema = sshSftpPathSchema.extend({
  maxSize: z
    .number()
    .finite()
    .int()
    .positive()
    .max(25 * 1024 * 1024)
    .optional(),
});

export const sshSftpWriteFileSchema = sshSftpPathSchema.extend({
  content: z.string().max(50 * 1024 * 1024),
  encoding: z.enum(['utf-8', 'latin1']),
});

export const sshTunnelStartSchema = sshSessionSchema.extend({
  config: z.object({
    localPort: portSchema,
    remoteHost: z.string().min(1).max(255),
    remotePort: portSchema,
    description: z.string().max(255).optional(),
  }),
});

export const sshTunnelIdSchema = z.object({
  tunnelId: idSchema,
});

export const sshSftpDownloadToTempSchema = sshSftpRemotePathSchema.extend({
  prefix: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});

export const sshSftpUploadFromTempSchema = sshSessionSchema.extend({
  localPath: z.string().min(1).max(4096),
  remotePath: sshPathSchema,
});

export const sshViewerSchema = sshSessionSchema.extend({
  viewerId: idSchema,
});

export const hostIdSchema = z.object({
  hostId: idSchema,
});

export const cleanupTempSchema = z.object({
  localPath: z.string().min(1).max(4096),
});

export const sshProjectIdSchema = idSchema;

const gitRelativePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\0') &&
      !path.includes('\n') &&
      !path.includes('\r') &&
      !path.split('/').includes('..')
  );

export const sshGitDiffSchema = z.object({
  projectId: idSchema,
  path: gitRelativePathSchema,
  scope: z.enum(['staged', 'unstaged']),
});

export const sshGitFileActionSchema = z.object({
  projectId: idSchema,
  path: gitRelativePathSchema,
});

export const sshGitCreateCommitSchema = z.object({
  projectId: idSchema,
  message: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(
      (message) => !message.includes('\0') && !message.includes('\n') && !message.includes('\r')
    ),
});

const gitBranchNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((branch) => !branch.startsWith('-') && !/[\0-\x20\x7f]/.test(branch));

export const sshGitBranchActionSchema = z.object({
  projectId: idSchema,
  branch: gitBranchNameSchema,
});

export const sshGitHistorySchema = z.object({
  projectId: idSchema,
  skip: z.number().int().min(0).max(MAX_GIT_HISTORY_SKIP),
  query: z.string().trim().refine(isSafeGitHistoryQuery).optional(),
  field: z.enum(['message', 'author']).optional(),
});

export const sshGitCommitDetailsSchema = z.object({
  projectId: idSchema,
  commitHash: z
    .string()
    .regex(/^[0-9a-fA-F]{40,64}$/)
    .transform((hash) => hash.toLowerCase()),
});

const gitCodePathSchema = z
  .string()
  .max(4096)
  .refine((path) => isSafeGitCodePath(path));

export const sshGitCodeDirectorySchema = z.object({
  projectId: idSchema,
  path: gitCodePathSchema,
});

export const sshGitCodeFileSchema = z.object({
  projectId: idSchema,
  path: gitCodePathSchema.refine((path) => isSafeGitCodePath(path, false)),
});
