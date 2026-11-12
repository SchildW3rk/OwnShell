import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  diffWords,
  fuzzyScore,
  pairHunkLines,
  parseUnifiedDiff,
} from '../src/features/projects/gitDiff';
import { isValidGitBranchName } from '../electron/projects/git-ref-name';
import {
  buildGitBranchListCommand,
  buildGitCheckoutRemoteBranchCommand,
  buildGitRemoteBranchExistsCommand,
  localNameForRemoteBranch,
  parseGitBranches,
  parseGitBranchTrack,
} from '../electron/projects/git-branches';
import {
  buildGitCommitHistoryCommand,
  buildGitCommitNumstatCommand,
  MAX_GIT_NUMSTAT_BYTES,
  parseGitNumstat,
} from '../electron/projects/git-history';
import { buildGitWorkingTreeNumstatCommand } from '../electron/projects/git-diff';
import {
  buildComposeStatusCommand,
  buildGitFileListCommand,
  MAX_GIT_FILE_LIST_BYTES,
  MAX_GIT_FILE_LIST_ENTRIES,
  MAX_COMPOSE_CONTAINERS,
  parseComposeStatus,
  parseGitFileList,
} from '../electron/projects/git-code';
import { sshGitHistorySchema } from '../electron/ipc/schemas/ssh';
import { getLanguage, hasLanguageSupport } from '../src/lib/codemirror-languages';
import { formatRelativeDate, highlightLines, lineSegments, MAX_DECORATED_LINE_CHARS } from '../src/features/projects/gitFormat';

test('parseUnifiedDiff handles multiple files, line numbers and no-newline markers', () => {
  const diff = [
    'diff --git a/src/app.ts b/src/app.ts',
    'index 1111111..2222222 100644',
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -1,3 +1,3 @@ function main() {',
    ' const a = 1;',
    '-const b = 2;',
    '+const b = 3;',
    ' const c = 4;',
    '\\ No newline at end of file',
    'diff --git a/new file.md b/new file.md',
    'new file mode 100644',
    'index 0000000..3333333',
    '--- /dev/null',
    '+++ b/new file.md\t',
    '@@ -0,0 +1,2 @@',
    '+# Title',
    '+text',
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
    '',
  ].join('\n');

  const parsed = parseUnifiedDiff(diff);
  assert.equal(parsed.truncated, false);
  assert.equal(parsed.files.length, 3);

  const [modified, added, deleted] = parsed.files;
  assert.equal(modified.status, 'modified');
  assert.equal(modified.newPath, 'src/app.ts');
  assert.equal(modified.additions, 1);
  assert.equal(modified.deletions, 1);
  assert.equal(modified.hunks[0].oldStart, 1);
  assert.deepEqual(
    modified.hunks[0].lines.map((line) => [line.type, line.oldNumber, line.newNumber]),
    [
      ['context', 1, 1],
      ['del', 2, undefined],
      ['add', undefined, 2],
      ['context', 3, 3],
    ]
  );
  assert.equal(modified.hunks[0].lines[3].noNewline, true);

  assert.equal(added.status, 'added');
  assert.equal(added.newPath, 'new file.md');
  assert.equal(added.additions, 2);
  assert.equal(added.hunks[0].lines[0].newNumber, 1);

  assert.equal(deleted.status, 'deleted');
  assert.equal(deleted.oldPath, 'gone.txt');
  assert.equal(deleted.deletions, 1);
});

test('parseUnifiedDiff handles renames, binary files, quoted paths and truncation', () => {
  const diff = [
    'diff --git a/old name.ts b/new name.ts',
    'similarity index 90%',
    'rename from old name.ts',
    'rename to new name.ts',
    'diff --git a/logo.png b/logo.png',
    'index 1..2 100644',
    'Binary files a/logo.png and b/logo.png differ',
    'diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"',
    'new file mode 100644',
    'index 0000000..1',
  ].join('\n');
  const parsed = parseUnifiedDiff(diff);
  assert.equal(parsed.files.length, 3);
  assert.equal(parsed.files[0].status, 'renamed');
  assert.equal(parsed.files[0].oldPath, 'old name.ts');
  assert.equal(parsed.files[0].newPath, 'new name.ts');
  assert.equal(parsed.files[0].hunks.length, 0);
  assert.equal(parsed.files[1].binary, true);
  assert.equal(parsed.files[1].newPath, 'logo.png');
  assert.equal(parsed.files[2].newPath, 'café.txt');
  assert.equal(parsed.files[2].status, 'added');

  const long = ['diff --git a/x b/x', '@@ -1,5 +1,5 @@', ...Array(10).fill(' same')].join('\n');
  const bounded = parseUnifiedDiff(long, 5);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.files[0].hunks[0].lines.length, 3);
});

test('parseUnifiedDiff tolerates combined merge diffs', () => {
  const parsed = parseUnifiedDiff(
    ['diff --cc conflict.txt', '@@@ -1,1 -1,1 +1,2 @@@', '- old', ' +new', '++both'].join('\n')
  );
  assert.equal(parsed.files[0].newPath, 'conflict.txt');
  assert.deepEqual(
    parsed.files[0].hunks[0].lines.map((line) => line.type),
    ['del', 'add', 'add']
  );
});

test('pairHunkLines zips deletions with following additions', () => {
  const { files } = parseUnifiedDiff(
    ['diff --git a/x b/x', '@@ -1,3 +1,2 @@', ' a', '-b', '-c', '+B', ' d'].join('\n')
  );
  const rows = pairHunkLines(files[0].hunks[0].lines);
  assert.equal(rows.length, 4);
  assert.equal(rows[1].left?.content, 'b');
  assert.equal(rows[1].right?.content, 'B');
  assert.equal(rows[2].left?.content, 'c');
  assert.equal(rows[2].right, undefined);
});

test('diffWords marks only changed tokens', () => {
  const result = diffWords('const value = 1;', 'const value = 2;');
  assert.ok(result);
  assert.deepEqual(result.old, [
    { text: 'const value = ', changed: false },
    { text: '1', changed: true },
    { text: ';', changed: false },
  ]);
  assert.deepEqual(result.new.filter((segment) => segment.changed), [{ text: '2', changed: true }]);
  assert.equal(diffWords('a '.repeat(600), 'b '.repeat(600)), null);
});

test('fuzzyScore matches subsequences and prefers file names', () => {
  assert.equal(fuzzyScore('src/app.ts', 'xyz'), null);
  const name = fuzzyScore('src/components/Button.tsx', 'button');
  const dir = fuzzyScore('button/src/index.ts', 'bt');
  assert.notEqual(name, null);
  assert.notEqual(dir, null);
  assert.ok((fuzzyScore('a/readme.md', 'readme') ?? 99) < (fuzzyScore('readme/x/y.md', 'readme') ?? 0) + 1);
});

test('parseGitNumstat handles plain, binary and renamed records', () => {
  const output = '-\t-\tbin.dat\x001\t0\t\x00f.txt\x00g.txt\x003\t2\tsrc/a b.ts\x00';
  assert.deepEqual(parseGitNumstat(output), {
    files: [
      { path: 'bin.dat', additions: null, deletions: null },
      { path: 'g.txt', originalPath: 'f.txt', additions: 1, deletions: 0 },
      { path: 'src/a b.ts', additions: 3, deletions: 2 },
    ],
    truncated: false,
  });
  const cut = parseGitNumstat('1\t1\ta.ts\x002\t2\tb.t');
  assert.equal(cut.files.length, 1);
  assert.equal(cut.truncated, true);
  assert.equal(parseGitNumstat('').truncated, false);
});

test('numstat and history commands quote and bound their inputs', () => {
  const repo = '/srv/repo; printf owned';
  const hash = 'a'.repeat(40);
  const numstat = buildGitCommitNumstatCommand(repo, hash);
  assert.match(numstat, /^git -C '\/srv\/repo; printf owned' show --format= --numstat -z/);
  assert.match(numstat, new RegExp(`'${hash}' -- \\| head -c ${MAX_GIT_NUMSTAT_BYTES + 1}$`));
  assert.match(buildGitWorkingTreeNumstatCommand(repo, 'staged', 10), / --cached \| head -c 11$/);
  assert.doesNotMatch(buildGitWorkingTreeNumstatCommand(repo, 'unstaged', 10), /--cached/);

  const search = buildGitCommitHistoryCommand(repo, {
    skip: 50,
    query: "fix'; rm -rf / #",
    field: 'message',
  });
  assert.match(search, / --skip=50 /);
  assert.match(search, /--regexp-ignore-case --fixed-strings '--grep=fix'\\''; rm -rf \/ #'/);
  assert.match(
    buildGitCommitHistoryCommand(repo, { query: '$(id)', field: 'author' }),
    /'--author=\$\(id\)'/
  );
  assert.doesNotMatch(buildGitCommitHistoryCommand(repo), /--skip|--grep|--author/);
  assert.throws(() => buildGitCommitHistoryCommand(repo, { skip: -1 }));
  assert.throws(() => buildGitCommitHistoryCommand(repo, { skip: 1.5 }));
  assert.throws(() => buildGitCommitHistoryCommand(repo, { query: 'a\nb' }));
  assert.throws(() => buildGitCommitHistoryCommand(repo, { query: 'x'.repeat(201) }));

  assert.equal(sshGitHistorySchema.safeParse({ projectId: 'p', skip: 0 }).success, true);
  assert.equal(
    sshGitHistorySchema.safeParse({ projectId: 'p', skip: 0, query: 'a', field: 'author' }).success,
    true
  );
  for (const payload of [
    { projectId: 'p', skip: -1 },
    { projectId: 'p', skip: 0, query: 'a\0b' },
    { projectId: 'p', skip: 0, field: 'committer' },
  ]) {
    assert.equal(sshGitHistorySchema.safeParse(payload).success, false);
  }
});

test('isValidGitBranchName mirrors git check-ref-format --branch', () => {
  for (const name of ['main', 'feature/x', 'fix-1.2', 'feature/$(printf-owned)', 'origin/main']) {
    assert.equal(isValidGitBranchName(name), true, name);
  }
  for (const name of [
    '',
    '-delete',
    'HEAD',
    '@',
    'a..b',
    'a//b',
    '/a',
    'a/',
    'a.',
    '.hidden',
    'a/.hidden',
    'x.lock',
    'a/b.lock/c',
    'a@{1}',
    'with space',
    'a~1',
    'a^',
    'a:b',
    'a?',
    'a*',
    'a[b',
    'a\\b',
    'new\nline',
    'x'.repeat(256),
  ]) {
    assert.equal(isValidGitBranchName(name), false, JSON.stringify(name));
  }
});

test('parseGitBranches reads local and remote branches with tracking info', () => {
  const output = [
    '*\trefs/heads/main\torigin/main\tahead 1, behind 2\t2026-11-12T10:00:00+01:00\tfeat: tab\tin subject',
    ' \trefs/heads/old\torigin/old\tgone\t2026-11-01T10:00:00+01:00\tchore: old',
    ' \trefs/remotes/origin/HEAD\t\t\t2026-11-12T10:00:00+01:00\tinit',
    ' \trefs/remotes/origin/feature/x\t\t\t2026-11-10T10:00:00+01:00\tfeat: x',
    ' \trefs/tags/v1\t\t\t2026-11-10T10:00:00+01:00\tnot a branch',
    ' \trefs/heads/bad name\t\t\t\t',
  ].join('\n');
  const { branches, truncated } = parseGitBranches(output);
  assert.equal(truncated, false);
  assert.deepEqual(
    branches.map((branch) => [branch.name, branch.remote, branch.ahead, branch.behind, branch.upstreamGone]),
    [
      ['main', false, 1, 2, false],
      ['old', false, 0, 0, true],
      ['origin/feature/x', true, 0, 0, false],
    ]
  );
  assert.equal(branches[0].current, true);
  assert.equal(branches[0].lastCommitSubject, 'feat: tab\tin subject');
  assert.deepEqual(parseGitBranchTrack('behind 7'), { ahead: 0, behind: 7, upstreamGone: false });
  assert.deepEqual(parseGitBranchTrack(''), { ahead: 0, behind: 0, upstreamGone: false });
});

test('remote branch checkout commands quote and validate names', () => {
  const repo = '/srv/repo; printf owned';
  assert.match(buildGitBranchListCommand(repo), /for-each-ref .* refs\/heads refs\/remotes \| head -n \d+$/);
  assert.equal(localNameForRemoteBranch('origin/feature/x'), 'feature/x');
  assert.equal(localNameForRemoteBranch('origin'), null);
  assert.equal(localNameForRemoteBranch('origin/-x'), null);
  assert.equal(localNameForRemoteBranch('origin/HEAD'), null);
  assert.equal(
    buildGitRemoteBranchExistsCommand(repo, "origin/$(id)'x"),
    "git -C '/srv/repo; printf owned' show-ref --verify --quiet -- 'refs/remotes/origin/$(id)'\\''x'"
  );
  assert.equal(
    buildGitCheckoutRemoteBranchCommand(repo, 'origin/feat/$(id)', 'feat/$(id)'),
    "git -C '/srv/repo; printf owned' switch -c 'feat/$(id)' --track -- 'refs/remotes/origin/feat/$(id)'"
  );
});

test('file list and compose status commands are bounded and validated', () => {
  assert.equal(
    buildGitFileListCommand('/srv/repo; printf owned'),
    `git -C '/srv/repo; printf owned' ls-tree -r -z --name-only HEAD | head -c ${MAX_GIT_FILE_LIST_BYTES + 1}`
  );
  assert.deepEqual(parseGitFileList('a.ts\0dir/b.ts\0../evil\0'), {
    paths: ['a.ts', 'dir/b.ts'],
    truncated: false,
  });
  assert.equal(parseGitFileList('a.ts\0dir/b.t').truncated, true);
  const many = parseGitFileList(
    Array.from({ length: MAX_GIT_FILE_LIST_ENTRIES + 1 }, (_, index) => `f${index}\0`).join('')
  );
  assert.equal(many.paths.length, MAX_GIT_FILE_LIST_ENTRIES);
  assert.equal(many.truncated, true);

  assert.equal(
    buildComposeStatusCommand('my_app-1'),
    "docker ps -a --filter 'label=com.docker.compose.project=my_app-1' --format '{{.State}}' | head -n 501"
  );
  for (const name of ["x'; id; '", 'Upper', '-x', '', 'a b']) {
    assert.throws(() => buildComposeStatusCommand(name), name);
  }
  assert.deepEqual(parseComposeStatus('running\nexited\nrunning\n\n'), { running: 2, total: 3, truncated: false });
  const manyStates = Array.from({ length: MAX_COMPOSE_CONTAINERS + 1 }, () => 'running').join('\n');
  assert.deepEqual(parseComposeStatus(manyStates), { running: MAX_COMPOSE_CONTAINERS, total: MAX_COMPOSE_CONTAINERS, truncated: true });
});

test('shared CodeMirror language detection covers legacy modes', () => {
  for (const name of [
    'main.go',
    'run.sh',
    'Dockerfile',
    'api.Dockerfile',
    'Cargo.toml',
    'lib.rs',
    'app.properties',
    'setup.ini',
    'fix.diff',
    '.env.local',
    'etc/nginx/sites/app.conf',
    'src/App.tsx',
  ]) {
    assert.equal(hasLanguageSupport(name), true, name);
  }
  assert.equal(hasLanguageSupport('notes.txt'), false);
  assert.equal(hasLanguageSupport('Makefile'), false);
});

test('highlightLines splits token spans per line, including multi-line comments', () => {
  const language = getLanguage('a.ts');
  assert.ok(language);
  const lines = ['const x = "a"; /* start', 'end */ let y = 1;'];
  const spans = highlightLines(language, lines);
  assert.equal(spans.length, 2);
  const text = (line: number, span: { from: number; to: number }) => lines[line].slice(span.from, span.to);
  assert.ok(spans[0].some((span) => text(0, span) === 'const' && span.className === 'text-primary'));
  assert.ok(spans[0].some((span) => text(0, span) === '"a"' && span.className === 'text-success'));
  assert.ok(spans[1].some((span) => text(1, span) === 'end */' && span.className.includes('italic')));
  assert.ok(spans[1].some((span) => text(1, span) === '1' && span.className === 'text-warning'));
  for (const [index, lineSpans] of spans.entries()) {
    for (const span of lineSpans) assert.ok(span.from >= 0 && span.to <= lines[index].length);
  }
});

test('formatRelativeDate picks the largest fitting unit', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  assert.equal(formatRelativeDate('2026-11-12T09:00:00Z', 'en', now), '3 hours ago');
  assert.equal(formatRelativeDate('2026-11-10T12:00:00Z', 'en', now), '2 days ago');
  assert.equal(formatRelativeDate('2026-11-12T11:59:50Z', 'en', now), 'this minute');
  assert.equal(formatRelativeDate('not a date', 'en', now), 'not a date');
});

test('diff line decoration is linear and skips very long lines', () => {
  const long = 'x'.repeat(MAX_DECORATED_LINE_CHARS + 1);
  assert.deepEqual(lineSegments(long, [{ from: 0, to: 1, className: 'a' }]), [{ from: 0, to: long.length, changed: false }]);

  // 1500 one-char tokens on one line: must finish quickly and keep every class.
  const text = 'ab'.repeat(750);
  const spans = Array.from({ length: 1500 }, (_, i) => ({ from: i, to: i + 1, className: i % 2 ? 'b' : 'a' }));
  const started = performance.now();
  const segments = lineSegments(text, spans.reverse(), [[10, 20]]);
  assert.ok(performance.now() - started < 200);
  assert.equal(segments.length, 1500);
  assert.equal(segments[0].syntaxClass, 'a');
  assert.equal(segments[1].syntaxClass, 'b');
  assert.equal(segments.filter((segment) => segment.changed).length, 10);
});
