import type { GitChangedFile } from '@ownshell/core';
import { shellQuotePath } from '../utils/shell-quote';

const RENAME_OR_COPY_STATUS = new Set(['R', 'C']);

export interface ParsedGitStatus {
  files: GitChangedFile[];
  truncated: boolean;
}

export function buildGitRepositoryCheckCommand(repositoryPath: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} rev-parse --git-dir`;
}

export function buildGitBareRepositoryCheckCommand(repositoryPath: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} rev-parse --is-bare-repository`;
}

export function buildGitRepositoryRootCommand(repositoryPath: string, bare: boolean): string {
  const mode = bare ? '--absolute-git-dir' : '--show-toplevel';
  return `git -C ${shellQuotePath(repositoryPath)} rev-parse ${mode}`;
}

export function parseGitBareRepository(output: string): boolean | null {
  const value = output.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export function parseAheadBehind(output: string): { ahead: number; behind: number } {
  const [aheadValue, behindValue] = output.trim().split(/\s+/, 2);
  const ahead = Number.parseInt(aheadValue || '', 10);
  const behind = Number.parseInt(behindValue || '', 10);

  return {
    ahead: Number.isSafeInteger(ahead) && ahead >= 0 ? ahead : 0,
    behind: Number.isSafeInteger(behind) && behind >= 0 ? behind : 0,
  };
}

export function parseGitStatusPorcelain(
  output: string,
  maxFiles: number,
  outputTruncated = false
): ParsedGitStatus {
  const records = output.split('\0');
  const hasCompleteTerminator = output.length === 0 || output.endsWith('\0');
  if (hasCompleteTerminator) records.pop();

  const files: GitChangedFile[] = [];
  let index = 0;
  let totalFiles = 0;

  while (index < records.length) {
    const record = records[index];
    index += 1;
    if (!record || record.length < 4 || record[2] !== ' ') continue;

    const indexStatus = record[0];
    const worktreeStatus = record[1];
    const path = record.slice(3);
    if (!path) continue;

    let originalPath: string | undefined;
    if (RENAME_OR_COPY_STATUS.has(indexStatus) || RENAME_OR_COPY_STATUS.has(worktreeStatus)) {
      originalPath = records[index] || undefined;
      index += 1;
    }

    totalFiles += 1;
    if (files.length >= maxFiles) continue;

    const untracked = indexStatus === '?' && worktreeStatus === '?';
    files.push({
      status: `${indexStatus}${worktreeStatus}`.trim() || '?',
      path,
      originalPath,
      indexStatus,
      worktreeStatus,
      staged: !untracked && indexStatus !== ' ',
      unstaged: untracked || worktreeStatus !== ' ',
      untracked,
    });
  }

  return {
    files,
    truncated: outputTruncated || !hasCompleteTerminator || totalFiles > maxFiles,
  };
}
