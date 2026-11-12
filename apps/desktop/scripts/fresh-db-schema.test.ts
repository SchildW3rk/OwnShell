import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';

// Mirrors runMigrations() in electron/db/init.ts on an empty database.
test('a fresh database gets every table of the Database interface', () => {
  const initSource = readFileSync(path.join(__dirname, '../electron/db/init.ts'), 'utf8');
  const inline = /function getInlineMigration\(\): string \{\s*return `([\s\S]*?)`;/.exec(initSource);
  assert.ok(inline, 'inline migration not found in init.ts');

  const sqlite = new DatabaseSync(':memory:');
  runIncrementalMigrations(sqlite as never);
  sqlite.exec(inline[1].replace(/\$\{Date\.now\(\)\}/g, String(Date.now())));
  runIncrementalMigrations(sqlite as never);

  const schemaSource = readFileSync(
    path.join(__dirname, '../../../packages/core/src/db/schema/database.ts'),
    'utf8'
  );
  const body = /export interface Database \{([\s\S]*?)\}/.exec(schemaSource);
  assert.ok(body, 'Database interface not found');
  const expected = [...body[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort();
  assert.ok(expected.length > 10);

  const actual = (
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
      name: string;
    }>
  ).map((row) => row.name);
  const missing = expected.filter((name) => !actual.includes(name));
  assert.deepEqual(missing, []);
});
