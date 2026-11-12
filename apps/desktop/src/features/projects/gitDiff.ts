/** Pure unified-diff parsing and word-level diffing for the project diff viewer. */

export const MAX_DIFF_LINES = 20_000;

export type DiffLineType = 'context' | 'add' | 'del';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldNumber?: number;
  newNumber?: number;
  noNewline?: boolean;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export type DiffFileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: DiffFileStatus;
  binary: boolean;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface ParsedDiff {
  files: DiffFile[];
  truncated: boolean;
}

function unquoteGitPath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"') || value.length < 2) return value;
  const escapes: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\' };
  const bytes: number[] = [];
  const inner = value.slice(1, -1);
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char !== '\\') {
      bytes.push(...new TextEncoder().encode(char));
      continue;
    }
    const next = inner[index + 1] ?? '';
    const octal = /^[0-7]{3}/.exec(inner.slice(index + 1));
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      index += 3;
    } else {
      bytes.push(...new TextEncoder().encode(escapes[next] ?? next));
      index += 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function stripPrefix(path: string): string {
  const unquoted = unquoteGitPath(path);
  return /^[abciow]\//.test(unquoted) ? unquoted.slice(2) : unquoted;
}

/** Paths from "diff --git a/x b/y" (only used when ---/+++ or rename lines are absent). */
function parseGitHeaderPaths(rest: string): [string, string] {
  if (rest.startsWith('"')) {
    const end = rest.indexOf('" ', 1);
    if (end > 0) return [stripPrefix(rest.slice(0, end + 1)), stripPrefix(rest.slice(end + 2))];
  }
  // Same path on both sides: "a/<p> b/<p>".
  const half = (rest.length - 5) / 2;
  if (Number.isInteger(half) && half > 0 && rest.slice(2, 2 + half) === rest.slice(5 + half)) {
    const path = rest.slice(2, 2 + half);
    return [path, path];
  }
  const separator = rest.indexOf(' b/');
  if (separator > 0) return [stripPrefix(rest.slice(0, separator)), rest.slice(separator + 3)];
  return [rest, rest];
}

function fileHeaderPath(line: string): string | null {
  // "--- a/path\t" (git appends a tab when the path has spaces), or /dev/null.
  const value = line.slice(4).replace(/\t$/, '');
  return value === '/dev/null' ? null : stripPrefix(value);
}

export function parseUnifiedDiff(text: string, maxLines = MAX_DIFF_LINES): ParsedDiff {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const truncated = lines.length > maxLines;
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNumber = 0;
  let newNumber = 0;
  let prefixWidth = 1;

  for (const line of lines.slice(0, maxLines)) {
    if (line.startsWith('diff --git ') || line.startsWith('diff --cc ') || line.startsWith('diff --combined ')) {
      const rest = line.replace(/^diff --(?:git|cc|combined) /, '');
      const [oldPath, newPath] = line.startsWith('diff --git ')
        ? parseGitHeaderPaths(rest)
        : [unquoteGitPath(rest), unquoteGitPath(rest)];
      file = { oldPath, newPath, status: 'modified', binary: false, hunks: [], additions: 0, deletions: 0 };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;

    const hunkHeader = /^(@@+) (.*?) @@+(.*)$/.exec(line);
    if (hunkHeader) {
      const ranges = hunkHeader[2].split(' ');
      const start = (range: string | undefined) => Number(/^[-+](\d+)/.exec(range ?? '')?.[1] ?? 0);
      prefixWidth = hunkHeader[1].length - 1;
      oldNumber = start(ranges[0]);
      newNumber = start(ranges[ranges.length - 1]);
      hunk = { header: line, oldStart: oldNumber, newStart: newNumber, lines: [] };
      file.hunks.push(hunk);
      continue;
    }

    if (!hunk) {
      if (line.startsWith('new file mode')) file.status = 'added';
      else if (line.startsWith('deleted file mode')) file.status = 'deleted';
      else if (line.startsWith('rename from ')) {
        file.status = 'renamed';
        file.oldPath = unquoteGitPath(line.slice('rename from '.length));
      } else if (line.startsWith('rename to ')) file.newPath = unquoteGitPath(line.slice('rename to '.length));
      else if (line.startsWith('copy from ')) {
        file.status = 'copied';
        file.oldPath = unquoteGitPath(line.slice('copy from '.length));
      } else if (line.startsWith('copy to ')) file.newPath = unquoteGitPath(line.slice('copy to '.length));
      else if (line.startsWith('Binary files ') || line === 'GIT binary patch') file.binary = true;
      else if (line.startsWith('--- ')) {
        const path = fileHeaderPath(line);
        if (path === null) file.status = 'added';
        else file.oldPath = path;
      } else if (line.startsWith('+++ ')) {
        const path = fileHeaderPath(line);
        if (path === null) file.status = 'deleted';
        else file.newPath = path;
      }
      continue;
    }

    if (line.startsWith('\\')) {
      const previous = hunk.lines[hunk.lines.length - 1];
      if (previous) previous.noNewline = true;
      continue;
    }
    const prefix = line.slice(0, prefixWidth);
    const content = line.slice(prefixWidth);
    if (prefix.includes('-')) {
      hunk.lines.push({ type: 'del', content, oldNumber: oldNumber++ });
      file.deletions += 1;
    } else if (prefix.includes('+')) {
      hunk.lines.push({ type: 'add', content, newNumber: newNumber++ });
      file.additions += 1;
    } else {
      hunk.lines.push({ type: 'context', content, oldNumber: oldNumber++, newNumber: newNumber++ });
    }
  }

  return { files, truncated };
}

export interface DiffRow {
  left?: DiffLine;
  right?: DiffLine;
}

/** Side-by-side rows: context on both sides, runs of deletions zipped with the following additions. */
export function pairHunkLines(lines: DiffLine[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.type === 'context') {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }
    const deletions: DiffLine[] = [];
    const additions: DiffLine[] = [];
    while (lines[index]?.type === 'del') deletions.push(lines[index++]);
    while (lines[index]?.type === 'add') additions.push(lines[index++]);
    for (let row = 0; row < Math.max(deletions.length, additions.length); row += 1) {
      rows.push({ left: deletions[row], right: additions[row] });
    }
  }
  return rows;
}

export interface WordSegment {
  text: string;
  changed: boolean;
}

const MAX_WORD_DIFF_CELLS = 250_000;

function tokenize(line: string): string[] {
  return line.match(/\w+|\s+|[^\w\s]/g) ?? [];
}

function mergeSegments(tokens: string[], changed: boolean[]): WordSegment[] {
  const segments: WordSegment[] = [];
  tokens.forEach((text, index) => {
    const last = segments[segments.length - 1];
    if (last && last.changed === changed[index]) last.text += text;
    else segments.push({ text, changed: changed[index] });
  });
  return segments;
}

/** Token-level LCS diff of a changed line pair. Returns null when too large to diff cheaply. */
export function diffWords(
  oldLine: string,
  newLine: string
): { old: WordSegment[]; new: WordSegment[] } | null {
  const a = tokenize(oldLine);
  const b = tokenize(newLine);
  if ((a.length + 1) * (b.length + 1) > MAX_WORD_DIFF_CELLS) return null;
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const oldChanged = new Array<boolean>(a.length).fill(true);
  const newChanged = new Array<boolean>(b.length).fill(true);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      oldChanged[i++] = false;
      newChanged[j++] = false;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) i += 1;
    else j += 1;
  }
  return { old: mergeSegments(a, oldChanged), new: mergeSegments(b, newChanged) };
}

/** Simple subsequence fuzzy match; lower score is better, null means no match. */
export function fuzzyScore(path: string, query: string): number | null {
  const haystack = path.toLowerCase();
  const needle = query.toLowerCase().replace(/\s+/g, '');
  if (!needle) return 0;
  let position = -1;
  let score = 0;
  for (const char of needle) {
    const next = haystack.indexOf(char, position + 1);
    if (next < 0) return null;
    score += next - position - 1;
    position = next;
  }
  // Prefer matches inside the file name over matches in directories.
  const nameStart = haystack.lastIndexOf('/') + 1;
  return score + (haystack.indexOf(needle[0], nameStart) >= 0 ? 0 : 50) + haystack.length * 0.01;
}
