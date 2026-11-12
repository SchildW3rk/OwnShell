import type { GitCodeEntry } from '@ownshell/core';
import { shellQuotePath } from '../utils/shell-quote';

export const MAX_GIT_TREE_BYTES = 1024 * 1024;
export const MAX_GIT_TREE_ENTRIES = 1000;
export const MAX_GIT_CODE_FILE_BYTES = 512 * 1024;

export function isSafeGitCodePath(path: string, allowRoot = true): boolean {
  if (path === '') return allowRoot;
  return (
    path.length <= 4096 &&
    !path.startsWith('/') &&
    !path.endsWith('/') &&
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    !/[\0-\x1f\x7f]/.test(path) &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function safeTreeEntryName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    !/[\0-\x1f\x7f]/.test(name)
  );
}

export function parseGitTreeEntries(
  output: string,
  parentPath: string
): {
  entries: GitCodeEntry[];
  skipped: boolean;
} {
  if (!isSafeGitCodePath(parentPath)) throw new Error('Invalid Git directory path');
  const entries: GitCodeEntry[] = [];
  let skipped = false;
  for (const record of output.split('\0')) {
    if (!record) continue;
    const separator = record.indexOf('\t');
    if (separator < 0) {
      skipped = true;
      continue;
    }
    const [mode, type, objectId] = record.slice(0, separator).split(' ');
    const name = record.slice(separator + 1);
    if (
      !safeTreeEntryName(name) ||
      !/^[0-7]{6}$/.test(mode ?? '') ||
      !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(objectId ?? '') ||
      (type !== 'tree' && type !== 'blob' && type !== 'commit')
    ) {
      skipped = true;
      continue;
    }
    entries.push({
      name,
      path: parentPath ? `${parentPath}/${name}` : name,
      kind: type === 'tree' ? 'directory' : type === 'blob' ? 'file' : 'submodule',
      objectId,
      mode,
    });
    if (entries.length >= MAX_GIT_TREE_ENTRIES) return { entries, skipped: true };
  }
  entries.sort((left, right) => {
    const leftRank = left.kind === 'directory' ? 0 : left.kind === 'submodule' ? 1 : 2;
    const rightRank = right.kind === 'directory' ? 0 : right.kind === 'submodule' ? 1 : 2;
    return leftRank - rightRank || left.name.localeCompare(right.name);
  });
  return { entries, skipped };
}

export function buildGitTreeCommand(repositoryPath: string, path: string): string {
  if (!isSafeGitCodePath(path)) throw new Error('Invalid Git directory path');
  const treeish = path ? `HEAD:${path}` : 'HEAD';
  return `git -C ${shellQuotePath(repositoryPath)} ls-tree -z ${shellQuotePath(treeish)} | head -c ${MAX_GIT_TREE_BYTES + 1}`;
}

export function buildGitFileMetadataCommand(repositoryPath: string, path: string): string {
  if (!isSafeGitCodePath(path, false)) throw new Error('Invalid Git file path');
  const git = `git -C ${shellQuotePath(repositoryPath)}`;
  const object = shellQuotePath(`HEAD:${path}`);
  return `${git} cat-file -t ${object} && ${git} cat-file -s ${object}`;
}

export function buildGitFileContentCommand(repositoryPath: string, path: string): string {
  if (!isSafeGitCodePath(path, false)) throw new Error('Invalid Git file path');
  return `git -C ${shellQuotePath(repositoryPath)} cat-file blob ${shellQuotePath(`HEAD:${path}`)}`;
}
