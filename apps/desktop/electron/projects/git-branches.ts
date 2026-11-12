import type { GitBranchesData } from '@ownshell/core';
import { shellQuote, shellQuotePath } from '../utils/shell-quote';

export const MAX_BRANCHES = 500;

export function isSafeBranchName(branch: string): boolean {
  return (
    branch.length > 0 &&
    branch.length <= 255 &&
    !branch.startsWith('-') &&
    !/[\0-\x20\x7f]/.test(branch)
  );
}

export function buildGitBranchListCommand(repositoryPath: string): string {
  const format = '%(HEAD)%09%(refname:short)%09%(upstream:short)';
  return `git -C ${shellQuotePath(repositoryPath)} for-each-ref --format=${shellQuote(format)} refs/heads | head -n ${MAX_BRANCHES + 1}`;
}

export function parseGitBranches(output: string): GitBranchesData {
  const lines = output.split('\n').filter(Boolean);
  const truncated = lines.length > MAX_BRANCHES;

  return {
    branches: lines.slice(0, MAX_BRANCHES).flatMap((line) => {
      const [head, name, upstream = ''] = line.split('\t', 3);
      if (!name || !isSafeBranchName(name)) return [];

      return [{ name, current: head === '*', upstream: upstream || null }];
    }),
    truncated,
  };
}

export function buildGitBranchNameValidationCommand(
  repositoryPath: string,
  branch: string
): string {
  return `git -C ${shellQuotePath(repositoryPath)} check-ref-format --branch ${shellQuote(branch)}`;
}

export function buildGitCreateBranchCommand(repositoryPath: string, branch: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} branch -- ${shellQuote(branch)}`;
}

export function buildGitSwitchBranchCommand(repositoryPath: string, branch: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} switch -- ${shellQuote(branch)}`;
}

export function buildGitDeleteBranchCommand(repositoryPath: string, branch: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} branch -d -- ${shellQuote(branch)}`;
}
