import type {
  GitCommitHistoryData,
  GitCommitSummary,
  GitDiffFileStat,
  GitHistorySearchField,
} from '@ownshell/core';
import { shellQuote, shellQuotePath } from '../utils/shell-quote';

const COMMIT_FIELD_SEPARATOR = '\u001f';
const COMMIT_RECORD_SEPARATOR = '\u001e';

export const MAX_GIT_COMMITS = 50;
export const MAX_GIT_HISTORY_BYTES = 512 * 1024;
export const MAX_GIT_COMMIT_DIFF_BYTES = 5 * 1024 * 1024;
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

export const MAX_GIT_HISTORY_SKIP = 1_000_000;
export const MAX_GIT_HISTORY_QUERY_LENGTH = 200;

export function isSafeGitHistoryQuery(query: string): boolean {
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  return query.length <= MAX_GIT_HISTORY_QUERY_LENGTH && !/[\0-\x1f\x7f]/.test(query);
}

export function buildGitCommitHistoryCommand(
  repositoryPath: string,
  options: { skip?: number; query?: string; field?: GitHistorySearchField } = {}
): string {
  const { skip = 0, query = '', field = 'message' } = options;
  if (!Number.isSafeInteger(skip) || skip < 0 || skip > MAX_GIT_HISTORY_SKIP) {
    throw new Error('Invalid history offset');
  }
  if (!isSafeGitHistoryQuery(query)) throw new Error('Invalid history search');
  const format = `${COMMIT_FORMAT}%x1e`;
  // Fixed-string, case-insensitive match: the query is never interpreted as a regex.
  const filter = query
    ? ` --regexp-ignore-case --fixed-strings ${shellQuote(`--${field === 'author' ? 'author' : 'grep'}=${query}`)}`
    : '';
  const offset = skip > 0 ? ` --skip=${skip}` : '';
  return `git -C ${shellQuotePath(repositoryPath)} log -n ${MAX_GIT_COMMITS + 1}${offset}${filter} --format=${shellQuote(format)} | head -c ${MAX_GIT_HISTORY_BYTES + 1}`;
}

export const MAX_GIT_NUMSTAT_BYTES = 1024 * 1024;
export const MAX_GIT_NUMSTAT_FILES = 2000;

export function buildGitCommitNumstatCommand(repositoryPath: string, commitHash: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} show --format= --numstat -z --no-ext-diff --find-renames --find-copies ${shellQuote(commitHash)} -- | head -c ${MAX_GIT_NUMSTAT_BYTES + 1}`;
}

/**
 * Parses `--numstat -z` output. Records: "add\tdel\tpath\0", or for renames
 * "add\tdel\t\0old\0new\0". Binary files report "-\t-".
 */
export function parseGitNumstat(
  output: string,
  outputTruncated = false
): { files: GitDiffFileStat[]; truncated: boolean } {
  const records = output.split('\0');
  const complete = output.length === 0 || output.endsWith('\0');
  // A cut-off final record is incomplete; drop it.
  records.pop();
  const files: GitDiffFileStat[] = [];
  let truncated = outputTruncated || !complete;
  for (let index = 0; index < records.length; index += 1) {
    const match = /^\n?(-|\d+)\t(-|\d+)\t(.*)$/s.exec(records[index]);
    if (!match) continue;
    let path = match[3];
    let originalPath: string | undefined;
    if (path === '') {
      originalPath = records[index + 1];
      path = records[index + 2] ?? '';
      index += 2;
      if (!originalPath || !path) continue;
    }
    if (files.length >= MAX_GIT_NUMSTAT_FILES) {
      truncated = true;
      break;
    }
    files.push({
      path,
      ...(originalPath ? { originalPath } : {}),
      additions: match[1] === '-' ? null : Number(match[1]),
      deletions: match[2] === '-' ? null : Number(match[2]),
    });
  }
  return { files, truncated };
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
