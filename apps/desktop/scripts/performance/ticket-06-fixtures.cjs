'use strict';
// Synthetic local SQL services only. Run through the shared external measurement slot.
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('pg');
const mysql = require('mysql2/promise');
const dockerHost = process.env.OWNSHELL_PERF_DOCKER_HOST;
const rows = 20000;
const payload = 'Synthetic wide cell: ' + '0123456789abcdef'.repeat(128);
const docker = (args, env = process.env) => execFileSync('docker', ['--host', dockerHost, ...args], { encoding: 'utf8', timeout: 120000, env }).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(connect) {
  const deadline = Date.now() + 120000;
  let last;
  while (Date.now() < deadline) {
    try { return await connect(); } catch (error) { last = error; await delay(500); }
  }
  throw last;
}
function createSQLiteFixture(sqlitePath) {
  const escaped = payload.replaceAll("'", "''");
  execFileSync('/usr/bin/sqlite3', [sqlitePath], { input: `CREATE TABLE perf_rows (id INTEGER PRIMARY KEY, label TEXT NOT NULL, category INTEGER, amount REAL, enabled BOOLEAN, optional TEXT, payload TEXT, tail TEXT);\nWITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<${rows}) INSERT INTO perf_rows SELECT i, printf('row-%06d', i), i%7, i*1.25, i%2=0, CASE WHEN i%3=0 THEN NULL ELSE 'present' END, '${escaped}', printf('end-%06d', i) FROM n;\nCREATE TABLE perf_other (id INTEGER PRIMARY KEY, label TEXT); INSERT INTO perf_other VALUES (900001, 'other-table-only');`, timeout: 120000 });
}
async function startSQLFixtures() {
  if (!dockerHost?.startsWith('unix:///') || !fs.statSync(dockerHost.slice(7)).isSocket()) {
    throw new Error('Set OWNSHELL_PERF_DOCKER_HOST to an explicitly verified local unix:/// Docker socket');
  }
  const names = [];
  const password = randomBytes(32).toString('base64url');
  const rootPassword = randomBytes(32).toString('base64url');
  const localRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ownshell-sql-fixture-'));
  const sqlitePath = path.join(localRoot, 'synthetic.sqlite');
  const manifest = { rows, columns: 8, wideCellBytes: Buffer.byteLength(payload), tables: ['perf_rows', 'perf_other'], dockerHost, engines: {} };
  const close = async () => {
    const errors = [];
    for (const name of [...names].reverse()) {
      try { docker(['rm', '--force', name]); } catch (error) { errors.push(error); }
    }
    try { fs.rmSync(localRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'SQL fixture cleanup failed');
    return { containersRemoved: names.length, temporarySQLiteRemoved: !fs.existsSync(localRoot) };
  };
  try {
    const prefix = `ownshell-perf06-${process.pid}-${Date.now()}`;
    for (const [engine, image, internalPort, env] of [
      ['postgres', 'postgres:17-alpine', 5432, { POSTGRES_DB: 'synthetic', POSTGRES_USER: 'benchmark', POSTGRES_PASSWORD: password }],
      ['mysql', 'mysql:8.4', 3306, { MYSQL_DATABASE: 'synthetic', MYSQL_USER: 'benchmark', MYSQL_PASSWORD: password, MYSQL_ROOT_PASSWORD: rootPassword }],
    ]) {
      const name = `${prefix}-${engine}`;
      names.push(name);
      // Inherit values through Docker's --env NAME form: subprocess errors cannot print passwords in argv.
      docker(['run', '--pull=never', '--detach', '--rm', '--name', name, '--label', 'ownshell.performance.ticket=6', '--publish', `127.0.0.1::${internalPort}`, ...Object.keys(env).flatMap(key => ['--env', key]), image], { ...process.env, ...env });
      const port = Number(docker(['port', name, `${internalPort}/tcp`]).split(':').at(-1));
      manifest.engines[engine] = { image, imageId: docker(['inspect', '--format', '{{.Image}}', name]), port };
    }
    const pg = await ready(async () => {
      const client = new Client({ host: '127.0.0.1', port: manifest.engines.postgres.port, user: 'benchmark', password, database: 'synthetic', connectionTimeoutMillis: 1000 });
      try { await client.connect(); return client; } catch (error) { await client.end(); throw error; }
    });
    try {
      await pg.query('CREATE TABLE perf_rows (id INTEGER PRIMARY KEY, label TEXT NOT NULL, category INTEGER, amount DOUBLE PRECISION, enabled BOOLEAN, optional TEXT, payload TEXT, tail TEXT)');
      await pg.query(`INSERT INTO perf_rows SELECT i, 'row-' || lpad(i::text, 6, '0'), i % 7, i * 1.25, i % 2 = 0, CASE WHEN i % 3 = 0 THEN NULL ELSE 'present' END, $1, 'end-' || lpad(i::text, 6, '0') FROM generate_series(1, $2::integer) i`, [payload, rows]);
      await pg.query("CREATE TABLE perf_other (id INTEGER PRIMARY KEY, label TEXT); INSERT INTO perf_other VALUES (900001, 'other-table-only')");
      await pg.query('ANALYZE');
    } finally { await pg.end(); }
    const my = await ready(() => mysql.createConnection({ host: '127.0.0.1', port: manifest.engines.mysql.port, user: 'benchmark', password, database: 'synthetic', connectTimeout: 1000 }));
    try {
      await my.query('CREATE TABLE perf_rows (id INTEGER PRIMARY KEY, label TEXT NOT NULL, category INTEGER, amount DOUBLE, enabled BOOLEAN, optional TEXT, payload TEXT, tail TEXT)');
      for (let first = 1; first <= rows; first += 250) {
        const values = Array.from({ length: Math.min(250, rows - first + 1) }, (_, n) => {
          const i = first + n;
          return [i, `row-${String(i).padStart(6, '0')}`, i % 7, i * 1.25, i % 2 === 0, i % 3 === 0 ? null : 'present', payload, `end-${String(i).padStart(6, '0')}`];
        });
        await my.query('INSERT INTO perf_rows VALUES ?', [values]);
      }
      await my.query('CREATE TABLE perf_other (id INTEGER PRIMARY KEY, label TEXT)');
      await my.query("INSERT INTO perf_other VALUES (900001, 'other-table-only')");
    } finally { await my.end(); }
    createSQLiteFixture(sqlitePath);
    manifest.engines.sqlite = { version: execFileSync('/usr/bin/sqlite3', ['--version'], { encoding: 'utf8' }).trim(), file: 'isolated synthetic.sqlite' };
    return { manifest, sqlitePath, password, close };
  } catch (error) {
    try { await close(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'SQL fixture setup and cleanup failed'); }
    throw error;
  }
}
module.exports = { startSQLFixtures, createSQLiteFixture, rows, payload };
