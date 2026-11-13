import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import type { DBConnectionConfig } from '@ownshell/core';
import {
  buildDumpCommand,
  buildEnvVars,
  buildLocalRestoreCommand,
  buildRestoreCommand,
  redactCommand,
  type DumpConfig,
} from '../electron/db-explorer/dump/command-builders';
import { buildClearCommand } from '../electron/db-explorer/dump/clear-command-builder';

const PEM = "-----BEGIN CERTIFICATE-----\nMIIB'x\n-----END CERTIFICATE-----";
const cfg = (over: Partial<DumpConfig>): DumpConfig =>
  ({ id: 'c', name: 'n', type: 'postgres', host: 'db.internal', port: 5432, database: 'shop', username: 'u', connectionMode: 'ssh', sshTunnelEnabled: true, ...over }) as DBConnectionConfig & DumpConfig;

test('SSH dump targets the configured database host, not the SSH server loopback', () => {
  assert.match(buildDumpCommand(cfg({}), 5432, {}), /pg_dump -h 'db\.internal'/);
  assert.match(buildDumpCommand(cfg({ type: 'mysql' }), 3306, {}), /mysqldump --protocol=TCP -h 'db\.internal'/);
  assert.match(buildClearCommand({ ...cfg({}), port: 5432, mode: 'truncate' }) ?? '', /psql -q -h 'db\.internal'/);
  // Docker mode runs inside the container and keeps its loopback.
  assert.match(buildDumpCommand(cfg({ executionMode: 'docker', dockerContainer: 'pg' }), 5432, {}), /-h '\\''127\.0\.0\.1'/);
});

test('SSL off keeps the tool defaults', () => {
  const cmd = buildDumpCommand(cfg({ sslMode: 'disabled' }), 5432, {});
  assert.doesNotMatch(cmd, /PGSSL|ssl/);
  assert.equal(buildEnvVars(cfg({ sslMode: 'disabled' })).PGSSLMODE, undefined);
});

test('postgres verify uses verify-full with the CA in a temp file, no-verify only encrypts', () => {
  const verify = buildDumpCommand(cfg({ sslMode: 'require', sslCa: PEM }), 5432, {});
  assert.match(verify, /^sh -c /);
  assert.match(verify, /PGSSLMODE='\\''verify-full'\\'' PGSSLROOTCERT="\$ca" pg_dump/);
  assert.match(verify, /trap '\\''rm -f "\$ca"'\\'' EXIT/);
  assert.match(buildDumpCommand(cfg({ sslMode: 'require' }), 5432, {}), /PGSSLMODE='verify-full' PGSSLROOTCERT='system' pg_dump/);
  const noVerify = buildRestoreCommand(cfg({ sslMode: 'require-no-verify', sslCa: PEM }), 5432, false);
  assert.match(noVerify, /^PGSSLMODE='require' psql/);
  assert.doesNotMatch(noVerify, /ROOTCERT|BEGIN/);
  assert.deepEqual(
    { mode: buildEnvVars(cfg({ sslMode: 'require', sslCa: PEM }), '/tmp/x/ca.pem').PGSSLMODE, root: buildEnvVars(cfg({ sslMode: 'require', sslCa: PEM }), '/tmp/x/ca.pem').PGSSLROOTCERT },
    { mode: 'verify-full', root: '/tmp/x/ca.pem' }
  );
});

test('mysql flags work for MySQL and MariaDB clients', () => {
  const verify = buildLocalRestoreCommand(cfg({ type: 'mysql', connectionMode: 'local', sslMode: 'require', sslCa: PEM }), '/tmp/x/ca.pem');
  assert.deepEqual(verify.args.slice(1, 5), ['--loose-ssl-mode=VERIFY_IDENTITY', '--loose-ssl', '--loose-ssl-verify-server-cert', '--ssl-ca=/tmp/x/ca.pem']);
  const noVerify = buildDumpCommand(cfg({ type: 'mysql', sslMode: 'require-no-verify' }), 3306, {});
  assert.match(noVerify, /mysqldump --protocol=TCP '--loose-ssl-mode=REQUIRED' '--loose-ssl' '--loose-skip-ssl-verify-server-cert' -h/);
  const clear = buildClearCommand({ ...cfg({ type: 'mysql', sslMode: 'require', sslCa: PEM }), port: 3306, mode: 'drop' }) ?? '';
  assert.match(clear, /^sh -c /);
  assert.equal((clear.match(/--ssl-ca="\$ca"/g) ?? []).length, 3);
});

test('the CA wrapper is valid sh, writes the PEM byte for byte and removes the file', () => {
  const cmd = buildRestoreCommand(cfg({ sslMode: 'require', sslCa: PEM }), 5432, false).replace(
    /PGSSLMODE=.*? psql .*?-q/,
    'cat "$ca" > "$OUT"; echo "$ca" > "$OUT.path"'
  );
  const out = `${require('node:os').tmpdir()}/ownshell-ca-test-${process.pid}`;
  execFileSync('/bin/sh', ['-c', cmd], { env: { ...process.env, OUT: out } });
  const fs = require('node:fs');
  assert.equal(fs.readFileSync(out, 'utf8'), PEM);
  assert.equal(fs.existsSync(fs.readFileSync(`${out}.path`, 'utf8').trim()), false);
  fs.rmSync(out); fs.rmSync(`${out}.path`);
});

test('logged commands hide the CA and passwords', () => {
  const logged = redactCommand(buildDumpCommand(cfg({ sslMode: 'require', sslCa: PEM }), 5432, {}));
  assert.doesNotMatch(logged, /BEGIN CERTIFICATE|'pw'/);
});

test('a compressed dump keeps the dump tool exit code (gzip no longer hides failures)', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const zlib = require('node:zlib');
  const bin = fs.mkdtempSync(`${os.tmpdir()}/ownshell-fake-pg-`);
  const run = (script: string) => {
    fs.writeFileSync(`${bin}/pg_dump`, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
    const cmd = buildDumpCommand(cfg({ sslMode: 'require', sslCa: PEM }), 5432, { compress: true });
    try {
      return { code: 0, out: execFileSync('/bin/sh', ['-c', cmd], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'ignore'] }) };
    } catch (error) {
      return { code: (error as { status: number }).status, out: Buffer.alloc(0) };
    }
  };
  const ok = run('echo "CREATE TABLE t;"; test -s "$PGSSLROOTCERT"');
  assert.equal(ok.code, 0);
  assert.equal(zlib.gunzipSync(ok.out).toString(), 'CREATE TABLE t;\n');
  assert.equal(run('echo partial; exit 3').code, 3);
  fs.rmSync(bin, { recursive: true, force: true });
});

test('the logger hides MySQL passwords and SSH exec no longer logs command text', async () => {
  const log = (await import('electron-log')).default as unknown as { info: (...a: unknown[]) => void };
  const { logger } = await import('../electron/logger');
  const seen: string[] = [];
  const original = log.info;
  log.info = (...a: unknown[]) => void seen.push(JSON.stringify(a));
  try {
    logger.info('Local export command', { args: ['exec', '-i', '-e', 'MYSQL_PWD=hunter2', 'db', 'mysqldump'] });
  } finally {
    log.info = original;
  }
  assert.doesNotMatch(seen.join(''), /hunter2/);
  const exec = require('node:fs').readFileSync(require('node:path').join(__dirname, '../electron/ssh/ssh2-exec.ts'), 'utf8');
  assert.doesNotMatch(exec, /logger\.\w+\([^)]*\{\s*command\b/);
});

test('strictPipe fails when either side fails (gzip error, corrupt archive)', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const zlib = require('node:zlib');
  const { strictPipe } = require('../electron/db-explorer/dump/command-builders');
  const sh = (cmd: string, input?: Buffer) => {
    try {
      return { code: 0, out: execFileSync('/bin/sh', ['-c', cmd], { input, stdio: ['pipe', 'pipe', 'ignore'] }).toString() };
    } catch (error) {
      return { code: (error as { status: number }).status, out: '' };
    }
  };
  assert.deepEqual(sh(strictPipe('echo a', 'cat')), { code: 0, out: 'a\n' });
  assert.equal(sh(strictPipe('sh -c "exit 3"', 'cat')).code, 3);
  assert.notEqual(sh(strictPipe('exit 0', 'cat')).code, 0); // a side that reports no status is a failure
  assert.equal(sh(strictPipe('echo a', 'exit 5')).code, 5);
  const gz = zlib.gzipSync(Buffer.from('INSERT 1;\n'.repeat(5000)));
  assert.deepEqual(sh(strictPipe('gunzip', 'wc -l | tr -d " "'), gz), { code: 0, out: '5000\n' });
  assert.notEqual(sh(strictPipe('gunzip', 'cat >/dev/null'), gz.subarray(0, gz.length - 20)).code, 0);
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ownshell-fake-gz-`);
  fs.writeFileSync(`${dir}/gzip`, '#!/bin/sh\ncat >/dev/null; exit 7\n', { mode: 0o755 });
  fs.writeFileSync(`${dir}/pg_dump`, '#!/bin/sh\necho ok\n', { mode: 0o755 });
  const cmd = buildDumpCommand(cfg({}), 5432, { compress: true });
  let code = 0;
  try { execFileSync('/bin/sh', ['-c', cmd], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, stdio: 'ignore' }); } catch (error) { code = (error as { status: number }).status; }
  assert.equal(code, 7);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('MySQL tools always use TCP so localhost cannot fall back to an unencrypted Unix socket', () => {
  const my = cfg({ type: 'mysql', host: 'localhost', port: 3307, connectionMode: 'local', sslMode: 'require', sslCa: PEM });
  assert.match(buildDumpCommand(my, 3307, {}), /mysqldump --protocol=TCP /);
  assert.match(buildRestoreCommand(my, 3307, true), /mysql --protocol=TCP /);
  assert.equal(buildLocalRestoreCommand(my, '/tmp/ca.pem').args[0], '--protocol=TCP');
  const clear = buildClearCommand({ ...my, port: 3307, mode: 'drop' }) ?? '';
  assert.equal((clear.match(/mysql --protocol=TCP /g) ?? []).length, 3);
});

test('local runner logs no raw arguments (docker exec carries MYSQL_PWD=…)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../electron/db-explorer/dump/local-runner.ts'), 'utf8');
  assert.doesNotMatch(src, /logger\.\w+\([^)]*\{[^}]*\bargs\s*[,}]/);
});

test('Redis export: TLS flags, password via env (not -a), private temp file; import is refused', () => {
  const { REDIS_IMPORT_UNSUPPORTED, buildLocalDumpCommand: localDump } = require('../electron/db-explorer/dump/command-builders');
  const redis = cfg({ type: 'redis', port: 6380, password: 's3cret pw', sslMode: 'require-no-verify', sslCa: PEM });
  const remote = buildDumpCommand(redis, 6380, {});
  assert.match(remote, /read -r REDISCLI_AUTH/);
  assert.doesNotMatch(remote, / -a |\/tmp\/ownshell-redis|s3cret/);
  assert.match(remote, /--tls/);
  assert.match(remote, /--insecure/);
  assert.match(remote, /mktemp/);
  // redis-cli checks only the CA chain, not the host name: "verify" is refused instead of weakened.
  assert.throws(() => buildDumpCommand({ ...redis, sslMode: 'require' }, 6380, {}), /host name/);
  assert.doesNotMatch(redactCommand(remote), /s3cret/);
  assert.deepEqual(localDump(cfg({ type: 'redis', connectionMode: 'local', sslMode: 'require-no-verify' }), { compress: false }).args.slice(0, 2), ['--tls', '--insecure']);
  assert.equal(buildEnvVars(redis).REDISCLI_AUTH, 's3cret pw');
  assert.throws(() => buildRestoreCommand(redis, 6380, false), new RegExp(REDIS_IMPORT_UNSUPPORTED.slice(0, 20)));
  assert.throws(() => buildLocalRestoreCommand(redis), /not supported/);
});

test('docker exec only names the password variable; the value comes from the spawn env', () => {
  for (const type of ['postgres', 'mysql', 'redis'] as const) {
    const { args } = require('../electron/db-explorer/dump/command-builders').buildLocalDumpCommand(
      cfg({ type, connectionMode: 'local', executionMode: 'docker', dockerContainer: 'db', password: 'pw!x' }),
      { compress: false }
    );
    assert.ok(!args.join(' ').includes('pw!x'), type);
    assert.deepEqual(args.slice(2, 4), ['-e', { postgres: 'PGPASSWORD', mysql: 'MYSQL_PWD', redis: 'REDISCLI_AUTH' }[type]]);
  }
});

test('known connection failures get a stable code for translation', () => {
  const { describeConnectionError } = require('../electron/db-explorer/connection/errors');
  const { DBConnectionError } = require('@ownshell/core');
  assert.equal(describeConnectionError(new DBConnectionError('x', 'MYSQL_TLS_IP_HOST')).code, 'MYSQL_TLS_IP_HOST');
  assert.equal(describeConnectionError(new Error('connect ECONNREFUSED 127.0.0.1:1')).code, 'CONNECTION_REFUSED');
  assert.equal(describeConnectionError(new Error('unable to verify the first certificate')).code, undefined);
  const aggregate = Object.assign(new AggregateError([new Error('connect ECONNREFUSED ::1:1'), new Error('connect ECONNREFUSED 127.0.0.1:1')], ''), { code: 'ECONNREFUSED' });
  assert.equal(describeConnectionError(aggregate).code, 'CONNECTION_REFUSED');
  assert.equal(describeConnectionError(new AggregateError([new Error('boom')], '')).message, 'boom');
  for (const lang of ['en', 'de']) {
    const keys = require(`../src/i18n/locales/${lang}/common.json`).db.connectionErrors;
    for (const code of ['MYSQL_TLS_IP_HOST', 'CONNECTION_REFUSED', 'TIMEOUT', 'AUTH_FAILED', 'DATABASE_NOT_FOUND', 'SSL_ERROR', 'HOST_NOT_FOUND', 'ACCESS_DENIED']) {
      assert.ok(keys[code], `${lang} ${code}`);
    }
  }
});

test('passwords never appear in a command line: the outer shell reads them from stdin', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const { stdinSecret } = require('../electron/db-explorer/dump/command-builders');
  const secret = "p'w $(touch /tmp/x) \\ \"q\" ";
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ownshell-fake-tools-`);
  for (const tool of ['pg_dump', 'mysqldump']) {
    fs.writeFileSync(`${dir}/${tool}`, '#!/bin/sh\nprintf "%s|%s" "$PGPASSWORD" "$MYSQL_PWD"\n', { mode: 0o755 });
  }
  // Restore tools echo their stdin, so the payload after the secret line can be compared exactly.
  for (const tool of ['psql', 'mysql']) {
    fs.writeFileSync(`${dir}/${tool}`, '#!/bin/sh\nprintf "%s|%s|" "$PGPASSWORD" "$MYSQL_PWD"; cat\n', { mode: 0o755 });
  }
  const run = (cmd: string, input: string) =>
    execFileSync('/bin/sh', ['-c', cmd], { input, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } }).toString();
  for (const type of ['postgres', 'mysql'] as const) {
    const c = cfg({ type, password: secret, sslMode: 'require', sslCa: PEM });
    const cmds = [buildDumpCommand(c, 1, {}), buildRestoreCommand(c, 1, false), buildClearCommand({ ...c, port: 1, mode: 'drop' }) ?? ''];
    for (const cmd of cmds) assert.ok(!cmd.includes('touch /tmp/x'), `${type}: secret in command`);
    const out = run(cmds[0], stdinSecret(c) ?? '');
    assert.equal(out, type === 'postgres' ? `${secret}|` : `|${secret}`);
    // Import: the first stdin line is the secret, everything after it reaches the tool byte for byte.
    const env = type === 'postgres' ? `${secret}||` : `|${secret}|`;
    const payload = 'SELECT 1;\n-- no trailing newline';
    assert.equal(run(buildRestoreCommand(c, 1, false), `${stdinSecret(c)}${payload}`), env + payload);
    const gz = require('node:zlib').gzipSync(Buffer.from(payload.repeat(2000)));
    const gzOut = execFileSync("/bin/sh", ["-c", buildRestoreCommand(c, 1, true)], {
      input: Buffer.concat([Buffer.from(stdinSecret(c) ?? ''), gz]),
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    }).toString();
    assert.equal(gzOut, env + payload.repeat(2000));
  }
  assert.throws(() => stdinSecret(cfg({ password: 'a\nb' })), /line breaks/);
  assert.equal(stdinSecret(cfg({ type: 'mongodb', password: 'x' })), undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});
