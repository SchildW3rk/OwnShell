import assert from 'node:assert/strict';
import { test } from 'node:test';
import { __testIpcMainHandlers } from 'electron';
import { shellJoin, shellQuote, shellQuotePath } from '../electron/utils/shell-quote';
import {
  buildDumpCommand,
  buildEnvVars,
  buildLocalDumpCommand,
  buildLocalRestoreCommand,
  redactCommand,
} from '../electron/db-explorer/dump/command-builders';
import { buildClearCommand } from '../electron/db-explorer/dump/clear-command-builder';
import {
  buildQualifiedSqlIdentifier,
  quoteBacktickIdentifier,
  quoteDoubleIdentifier,
} from '../electron/db-explorer/sql-identifiers';
import { assertKnownColumns, assertKnownTable } from '../electron/db-explorer/identifier-whitelist';
import { validateSafeIpcPayload } from '../electron/ipc/safe-ipc-validation';
import { verifyEntitlementToken } from '../electron/license/entitlement';
import { buildContentSecurityPolicy } from '../electron/security/content-security-policy';
import { safeHandle } from '../electron/ipc/safe-ipc';
import { parseDockerComposeLabelOutput } from '../electron/projects/compose-discovery';
import {
  parseLocalDockerContainers,
  parseLocalDockerStats,
} from '../electron/docker/local-parsers';
import { getExecutableSearchPaths } from '../electron/utils/executable-resolver';
import {
  localDockerActionSchema,
  localDockerNetworkCreateSchema,
} from '../electron/ipc/schemas/docker';
import {
  buildGitBranchListCommand,
  buildGitBranchNameValidationCommand,
  buildGitCreateBranchCommand,
  buildGitDeleteBranchCommand,
  buildGitSwitchBranchCommand,
  isSafeBranchName,
  MAX_BRANCHES,
  parseGitBranches,
} from '../electron/projects/git-branches';
import {
  buildGitDiffCommand,
  buildGitStatusForPathCommand,
  isSafeRepositoryRelativePath,
  MAX_DIFF_BYTES,
  truncateGitDiff,
} from '../electron/projects/git-diff';
import {
  buildGitCommitDiffCommand,
  buildGitCommitHistoryCommand,
  buildGitCommitSummaryCommand,
  buildGitCommitValidationCommand,
  MAX_GIT_COMMIT_DIFF_BYTES,
  MAX_GIT_COMMITS,
  MAX_GIT_HISTORY_BYTES,
  parseGitCommitHistory,
  parseGitCommitSummary,
  truncateGitCommitDiff,
} from '../electron/projects/git-history';
import { buildGitInitRepositoryCommand } from '../electron/projects/git-init';
import {
  buildGitBareRepositoryCheckCommand,
  buildGitRepositoryCheckCommand,
  buildGitRepositoryRootCommand,
  parseAheadBehind,
  parseGitBareRepository,
  parseGitStatusPorcelain,
} from '../electron/projects/git-status';
import {
  buildGitCreateCommitCommand,
  buildGitStageFilesCommand,
  buildGitUnstageFilesCommand,
} from '../electron/projects/git-working-tree';
import {
  buildGitFileContentCommand,
  buildGitFileMetadataCommand,
  buildGitTreeCommand,
  isSafeGitCodePath,
  MAX_GIT_TREE_BYTES,
  parseGitTreeEntries,
} from '../electron/projects/git-code';
import {
  sshGitCodeDirectorySchema,
  sshGitCodeFileSchema,
  sshGitCreateCommitSchema,
  sshGitFileActionSchema,
} from '../electron/ipc/schemas/ssh';
import {
  buildProjectGitCommands,
  buildProjectSshRepositoryUrl,
} from '../src/features/projects/repositoryCommands';
import type { DBConnectionConfig } from '@ownshell/core';
import { z } from 'zod';

function createConfig(overrides: Partial<DBConnectionConfig> = {}): DBConnectionConfig {
  return {
    id: 'cfg-1',
    name: 'Test DB',
    type: 'postgres',
    host: 'db.internal',
    port: 5432,
    database: 'appdb',
    username: 'app',
    password: 'secret',
    connectionMode: 'local',
    sshTunnelEnabled: false,
    ...overrides,
  };
}

function testShellQuoting() {
  assert.equal(shellQuote('plain'), "'plain'");
  assert.equal(shellQuote(''), "''");
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
  assert.equal(shellJoin(['a b', "c'd"]), "'a b' 'c'\\''d'");
  assert.equal(shellQuotePath('~/Project Files/key.pem'), "$HOME/'Project Files/key.pem'");
  assert.equal(shellQuotePath('/tmp/a b'), "'/tmp/a b'");
  assert.equal(
    shellQuotePath('/srv/repo; touch /tmp/ownshell-command-injection'),
    "'/srv/repo; touch /tmp/ownshell-command-injection'"
  );
}

function composeLabelLine(
  project: string | null,
  service: string | null,
  workingDirectory: string | null,
  configFiles: string | null
): string {
  return [project, service, workingDirectory, configFiles].map(JSON.stringify).join('\t');
}

function testComposeProjectDiscoveryParsing() {
  const output = [
    composeLabelLine(
      'webshop',
      'api',
      '/home/deploy/dev/webshop stage; printf owned',
      '/home/deploy/dev/webshop stage; printf owned/docker-compose.yml'
    ),
    composeLabelLine(
      'webshop',
      'postgres',
      '/home/deploy/dev/webshop stage; printf owned',
      '/home/deploy/dev/webshop stage; printf owned/docker-compose.yml'
    ),
    composeLabelLine('missing-path', 'api', null, null),
    'malformed',
  ].join('\n');

  const result = parseDockerComposeLabelOutput(output);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.candidates, [
    {
      composeProject: 'webshop',
      workingDirectory: '/home/deploy/dev/webshop stage; printf owned',
      repositoryPath: null,
      configFiles: ['/home/deploy/dev/webshop stage; printf owned/docker-compose.yml'],
      services: ['api', 'postgres'],
      containerCount: 2,
    },
  ]);

  const boundedOutput = Array.from({ length: 501 }, () =>
    composeLabelLine('large', 'api', '/srv/large', '/srv/large/compose.yml')
  ).join('\n');
  const boundedResult = parseDockerComposeLabelOutput(boundedOutput);
  assert.equal(boundedResult.truncated, true);
  assert.equal(boundedResult.candidates[0]?.containerCount, 500);
}

function testLocalDockerPayloadValidationAndParsing() {
  assert.equal(
    validateSafeIpcPayload(localDockerActionSchema, {
      containerId: 'a1b2c3d4e5f6',
      action: 'restart',
    }).success,
    true
  );
  assert.equal(
    validateSafeIpcPayload(localDockerActionSchema, {
      containerId: 'a1b2; touch /tmp/owned',
      action: 'restart',
    }).success,
    false
  );
  assert.equal(
    validateSafeIpcPayload(localDockerActionSchema, {
      containerId: 'a1b2c3d4e5f6',
      action: 'exec',
    }).success,
    false
  );
  assert.equal(
    validateSafeIpcPayload(localDockerNetworkCreateSchema, {
      name: 'app-network',
      gateway: '127.0.0.1; open /Applications/Calculator.app',
    }).success,
    false
  );

  const parsed = parseLocalDockerContainers(
    JSON.stringify({
      ID: 'a1b2c3d4e5f6',
      Names: 'api',
      Image: 'example/api:latest',
      Status: 'Up 2 minutes',
      State: 'running',
      Ports: '3000/tcp',
      RunningFor: '2 minutes ago',
      Command: 'node server.js',
      Labels: 'com.docker.compose.project=example,com.docker.compose.service=api',
    })
  );
  assert.equal(parsed.containers[0]?.composeProject, 'example');
  assert.equal(parsed.projects[0]?.runningCount, 1);
  assert.equal(parsed.projects[0]?.totalCount, 1);

  const stats = parseLocalDockerStats(
    JSON.stringify({
      CPUPerc: '1.5%',
      MemUsage: '16MiB / 1GiB',
      MemPerc: '1.56%',
      NetIO: '2kB / 3kB',
      BlockIO: '4kB / 5kB',
      PIDs: '7',
    }),
    'a1b2c3d4e5f6'
  );
  assert.equal(stats?.memoryUsage, 16 * 1024 * 1024);
  assert.equal(stats?.networkTx, 3 * 1024);
  assert.equal(stats?.pids, 7);

  if (process.platform === 'darwin') {
    const searchPaths = getExecutableSearchPaths('');
    assert.ok(searchPaths.includes('/Applications/Docker.app/Contents/Resources/bin'));
    assert.ok(searchPaths.some((entry) => entry.endsWith('/.docker/bin')));
  }
}

function testGitStatusParsing() {
  assert.deepEqual(parseAheadBehind('2\t3\n'), { ahead: 2, behind: 3 });
  assert.deepEqual(parseAheadBehind('invalid'), { ahead: 0, behind: 0 });
  assert.equal(parseGitBareRepository('true\n'), true);
  assert.equal(parseGitBareRepository('false\n'), false);
  assert.equal(parseGitBareRepository('unknown\n'), null);

  const repositoryPath = '/srv/repo.git; printf owned';
  assert.equal(
    buildGitRepositoryCheckCommand(repositoryPath),
    "git -C '/srv/repo.git; printf owned' rev-parse --git-dir"
  );
  assert.equal(
    buildGitBareRepositoryCheckCommand(repositoryPath),
    "git -C '/srv/repo.git; printf owned' rev-parse --is-bare-repository"
  );
  assert.equal(
    buildGitRepositoryRootCommand(repositoryPath, true),
    "git -C '/srv/repo.git; printf owned' rev-parse --absolute-git-dir"
  );
  assert.equal(
    buildGitRepositoryRootCommand(repositoryPath, false),
    "git -C '/srv/repo.git; printf owned' rev-parse --show-toplevel"
  );

  const output = [
    ' M src/unstaged.ts',
    'M  src/staged.ts',
    'MM src/both.ts',
    '?? new file.ts',
    'R  src/new-name.ts',
    'src/old-name.ts',
    '',
  ].join('\0');

  const result = parseGitStatusPorcelain(output, 10);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.files, [
    {
      status: 'M',
      path: 'src/unstaged.ts',
      originalPath: undefined,
      indexStatus: ' ',
      worktreeStatus: 'M',
      staged: false,
      unstaged: true,
      untracked: false,
    },
    {
      status: 'M',
      path: 'src/staged.ts',
      originalPath: undefined,
      indexStatus: 'M',
      worktreeStatus: ' ',
      staged: true,
      unstaged: false,
      untracked: false,
    },
    {
      status: 'MM',
      path: 'src/both.ts',
      originalPath: undefined,
      indexStatus: 'M',
      worktreeStatus: 'M',
      staged: true,
      unstaged: true,
      untracked: false,
    },
    {
      status: '??',
      path: 'new file.ts',
      originalPath: undefined,
      indexStatus: '?',
      worktreeStatus: '?',
      staged: false,
      unstaged: true,
      untracked: true,
    },
    {
      status: 'R',
      path: 'src/new-name.ts',
      originalPath: 'src/old-name.ts',
      indexStatus: 'R',
      worktreeStatus: ' ',
      staged: true,
      unstaged: false,
      untracked: false,
    },
  ]);

  const bounded = parseGitStatusPorcelain(output, 2);
  assert.equal(bounded.files.length, 2);
  assert.equal(bounded.truncated, true);
  assert.equal(parseGitStatusPorcelain(' M incomplete.ts', 10).truncated, true);
}

function testGitDiffCommandSafety() {
  assert.equal(isSafeRepositoryRelativePath('src/file with spaces.ts'), true);
  assert.equal(isSafeRepositoryRelativePath('~/literal-name'), true);
  assert.equal(isSafeRepositoryRelativePath('/etc/passwd'), false);
  assert.equal(isSafeRepositoryRelativePath('../secret'), false);
  assert.equal(isSafeRepositoryRelativePath('src/../../secret'), false);
  assert.equal(isSafeRepositoryRelativePath('src/file\nname'), false);

  const statusCommand = buildGitStatusForPathCommand('/srv/repo; printf owned', '~/literal-name');
  assert.match(statusCommand, /git -C '\/srv\/repo; printf owned'/);
  assert.match(statusCommand, /-- '~\/literal-name'$/);
  assert.doesNotMatch(statusCommand, /\$HOME/);

  const diffCommand = buildGitDiffCommand(
    '/srv/repo',
    'src/file; printf owned.ts',
    'staged',
    false
  );
  assert.match(diffCommand, /diff --no-ext-diff --no-color --unified=3 --cached/);
  assert.match(diffCommand, /-- 'src\/file; printf owned\.ts'/);
  assert.match(diffCommand, new RegExp(`head -c ${MAX_DIFF_BYTES + 1}$`));

  const untrackedCommand = buildGitDiffCommand('/srv/repo', 'new.ts', 'unstaged', true);
  assert.match(untrackedCommand, /diff --no-ext-diff --no-color --no-index/);
  assert.match(untrackedCommand, /-- \/dev\/null 'new\.ts'/);

  const bounded = truncateGitDiff('a'.repeat(MAX_DIFF_BYTES + 1));
  assert.equal(Buffer.byteLength(bounded.content), MAX_DIFF_BYTES);
  assert.equal(bounded.truncated, true);
}

function testGitCommitHistoryCommandsAndParsing() {
  const firstHash = 'a'.repeat(40);
  const secondHash = 'b'.repeat(40);
  const firstSummary = `${firstHash}\u001fa1b2c3d\u001fRené\u001f2026-07-13T10:15:00+02:00\u001ffeat: add history`;
  const first = `${firstSummary}\u001e\n`;
  const second = `${secondHash}\u001fb1c2d3e\u001fAlex\u001f2026-07-12T09:00:00+02:00\u001ffix: repair diff\u001e\n`;

  assert.deepEqual(parseGitCommitSummary(firstSummary), {
    hash: firstHash,
    shortHash: 'a1b2c3d',
    author: 'René',
    authoredAt: '2026-07-13T10:15:00+02:00',
    subject: 'feat: add history',
  });
  assert.equal(parseGitCommitSummary('not-a-commit'), null);

  const parsed = parseGitCommitHistory(first + second);
  assert.equal(parsed.truncated, false);
  assert.equal(parsed.commits.length, 2);
  assert.equal(parsed.commits[1]?.hash, secondHash);
  assert.equal(parseGitCommitHistory(first.slice(0, -2)).truncated, true);

  const bounded = parseGitCommitHistory(first.repeat(MAX_GIT_COMMITS + 1));
  assert.equal(bounded.commits.length, MAX_GIT_COMMITS);
  assert.equal(bounded.truncated, true);

  const historyCommand = buildGitCommitHistoryCommand('/srv/repo; printf owned');
  assert.match(historyCommand, /git -C '\/srv\/repo; printf owned' log/);
  assert.match(historyCommand, new RegExp(`head -c ${MAX_GIT_HISTORY_BYTES + 1}$`));

  for (const command of [
    buildGitCommitValidationCommand('/srv/repo', firstHash),
    buildGitCommitSummaryCommand('/srv/repo', firstHash),
    buildGitCommitDiffCommand('/srv/repo', firstHash),
  ]) {
    assert.match(command, new RegExp(`'${firstHash}(?:\\^\\{commit\\})?'`));
  }

  const diffCommand = buildGitCommitDiffCommand('/srv/repo', firstHash);
  assert.match(diffCommand, /show --format= --no-ext-diff --no-color/);
  assert.match(diffCommand, new RegExp(`head -c ${MAX_GIT_COMMIT_DIFF_BYTES + 1}$`));

  const truncatedDiff = truncateGitCommitDiff('a'.repeat(MAX_GIT_COMMIT_DIFF_BYTES + 1));
  assert.equal(Buffer.byteLength(truncatedDiff.content), MAX_GIT_COMMIT_DIFF_BYTES);
  assert.equal(truncatedDiff.truncated, true);
}

function testGitBranchCommandsAndParsing() {
  assert.equal(isSafeBranchName('feature/branches'), true);
  assert.equal(isSafeBranchName('feature/$(printf-owned)'), true);
  assert.equal(isSafeBranchName('-delete-all'), false);
  assert.equal(isSafeBranchName('feature/with space'), false);
  assert.equal(isSafeBranchName('feature/with\nnewline'), false);

  const parsed = parseGitBranches(
    [
      '*\trefs/heads/main\torigin/main\t\t2026-07-13T10:00:00+02:00\tinit',
      ' \trefs/heads/feature/one\t\t\t\t',
      ' \trefs/heads/feature/two\torigin/feature/two\tahead 2\t\t',
      '',
    ].join('\n')
  );
  assert.deepEqual(
    parsed.branches.map(({ name, current, upstream, ahead }) => ({ name, current, upstream, ahead })),
    [
      { name: 'main', current: true, upstream: 'origin/main', ahead: 0 },
      { name: 'feature/one', current: false, upstream: null, ahead: 0 },
      { name: 'feature/two', current: false, upstream: 'origin/feature/two', ahead: 2 },
    ]
  );
  assert.equal(parsed.truncated, false);

  const bounded = parseGitBranches(
    Array.from({ length: MAX_BRANCHES + 1 }, (_, index) => ` \trefs/heads/branch-${index}\t`).join('\n')
  );
  assert.equal(bounded.branches.length, MAX_BRANCHES);
  assert.equal(bounded.truncated, true);

  const listCommand = buildGitBranchListCommand('/srv/repo; printf owned');
  assert.match(listCommand, /git -C '\/srv\/repo; printf owned' for-each-ref/);
  assert.match(listCommand, new RegExp(`head -n ${MAX_BRANCHES + 1}$`));

  const branch = 'feature/$(printf-owned)';
  for (const command of [
    buildGitBranchNameValidationCommand('/srv/repo', branch),
    buildGitCreateBranchCommand('/srv/repo', branch),
    buildGitSwitchBranchCommand('/srv/repo', branch),
    buildGitDeleteBranchCommand('/srv/repo', branch),
  ]) {
    assert.match(command, /'feature\/\$\(printf-owned\)'$/);
  }
}

function testGitRepositoryInitCommandSafety() {
  const command = buildGitInitRepositoryCommand('/srv/repo; printf owned');
  const quotedPathMatches = command.match(/'\/srv\/repo; printf owned'/g) ?? [];

  assert.ok(quotedPathMatches.length >= 5);
  assert.match(command, /mkdir -p -- '\/srv\/repo; printf owned'/);
  assert.match(command, /symbolic-ref HEAD refs\/heads\/main$/);
  assert.doesNotMatch(command, /git -C \/srv\/repo/);
}

function testGitWorkingTreeCommandsAndValidation() {
  const repositoryPath = '/srv/repo; printf owned';
  const paths = ['src/file; printf owned.ts', "src/old'name.ts"];

  const stageCommand = buildGitStageFilesCommand(repositoryPath, paths);
  assert.equal(
    stageCommand,
    "git -C '/srv/repo; printf owned' add -- 'src/file; printf owned.ts' 'src/old'\\''name.ts'"
  );

  const unstageCommand = buildGitUnstageFilesCommand(repositoryPath, paths);
  assert.match(unstageCommand, /rev-parse --verify HEAD/);
  assert.match(unstageCommand, /reset -q HEAD --/);
  assert.match(unstageCommand, /rm -q --cached --ignore-unmatch --/);
  assert.equal(unstageCommand.match(/'src\/file; printf owned\.ts'/g)?.length, 2);
  assert.equal(unstageCommand.match(/'src\/old'\\''name\.ts'/g)?.length, 2);

  const commitMessage = "feat: handle René's input; printf owned";
  assert.equal(
    buildGitCreateCommitCommand(repositoryPath, commitMessage),
    "git -C '/srv/repo; printf owned' commit --quiet -m 'feat: handle René'\\''s input; printf owned'"
  );

  assert.equal(
    sshGitFileActionSchema.safeParse({ projectId: 'project-1', path: 'src/file.ts' }).success,
    true
  );
  for (const path of ['/etc/passwd', '../secret', 'src/../../secret', 'src/file\nname']) {
    assert.equal(sshGitFileActionSchema.safeParse({ projectId: 'project-1', path }).success, false);
  }

  const parsedCommit = sshGitCreateCommitSchema.safeParse({
    projectId: 'project-1',
    message: '  feat: create commit  ',
  });
  assert.equal(parsedCommit.success, true);
  if (parsedCommit.success) {
    assert.equal(parsedCommit.data.message, 'feat: create commit');
  }

  for (const message of ['', 'line one\nline two', 'a'.repeat(501), `message\0hidden`]) {
    assert.equal(
      sshGitCreateCommitSchema.safeParse({ projectId: 'project-1', message }).success,
      false
    );
  }
}

function testGitCodeBrowserCommandsAndValidation() {
  assert.equal(isSafeGitCodePath(''), true);
  assert.equal(isSafeGitCodePath('', false), false);
  assert.equal(isSafeGitCodePath('src/components/Button.tsx'), true);
  for (const unsafePath of [
    '/etc/passwd',
    '../secret',
    'src/../../secret',
    'src//secret',
    'src/file\nname',
  ]) {
    assert.equal(isSafeGitCodePath(unsafePath), false);
  }

  const repositoryPath = '/srv/repo; printf owned';
  assert.equal(
    buildGitTreeCommand(repositoryPath, 'src'),
    `git -C '/srv/repo; printf owned' ls-tree -z 'HEAD:src' | head -c ${MAX_GIT_TREE_BYTES + 1}`
  );
  assert.equal(
    buildGitFileMetadataCommand(repositoryPath, "src/René's file.ts"),
    "git -C '/srv/repo; printf owned' cat-file -t 'HEAD:src/René'\\''s file.ts' && git -C '/srv/repo; printf owned' cat-file -s 'HEAD:src/René'\\''s file.ts'"
  );
  assert.equal(
    buildGitFileContentCommand(repositoryPath, 'src/file; printf owned.ts'),
    "git -C '/srv/repo; printf owned' cat-file blob 'HEAD:src/file; printf owned.ts'"
  );
  assert.throws(() => buildGitTreeCommand(repositoryPath, '../secret'));
  assert.throws(() => buildGitFileContentCommand(repositoryPath, ''));

  const directoryHash = 'a'.repeat(40);
  const fileHash = 'b'.repeat(64);
  const parsed = parseGitTreeEntries(
    [
      `100644 blob ${fileHash}\tREADME.md`,
      `040000 tree ${directoryHash}\tsrc`,
      `160000 commit ${directoryHash}\tvendor`,
      `100644 blob ${directoryHash}\t../unsafe`,
      '',
    ].join('\0'),
    ''
  );
  assert.equal(parsed.skipped, true);
  assert.deepEqual(
    parsed.entries.map(({ name, path, kind }) => ({ name, path, kind })),
    [
      { name: 'src', path: 'src', kind: 'directory' },
      { name: 'vendor', path: 'vendor', kind: 'submodule' },
      { name: 'README.md', path: 'README.md', kind: 'file' },
    ]
  );

  assert.equal(
    sshGitCodeDirectorySchema.safeParse({ projectId: 'project-1', path: '' }).success,
    true
  );
  assert.equal(
    sshGitCodeFileSchema.safeParse({ projectId: 'project-1', path: 'src/index.ts' }).success,
    true
  );
  assert.equal(sshGitCodeFileSchema.safeParse({ projectId: 'project-1', path: '' }).success, false);

  const sshUrl = buildProjectSshRepositoryUrl(
    { hostname: '2001:db8::1', port: 2222, username: 'rené' },
    { repository_path: '/srv/My Project/repo.git' }
  );
  assert.equal(sshUrl, 'ssh://ren%C3%A9@[2001:db8::1]:2222/srv/My%20Project/repo.git');
  assert.deepEqual(
    buildProjectGitCommands(
      { hostname: 'git.example.com', port: 22, username: 'dev' },
      { repository_path: '~/repos/ownshell.git' }
    ),
    {
      url: 'ssh://dev@git.example.com/~/repos/ownshell.git',
      clone: "git clone 'ssh://dev@git.example.com/~/repos/ownshell.git'",
      remote: "git remote add origin 'ssh://dev@git.example.com/~/repos/ownshell.git'",
    }
  );
}

function testSqlIdentifierQuoting() {
  assert.equal(quoteDoubleIdentifier('users'), '"users"');
  assert.equal(quoteDoubleIdentifier('bad"name'), '"bad""name"');
  assert.equal(quoteBacktickIdentifier('bad`name'), '`bad``name`');
  assert.equal(
    buildQualifiedSqlIdentifier('table"name', 'schema"name'),
    '"schema""name"."table""name"'
  );
}

function testIdentifierWhitelist() {
  const tableSchema = {
    name: 'users',
    columns: [
      { name: 'id', type: 'integer', nullable: false, primaryKey: true },
      { name: 'email', type: 'text', nullable: false, primaryKey: false },
    ],
    indexes: [],
    primaryKey: ['id'],
  };

  assert.doesNotThrow(() => assertKnownTable(tableSchema, 'users'));
  assert.doesNotThrow(() => assertKnownColumns(tableSchema, ['id', 'email']));
  assert.throws(() => assertKnownTable({ ...tableSchema, columns: [] }, 'users'), /Unknown table/);
  assert.throws(
    () => assertKnownColumns(tableSchema, ['email; drop table users']),
    /Unknown column/
  );
}

function testLocalDumpUsesArgv() {
  const tableName = 'users; touch /tmp/owned';
  const command = buildLocalDumpCommand(createConfig(), {
    compress: false,
    tables: [tableName],
  });

  assert.equal(command.command, 'pg_dump');
  assert.deepEqual(command.args.slice(-3), ['-t', tableName, 'appdb']);
  assert.ok(!command.command.includes(tableName));
}

function testDockerDumpKeepsSensitiveValuesInArgs() {
  const command = buildLocalDumpCommand(
    createConfig({
      executionMode: 'docker',
      dockerContainer: 'postgres; touch /tmp/owned',
      password: 'pw with spaces',
    }),
    { compress: false }
  );

  assert.equal(command.command, 'docker');
  assert.deepEqual(command.args.slice(0, 4), ['exec', '-i', '-e', 'PGPASSWORD=pw with spaces']);
  assert.ok(command.args.includes('postgres; touch /tmp/owned'));
  assert.ok(!command.args.join('\n').includes('sh -c'));
}

function testRemoteDumpShellQuotesInputs() {
  const command = buildDumpCommand(
    createConfig({
      database: 'appdb; touch /tmp/db',
      username: "app'user",
      password: 'pw; touch /tmp/pw',
    }),
    15432,
    {
      compress: true,
      tables: ['users; touch /tmp/table'],
    }
  );

  assert.ok(command.includes("PGPASSWORD='pw; touch /tmp/pw' pg_dump"));
  assert.ok(command.includes("-U 'app'\\''user'"));
  assert.ok(command.includes("-t 'users; touch /tmp/table'"));
  assert.ok(command.includes("'appdb; touch /tmp/db'"));
  assert.ok(command.endsWith(' | gzip'));
}

function testRestoreAndRedaction() {
  const restore = buildLocalRestoreCommand(createConfig({ password: 'pw' }));
  assert.equal(restore.command, 'psql');
  assert.ok(restore.args.includes('ON_ERROR_STOP=0'));

  assert.equal(
    redactCommand("PGPASSWORD='pw with spaces' pg_dump -h 127.0.0.1"),
    "PGPASSWORD='***' pg_dump -h 127.0.0.1"
  );
  assert.equal(
    redactCommand("MYSQL_PWD='pw with spaces' mysqldump -h 127.0.0.1"),
    "MYSQL_PWD='***' mysqldump -h 127.0.0.1"
  );
}

function testLocalToolPathEnv() {
  const env = buildEnvVars(createConfig());

  assert.equal(env.PGPASSWORD, 'secret');
  assert.ok(env.PATH, 'PATH should be set for local database tools');
  if (process.platform === 'darwin') {
    assert.ok(env.PATH.includes('/opt/homebrew/opt/libpq/bin'));
  }
}

function testClearDatabaseCommandQuoting() {
  const postgresCommand = buildClearCommand({
    type: 'postgres',
    database: 'appdb; touch /tmp/db',
    username: "app'user",
    password: 'pw; touch /tmp/pw',
    port: 15432,
    mode: 'drop',
  });

  assert.ok(postgresCommand);
  assert.ok(postgresCommand.includes("PGPASSWORD='pw; touch /tmp/pw' psql"));
  assert.ok(postgresCommand.includes("-U 'app'\\''user'"));
  assert.ok(postgresCommand.includes("-d 'appdb; touch /tmp/db'"));

  const mysqlCommand = buildClearCommand({
    type: 'mysql',
    database: "appdb'; SELECT 'x",
    username: 'root; touch /tmp/root',
    password: 'pw; touch /tmp/pw',
    port: 13306,
    mode: 'truncate',
  });

  assert.ok(mysqlCommand);
  assert.ok(mysqlCommand.includes("MYSQL_PWD='pw; touch /tmp/pw' mysql"));
  assert.ok(mysqlCommand.includes("-u 'root; touch /tmp/root'"));
  assert.ok(mysqlCommand.includes("'appdb'\\''; SELECT '\\''x'"));
}

function testSafeIpcPayloadValidation() {
  const schema = z.object({
    sessionId: z.string().min(1),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  });

  const valid = validateSafeIpcPayload(schema, { sessionId: 's1', cols: 120, rows: 32 });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.sessionId, 's1');
  }

  const invalid = validateSafeIpcPayload(schema, { sessionId: '', cols: '120', rows: 32 });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.ok(invalid.issues.some((issue) => issue.path === 'sessionId'));
    assert.ok(invalid.issues.some((issue) => issue.path === 'cols'));
  }
}

function testContentSecurityPolicy() {
  const productionCsp = buildContentSecurityPolicy(false);
  assert.match(productionCsp, /default-src 'self'/);
  assert.match(productionCsp, /script-src 'self'(;|$)/);
  assert.match(productionCsp, /connect-src 'self'(;|$)/);
  assert.match(productionCsp, /object-src 'none'/);
  assert.match(productionCsp, /base-uri 'none'/);
  assert.match(productionCsp, /form-action 'none'/);
  assert.doesNotMatch(productionCsp, /unsafe-eval/);
  assert.doesNotMatch(productionCsp, /script-src[^;]*(http:|https:|blob:|data:)/);
  assert.doesNotMatch(productionCsp, /connect-src[^;]*\shttps:\s/);

  const developmentCsp = buildContentSecurityPolicy(true);
  assert.match(developmentCsp, /script-src 'self' 'unsafe-eval'/);
  assert.match(developmentCsp, /connect-src 'self' http: https: ws: wss:/);
}

// Honor model: no channel is license-gated, but sender and payload validation still apply.
async function testSafeHandleHasNoLicenseGateButValidates() {
  __testIpcMainHandlers.clear();
  let calls = 0;
  try {
    for (const channel of ['db:hosts:get-by-id', 'dbexplorer:query', 's3:list-objects', 'ssh:connect']) {
      safeHandle(channel, z.string().min(1), async (_event, value) => {
        calls += 1;
        return { success: true, value };
      });
      const handler = __testIpcMainHandlers.get(channel);
      assert.ok(handler, 'safeHandle should register the IPC handler');

      const mainFrame = { url: 'ownshell://app/index.html' };
      const event = { senderFrame: mainFrame, sender: { mainFrame } };
      assert.deepEqual(await handler(event, 'x'), { success: true, value: 'x' });
      assert.deepEqual(await handler(event, ''), { success: false, error: 'Invalid IPC payload' });

      const foreignFrame = { url: 'https://example.com/' };
      assert.deepEqual(
        await handler({ senderFrame: foreignFrame, sender: { mainFrame: foreignFrame } }, 'x'),
        { success: false, error: 'Unauthorized IPC sender' }
      );
      const subFrame = { url: 'ownshell://app/index.html' };
      assert.deepEqual(await handler({ senderFrame: subFrame, sender: { mainFrame } }, 'x'), {
        success: false,
        error: 'Unauthorized IPC sender',
      });
    }
    assert.equal(calls, 4, 'only valid, authorized invokes reach the handler');
  } finally {
    __testIpcMainHandlers.clear();
  }
}

function encodeTokenPart(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function testEntitlementHeaderValidation() {
  const deviceId = 'a'.repeat(64);
  const payload = encodeTokenPart({
    iss: 'ownshell-license-api',
    aud: 'ownshell-desktop',
    sub: 'license:test',
    status: 'active',
    deviceId,
    updatesUntil: Math.floor(Date.now() / 1000) + 3600,
    iat: 1,
    nbf: 1,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const unknownKidToken = [
    encodeTokenPart({ alg: 'ES256', typ: 'JWT', kid: 'unknown-key' }),
    payload,
    Buffer.from('invalid-signature').toString('base64url'),
  ].join('.');
  assert.deepEqual(verifyEntitlementToken(unknownKidToken, deviceId), {
    valid: false,
    reason: 'Unknown entitlement signing key',
  });

  const missingTypToken = [
    encodeTokenPart({ alg: 'ES256', kid: 'ownshell-license-2026-06' }),
    payload,
    Buffer.from('invalid-signature').toString('base64url'),
  ].join('.');
  assert.deepEqual(verifyEntitlementToken(missingTypToken, deviceId), {
    valid: false,
    reason: 'Unsupported entitlement token header',
  });
}

test('ShellQuoting', testShellQuoting);
test('ComposeProjectDiscoveryParsing', testComposeProjectDiscoveryParsing);
test('LocalDockerPayloadValidationAndParsing', testLocalDockerPayloadValidationAndParsing);
test('GitStatusParsing', testGitStatusParsing);
test('GitDiffCommandSafety', testGitDiffCommandSafety);
test('GitCommitHistoryCommandsAndParsing', testGitCommitHistoryCommandsAndParsing);
test('GitBranchCommandsAndParsing', testGitBranchCommandsAndParsing);
test('GitRepositoryInitCommandSafety', testGitRepositoryInitCommandSafety);
test('GitWorkingTreeCommandsAndValidation', testGitWorkingTreeCommandsAndValidation);
test('GitCodeBrowserCommandsAndValidation', testGitCodeBrowserCommandsAndValidation);
test('SqlIdentifierQuoting', testSqlIdentifierQuoting);
test('IdentifierWhitelist', testIdentifierWhitelist);
test('LocalDumpUsesArgv', testLocalDumpUsesArgv);
test('DockerDumpKeepsSensitiveValuesInArgs', testDockerDumpKeepsSensitiveValuesInArgs);
test('RemoteDumpShellQuotesInputs', testRemoteDumpShellQuotesInputs);
test('RestoreAndRedaction', testRestoreAndRedaction);
test('LocalToolPathEnv', testLocalToolPathEnv);
test('ClearDatabaseCommandQuoting', testClearDatabaseCommandQuoting);
test('SafeIpcPayloadValidation', testSafeIpcPayloadValidation);
test('ContentSecurityPolicy', testContentSecurityPolicy);
test('SafeHandleHasNoLicenseGateButValidates', testSafeHandleHasNoLicenseGateButValidates);
test('EntitlementHeaderValidation', testEntitlementHeaderValidation);
