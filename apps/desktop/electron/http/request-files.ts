import type { SettingsQueries } from '@ownshell/core';
import { constants } from 'node:fs';
import { open, realpath, stat, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { ApiRequestError, MAX_REQUEST_BODY_BYTES, type LoadedFile } from './prepare-request';

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
};

export function guessContentType(fileName: string): string {
  return CONTENT_TYPES[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream';
}

/** Identity of a file at pick time; the file sent later must be this exact inode. */
export interface PickedFileIdentity {
  dev: string;
  ino: string;
}

/** Files the user picked in the main-process dialog; only these may be sent. */
export interface PickedFiles {
  identity(realPath: string): Promise<PickedFileIdentity | undefined>;
  add(realPath: string): Promise<void>;
}

const PICKED_FILES_KEY = 'apiClient.pickedFiles';
// shortcut: oldest picks drop out after this many, those requests need the file selected again.
const MAX_PICKED_FILES = 500;

type PickedEntry = PickedFileIdentity & { path: string };

async function fileIdentity(realPath: string): Promise<PickedFileIdentity> {
  const info = await stat(realPath, { bigint: true });
  return { dev: info.dev.toString(), ino: info.ino.toString() };
}

/** Persists picked files in a main-only setting (not in the renderer's settings allowlist). */
export function createPickedFiles(settings: Pick<SettingsQueries, 'get' | 'set'>): PickedFiles {
  let cache: Promise<PickedEntry[]> | undefined;
  const load = () =>
    (cache ??= settings
      .get(PICKED_FILES_KEY)
      .then((value) => {
        const list: unknown = value ? JSON.parse(value) : [];
        return Array.isArray(list)
          ? list.filter(
              (item): item is PickedEntry =>
                !!item &&
                typeof item.path === 'string' &&
                typeof item.dev === 'string' &&
                typeof item.ino === 'string'
            )
          : [];
      })
      .catch(() => []));
  return {
    async identity(realPath) {
      const entry = (await load()).find((item) => item.path === realPath);
      return entry && { dev: entry.dev, ino: entry.ino };
    },
    async add(realPath) {
      const entry = { path: realPath, ...(await fileIdentity(realPath)) };
      const list = [...(await load()).filter((item) => item.path !== realPath), entry].slice(-MAX_PICKED_FILES);
      cache = Promise.resolve(list);
      await settings.set({ key: PICKED_FILES_KEY, value: JSON.stringify(list), updated_at: Date.now() });
    },
  };
}

const READ_CHUNK_BYTES = 1024 * 1024;

/**
 * Reads a request body file. The path comes from the renderer, so its real path
 * (symlinks resolved) must be one the user picked, and at most `maxBytes` are read.
 */
export async function loadRequestFile(
  filePath: string,
  picked: Pick<PickedFiles, 'identity'>,
  maxBytes = MAX_REQUEST_BODY_BYTES
): Promise<LoadedFile> {
  const name = path.basename(filePath);
  if (!path.isAbsolute(filePath)) {
    throw new ApiRequestError('FILE_ERROR', 'File path must be absolute', name);
  }
  let handle: FileHandle | undefined;
  try {
    const realPath = await realpath(filePath);
    const pickedIdentity = await picked.identity(realPath);
    if (!pickedIdentity) {
      throw new ApiRequestError('FILE_ERROR', 'Select the file again', name);
    }
    handle = await open(realPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    // The opened handle must be the exact file the user picked: this also catches a parent
    // directory swapped for a symlink after realpath() (NOFOLLOW only guards the last part).
    const info = await handle.stat({ bigint: true });
    if (info.dev.toString() !== pickedIdentity.dev || info.ino.toString() !== pickedIdentity.ino) {
      throw new ApiRequestError('FILE_ERROR', 'Select the file again', name);
    }
    if (!info.isFile()) throw new ApiRequestError('FILE_ERROR', 'Not a regular file', name);
    if (info.size > BigInt(maxBytes)) {
      throw new ApiRequestError('BODY_TOO_LARGE', 'Request body exceeds the 50 MB limit', name);
    }
    // Bounded read: the file may have grown since stat.
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.alloc(Math.min(READ_CHUNK_BYTES, maxBytes + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) {
        throw new ApiRequestError('BODY_TOO_LARGE', 'Request body exceeds the 50 MB limit', name);
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return { data: Buffer.concat(chunks, total), name, contentType: guessContentType(name) };
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError('FILE_ERROR', `Cannot read file ${name}`, name);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
