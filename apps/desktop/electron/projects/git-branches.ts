import type { GitBranchesData } from '@ownshell/core';
import { shellQuote, shellQuotePath } from '../utils/shell-quote';
import { isValidGitBranchName } from './git-ref-name';

export const MAX_BRANCHES = 500;

export function isSafeBranchName(branch: string): boolean {
  return isValidGitBranchName(branch);
}

const BRANCH_LIST_FORMAT = [
  '%(HEAD)',
  '%(refname)',
  '%(upstream:short)',
  '%(upstream:track,nobracket)',
  '%(committerdate:iso-strict)',
  '%(contents:subject)',
].join('%09');

export function buildGitBranchListCommand(repositoryPath: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} for-each-ref --format=${shellQuote(BRANCH_LIST_FORMAT)} refs/heads refs/remotes | head -n ${MAX_BRANCHES + 1}`;
}

/** Parses `%(upstream:track,nobracket)`: "", "gone", "ahead 1", "behind 2", "ahead 1, behind 2". */
export function parseGitBranchTrack(track: string): {
  ahead: number;
  behind: number;
  upstreamGone: boolean;
} {
  const count = (label: string) => {
    const value = Number(new RegExp(`${label} (\\d+)`).exec(track)?.[1] ?? 0);
    return Number.isSafeInteger(value) ? value : 0;
  };
  return { ahead: count('ahead'), behind: count('behind'), upstreamGone: track.trim() === 'gone' };
}

export function parseGitBranches(output: string): GitBranchesData {
  const lines = output.split('\n').filter(Boolean);
  const truncated = lines.length > MAX_BRANCHES;

  return {
    branches: lines.slice(0, MAX_BRANCHES).flatMap((line) => {
      const [head, refname = '', upstream = '', track = '', date = '', ...subject] =
        line.split('\t');
      const remote = refname.startsWith('refs/remotes/');
      if (!remote && !refname.startsWith('refs/heads/')) return [];
      const name = refname.slice(remote ? 'refs/remotes/'.length : 'refs/heads/'.length);
      // Skip symbolic remote HEADs such as origin/HEAD.
      if (!isSafeBranchName(name) || (remote && name.endsWith('/HEAD'))) return [];

      return [
        {
          name,
          current: head === '*',
          upstream: upstream || null,
          remote,
          ...parseGitBranchTrack(track),
          lastCommitDate: date,
          lastCommitSubject: subject.join('\t').slice(0, 500),
        },
      ];
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

export function buildGitRemoteBranchExistsCommand(
  repositoryPath: string,
  remoteBranch: string
): string {
  return `git -C ${shellQuotePath(repositoryPath)} show-ref --verify --quiet -- ${shellQuote(`refs/remotes/${remoteBranch}`)}`;
}

/** Local name for a remote-tracking branch: "origin/feature/x" -> "feature/x". */
export function localNameForRemoteBranch(remoteBranch: string): string | null {
  const slash = remoteBranch.indexOf('/');
  const local = slash > 0 ? remoteBranch.slice(slash + 1) : '';
  return isValidGitBranchName(local) ? local : null;
}

export function buildGitCheckoutRemoteBranchCommand(
  repositoryPath: string,
  remoteBranch: string,
  localBranch: string
): string {
  return `git -C ${shellQuotePath(repositoryPath)} switch -c ${shellQuote(localBranch)} --track -- ${shellQuote(`refs/remotes/${remoteBranch}`)}`;
}
