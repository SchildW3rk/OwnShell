import type { GitCodeEntry } from '@ownshell/core';
import { shellQuote, shellQuotePath } from '../utils/shell-quote';

export const MAX_GIT_TREE_BYTES = 1024 * 1024;
export const MAX_GIT_TREE_ENTRIES = 1000;
export const MAX_GIT_CODE_FILE_BYTES = 1024 * 1024;
export const MAX_GIT_FILE_LIST_ENTRIES = 20_000;
export const MAX_GIT_FILE_LIST_BYTES = 4 * 1024 * 1024;

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

export function buildGitFileListCommand(repositoryPath: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} ls-tree -r -z --name-only HEAD | head -c ${MAX_GIT_FILE_LIST_BYTES + 1}`;
}

export function parseGitFileList(
  output: string,
  outputTruncated = false
): { paths: string[]; truncated: boolean } {
  const records = output.split('\0');
  const complete = output.length === 0 || output.endsWith('\0');
  records.pop(); // trailing empty record, or a cut-off one
  const paths = records.filter((path) => isSafeGitCodePath(path, false));
  return {
    paths: paths.slice(0, MAX_GIT_FILE_LIST_ENTRIES),
    truncated: outputTruncated || !complete || paths.length > MAX_GIT_FILE_LIST_ENTRIES,
  };
}

export const MAX_COMPOSE_CONTAINERS = 500;

export function isSafeComposeProjectName(name: string): boolean {
  // Compose project names: lowercase letters, digits, dashes and underscores.
  return /^[a-z0-9][a-z0-9_-]{0,254}$/.test(name);
}

export function buildComposeStatusCommand(composeProject: string): string {
  if (!isSafeComposeProjectName(composeProject)) throw new Error('Invalid compose project name');
  return `docker ps -a --filter ${shellQuote(`label=com.docker.compose.project=${composeProject}`)} --format '{{.State}}' | head -n ${MAX_COMPOSE_CONTAINERS + 1}`;
}

export function parseComposeStatus(output: string): { running: number; total: number; truncated: boolean } {
  const all = output.split('\n').map((line) => line.trim()).filter(Boolean);
  // One extra line is read so a cut-off list is reported instead of looking complete.
  const states = all.slice(0, MAX_COMPOSE_CONTAINERS);
  return {
    running: states.filter((state) => state === 'running').length,
    total: states.length,
    truncated: all.length > MAX_COMPOSE_CONTAINERS,
  };
}
