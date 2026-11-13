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
  ({ id: 'c', name: 'n', type: 'postgres', host: 'db.internal', port: 5432, database: 'shop', username: 'u', password: 'pw', connectionMode: 'ssh', sshTunnelEnabled: true, ...over }) as DBConnectionConfig & DumpConfig;

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
  assert.match(noVerify, /^PGPASSWORD='pw' PGSSLMODE='require' psql/);
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
    /PGPASSWORD=.*? psql .*?-q/,
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
