import type { GitDiffScope } from '@ownshell/core';
import { shellQuote, shellQuotePath } from '../utils/shell-quote';

export const MAX_DIFF_BYTES = 256 * 1024;

export function isSafeRepositoryRelativePath(path: string): boolean {
  if (
    !path ||
    path.length > 4096 ||
    path.startsWith('/') ||
    path.includes('\0') ||
    path.includes('\n') ||
    path.includes('\r')
  ) {
    return false;
  }

  return !path.split('/').some((segment) => segment === '..');
}

export function buildGitStatusForPathCommand(repositoryPath: string, path: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} status --porcelain=v1 -z --untracked-files=all -- ${shellQuote(path)}`;
}

export function buildGitDiffCommand(
  repositoryPath: string,
  path: string,
  scope: GitDiffScope,
  untracked: boolean
): string {
  const git = `git -C ${shellQuotePath(repositoryPath)}`;
  const pathArgument = shellQuote(path);
  const diff = untracked
    ? `${git} diff --no-ext-diff --no-color --no-index -- /dev/null ${pathArgument}`
    : `${git} diff --no-ext-diff --no-color --unified=3 ${
        scope === 'staged' ? '--cached ' : ''
      }-- ${pathArgument}`;

  return `${diff} | head -c ${MAX_DIFF_BYTES + 1}`;
}

export function truncateGitDiff(content: string): { content: string; truncated: boolean } {
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.length <= MAX_DIFF_BYTES) return { content, truncated: false };

  return {
    content: bytes.subarray(0, MAX_DIFF_BYTES).toString('utf8'),
    truncated: true,
  };
}
