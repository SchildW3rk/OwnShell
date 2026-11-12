import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  buildCreateTableSql,
  defaultLiteral,
} from '../electron/db-explorer/adapters/create-table-sql';

const columns = [
  { name: 'id', type: 'integer', nullable: false, primaryKey: true },
  { name: 'na"me`x', type: 'VARCHAR', length: 50, nullable: true, defaultValue: "it's" },
  { name: 'price', type: 'DECIMAL', precision: 10, scale: 2, nullable: true, defaultValue: '' },
  { name: 'created', type: 'TIMESTAMP', nullable: false, defaultValue: 'now()' },
];

test('postgres, mysql and sqlite quote identifiers their own way', () => {
  assert.equal(
    buildCreateTableSql('postgres', 'my"table', columns, 'app'),
    'CREATE TABLE "app"."my""table" ("id" INTEGER NOT NULL, "na""me`x" VARCHAR(50) DEFAULT \'it\'\'s\', ' +
      '"price" DECIMAL(10, 2), "created" TIMESTAMP NOT NULL DEFAULT NOW(), PRIMARY KEY ("id"))'
  );
  assert.equal(
    buildCreateTableSql('mysql', 'my`table', columns, 'ignored'),
    'CREATE TABLE `my``table` (`id` INTEGER NOT NULL, `na"me``x` VARCHAR(50) DEFAULT \'it\'\'s\', ' +
      '`price` DECIMAL(10, 2), `created` TIMESTAMP NOT NULL DEFAULT NOW(), PRIMARY KEY (`id`))'
  );
  assert.match(buildCreateTableSql('sqlite', 't', columns), /"created" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP/);
});

test('defaults: keywords and numbers stay bare, everything else is a safe string literal', () => {
  assert.equal(defaultLiteral('postgres', 'null'), 'NULL');
  assert.equal(defaultLiteral('mysql', '-1.5'), '-1.5');
  assert.equal(defaultLiteral('sqlite', 'true'), 'TRUE');
  assert.equal(defaultLiteral('postgres', "1); DROP TABLE x; --"), "'1); DROP TABLE x; --'");
  // MySQL: a trailing backslash must not escape the closing quote.
  assert.equal(defaultLiteral('mysql', "a\\'); DROP TABLE x; --"), "'a\\\\''); DROP TABLE x; --'");
  assert.equal(defaultLiteral('postgres', 'a\\b'), "'a\\b'");
});

test('rejects bad types, sizes and names', () => {
  assert.throws(() => buildCreateTableSql('mysql', 't', [{ name: 'a', type: 'INT); DROP TABLE x' }]));
  assert.throws(() => buildCreateTableSql('mysql', 't', [{ name: 'a', type: 'VARCHAR', length: 1.5 }]));
  assert.throws(() => buildCreateTableSql('postgres', 'x'.repeat(64), [{ name: 'a', type: 'TEXT' }]));
  assert.throws(() => buildCreateTableSql('sqlite', 't', []));
  assert.throws(() => buildCreateTableSql('sqlite', ' ', [{ name: 'a', type: 'TEXT' }]));
});

test('generated SQLite DDL runs and hostile names stay names', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    buildCreateTableSql('sqlite', 'x"; DROP TABLE y; --', [
      ...columns,
      { name: 'flag', type: 'INTEGER', nullable: true, unique: true, defaultValue: "0'); --" },
    ])
  );
  db.exec('INSERT INTO "x""; DROP TABLE y; --" (id) VALUES (1)');
  const row = db.prepare('SELECT "na""me`x" AS name, flag FROM "x""; DROP TABLE y; --"').get();
  assert.deepEqual({ ...row }, { name: "it's", flag: "0'); --" });
});
