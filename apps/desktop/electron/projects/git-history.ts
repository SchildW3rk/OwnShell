import type { GitCommitHistoryData, GitCommitSummary } from '@ownshell/core';
import { shellQuote, shellQuotePath } from '../utils/shell-quote';

const COMMIT_FIELD_SEPARATOR = '\u001f';
const COMMIT_RECORD_SEPARATOR = '\u001e';

export const MAX_GIT_COMMITS = 50;
export const MAX_GIT_HISTORY_BYTES = 512 * 1024;
export const MAX_GIT_COMMIT_DIFF_BYTES = 512 * 1024;
const MAX_GIT_COMMIT_METADATA_BYTES = 64 * 1024;

const COMMIT_FORMAT = '%H%x1f%h%x1f%an%x1f%aI%x1f%s';

export function parseGitCommitSummary(output: string): GitCommitSummary | null {
  const value = output.trim();
  if (!value) return null;

  const [hash, shortHash, author, authoredAt, subject] = value.split(COMMIT_FIELD_SEPARATOR, 5);
  if (!/^[0-9a-f]{40,64}$/i.test(hash || '') || !shortHash) return null;

  return {
    hash,
    shortHash,
    author: author || '',
    authoredAt: authoredAt || '',
    subject: subject || '',
  };
}

export function parseGitCommitHistory(
  output: string,
  outputTruncated = false
): GitCommitHistoryData {
  const completeTerminator =
    output.length === 0 || output.trimEnd().endsWith(COMMIT_RECORD_SEPARATOR);
  const commits = output
    .split(COMMIT_RECORD_SEPARATOR)
    .map(parseGitCommitSummary)
    .filter((commit): commit is GitCommitSummary => commit !== null);

  return {
    commits: commits.slice(0, MAX_GIT_COMMITS),
    truncated: outputTruncated || !completeTerminator || commits.length > MAX_GIT_COMMITS,
  };
}

export function buildGitCommitHistoryCommand(repositoryPath: string): string {
  const format = `${COMMIT_FORMAT}%x1e`;
  return `git -C ${shellQuotePath(repositoryPath)} log -n ${MAX_GIT_COMMITS + 1} --format=${shellQuote(format)} | head -c ${MAX_GIT_HISTORY_BYTES + 1}`;
}

export function buildGitCommitValidationCommand(
  repositoryPath: string,
  commitHash: string
): string {
  return `git -C ${shellQuotePath(repositoryPath)} cat-file -e ${shellQuote(`${commitHash}^{commit}`)}`;
}

export function buildGitCommitSummaryCommand(repositoryPath: string, commitHash: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} show -s --format=${shellQuote(COMMIT_FORMAT)} ${shellQuote(commitHash)} | head -c ${MAX_GIT_COMMIT_METADATA_BYTES + 1}`;
}

export function buildGitCommitDiffCommand(repositoryPath: string, commitHash: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} show --format= --no-ext-diff --no-color --find-renames --find-copies --unified=3 ${shellQuote(commitHash)} -- | head -c ${MAX_GIT_COMMIT_DIFF_BYTES + 1}`;
}

export function truncateGitCommitDiff(content: string): {
  content: string;
  truncated: boolean;
} {
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.length <= MAX_GIT_COMMIT_DIFF_BYTES) {
    return { content, truncated: false };
  }

  return {
    content: bytes.subarray(0, MAX_GIT_COMMIT_DIFF_BYTES).toString('utf8'),
    truncated: true,
  };
}
