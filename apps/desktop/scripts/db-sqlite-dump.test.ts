import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  applySqliteScript,
  readSqlDump,
  splitSqliteStatements,
  sqliteDumpLines,
  sqliteLiteral,
  type SqliteHandle,
} from '../electron/db-explorer/dump/sqlite-runner';

function sourceDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE "we""ird" (id INTEGER PRIMARY KEY, name TEXT, data BLOB, big INTEGER,
      twice INTEGER GENERATED ALWAYS AS (id * 2) VIRTUAL);
    CREATE TABLE other (id INTEGER PRIMARY KEY, note TEXT);
    CREATE INDEX idx_name ON "we""ird"(name);
    CREATE TABLE log (msg TEXT);
    CREATE TRIGGER trg AFTER INSERT ON other
    BEGIN
      INSERT INTO log VALUES ('added');
    END;
    CREATE VIEW v AS SELECT name FROM "we""ird";
  `);
  db.prepare('INSERT INTO "we""ird"(id, name, data, big) VALUES (?, ?, ?, ?)').run(
    1,
    "it's ; -- tricky\nline",
    new Uint8Array([0, 255, 16]),
    9007199254740993n
  );
  db.prepare('INSERT INTO "we""ird"(id, name) VALUES (2, NULL)').run();
  db.exec("INSERT INTO other VALUES (1, 'x')");
  return db;
}

const dump = (db: DatabaseSync, options = {}) =>
  [...sqliteDumpLines(db as unknown as SqliteHandle, options)].join('');

test('sqlite literals quote strings and keep blobs and big integers exact', () => {
  assert.equal(sqliteLiteral("a'b"), "'a''b'");
  assert.equal(sqliteLiteral(null), 'NULL');
  assert.equal(sqliteLiteral(9007199254740993n), '9007199254740993');
  assert.equal(sqliteLiteral(new Uint8Array([0, 171])), "X'00ab'");
  assert.equal(sqliteLiteral(Infinity), '9e999');
});

test('a dump restores into an empty database with data, generated columns, index, trigger and view', () => {
  const sql = dump(sourceDb());
  assert.match(sql, /^PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n/);
  assert.match(sql, /COMMIT;\n$/);
  assert.doesNotMatch(sql, /twice"\)? VALUES/);

  const target = new DatabaseSync(':memory:');
  applySqliteScript(target as unknown as SqliteHandle, sql);

  const rows = target.prepare('SELECT id, name, hex(data) AS data, CAST(big AS TEXT) AS big, twice FROM "we""ird" ORDER BY id').all();
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { id: 1, name: "it's ; -- tricky\nline", data: '00FF10', big: '9007199254740993', twice: 2 },
    { id: 2, name: null, data: '', big: null, twice: 4 }, // hex(NULL) is ''
  ]);
  const names = target
    .prepare("SELECT type, name FROM sqlite_master WHERE name IN ('idx_name', 'trg', 'v') ORDER BY name")
    .all()
    .map((row) => `${row.type}:${row.name}`);
  assert.deepEqual(names, ['index:idx_name', 'trigger:trg', 'view:v']);
  // The trigger body (with `;` inside BEGIN ... END) was kept as one statement.
  target.exec("INSERT INTO other VALUES (2, 'y')");
  // 1 restored row (triggers are created after the data) + 1 from this insert.
  assert.equal(target.prepare('SELECT count(*) AS n FROM log').get()?.n, 2);
});

test('schema-only, data-only and table filters', () => {
  const db = sourceDb();
  assert.doesNotMatch(dump(db, { schemaOnly: true }), /^INSERT INTO/m);
  assert.doesNotMatch(dump(db, { dataOnly: true }), /CREATE /);
  const onlyOther = dump(db, { tables: ['other'] });
  assert.match(onlyOther, /CREATE TABLE other/);
  assert.match(onlyOther, /CREATE TRIGGER trg/);
  assert.doesNotMatch(onlyOther, /we""ird/);
});

test('import with drop replaces existing tables; a failing import changes nothing', () => {
  const sql = dump(sourceDb());
  const target = new DatabaseSync(':memory:');
  applySqliteScript(target as unknown as SqliteHandle, sql);
  // Same dump again only works after dropping.
  assert.throws(() => applySqliteScript(target as unknown as SqliteHandle, sql));
  applySqliteScript(target as unknown as SqliteHandle, sql, 'drop');
  assert.equal(target.prepare('SELECT count(*) AS n FROM other').get()?.n, 1);

  assert.throws(() =>
    applySqliteScript(
      target as unknown as SqliteHandle,
      "INSERT INTO other VALUES (5, 'z');\nINSERT INTO missing VALUES (1);",
      'truncate'
    )
  );
  assert.equal(target.prepare('SELECT count(*) AS n FROM other').get()?.n, 1);
  assert.equal(target.isTransaction, false);
});

const apply = (db: DatabaseSync, sql: string, clearMode?: 'none' | 'truncate' | 'drop') =>
  applySqliteScript(db as unknown as SqliteHandle, sql, clearMode);
const count = (db: DatabaseSync, table: string) =>
  db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n;

test('statement splitter respects quotes, comments and trigger bodies', () => {
  const sql = `INSERT INTO t VALUES('a;COMMIT;''b', "c;d", \`e;\`, [f;]); -- x; COMMIT;
/* ; COMMIT; */ CREATE TEMP TRIGGER tr AFTER INSERT ON t BEGIN INSERT INTO u VALUES(1); DELETE FROM u; END;
SELECT 1`;
  const parts = splitSqliteStatements(sql).map((s) => s.words[0]);
  assert.deepEqual(parts, ['INSERT', 'CREATE', 'SELECT']);
  assert.match(splitSqliteStatements(sql)[1].text, /DELETE FROM u; END;$/);
});

test('import rejects transaction and connection control before changing anything', () => {
  for (const control of ['COMMIT;', 'ROLLBACK;', "ATTACH DATABASE 'x.db' AS x;", 'END TRANSACTION;', 'SAVEPOINT s;', 'PRAGMA journal_mode=OFF;', 'VACUUM;']) {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (7)');
    assert.throws(
      () => apply(db, `INSERT INTO t VALUES(1); ${control} INSERT INTO missing VALUES(2);`, 'truncate'),
      /not allowed/,
      control
    );
    assert.equal(count(db, 't'), 1, control); // clearMode deletion did not run either
    assert.equal(db.isTransaction, false);
  }
});

test('strings containing ; and COMMIT import as data', () => {
  const db = new DatabaseSync(':memory:');
  apply(db, "BEGIN TRANSACTION;\nCREATE TABLE t (v TEXT);\nINSERT INTO t VALUES('x; COMMIT; y');\nCOMMIT;\n");
  assert.equal(db.prepare('SELECT v FROM t').get()?.v, 'x; COMMIT; y');
});

test('text with NUL characters survives the dump literal and re-import', () => {
  // node:sqlite cuts TEXT at NUL when reading, so build the dump line from the value directly.
  assert.equal(sqliteLiteral('a\u0000b'), "CAST(X'610062' AS TEXT)");
  const target = new DatabaseSync(':memory:');
  apply(target, `CREATE TABLE t (v TEXT);\nINSERT INTO t VALUES(${sqliteLiteral('a\u0000b')});\n`);
  const row = target.prepare('SELECT hex(v) AS h, typeof(v) AS t FROM t').get();
  assert.deepEqual({ ...row }, { h: '610062', t: 'text' });
});

test('AUTOINCREMENT high-water mark survives export/import', () => {
  const src = new DatabaseSync(':memory:');
  src.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)');
  for (let i = 1; i <= 100; i++) src.prepare('INSERT INTO t (v) VALUES (?)').run(String(i));
  src.exec('DELETE FROM t WHERE id = 100');
  const sql = dump(src);
  for (const clearMode of ['none', 'truncate'] as const) {
    const target = new DatabaseSync(':memory:');
    if (clearMode === 'truncate') {
      target.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT); INSERT INTO t (v) VALUES (1)');
      apply(target, dump(src, { dataOnly: true }), clearMode);
    } else apply(target, sql);
    target.exec("INSERT INTO t (v) VALUES ('next')");
    assert.equal(target.prepare("SELECT id FROM t WHERE v = 'next'").get()?.id, 101, clearMode);
    assert.equal(count(target, 'sqlite_sequence'), 1);
  }
});

test('dump reader enforces file and decompressed size caps', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownshell-sqlite-'));
  try {
    const file = path.join(dir, 'dump.sql.gz');
    fs.writeFileSync(file, gzipSync(Buffer.alloc(10_000, 'a')));
    const read = await readSqlDump(file, true, { maxInputBytes: 1_000, maxSqlBytes: 20_000 });
    assert.equal(read.text.length, 10_000);
    await assert.rejects(readSqlDump(file, true, { maxInputBytes: 1_000, maxSqlBytes: 5_000 }), /too large/);
    await assert.rejects(readSqlDump(file, true, { maxInputBytes: 10, maxSqlBytes: 20_000 }), /too large/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
