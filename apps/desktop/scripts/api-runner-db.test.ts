import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@ownshell/core';
import { vaultDataSchema } from '../electron/backup/types';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';
import { collectRunRequests } from '../electron/http/collection-runner';

/** Base schema from init.ts plus every incremental migration, like a real install. */
function migrated(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  const initSource = readFileSync(path.join(__dirname, '../electron/db/init.ts'), 'utf8');
  const inline = /function getInlineMigration\(\): string \{\s*return `([\s\S]*?)`;/.exec(initSource);
  assert.ok(inline, 'inline migration not found in init.ts');
  sqlite.exec(inline[1].replace(/\$\{Date\.now\(\)\}/g, String(Date.now())));
  runIncrementalMigrations(sqlite as never);
  return sqlite;
}

function kysely(sqlite: DatabaseSync): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new SqliteDialect({
      database: {
        close: () => sqlite.close(),
        prepare(sql: string) {
          const statement = sqlite.prepare(sql);
          return {
            reader: statement.columns().length > 0,
            all: (params: ReadonlyArray<unknown>) => statement.all(...(params as never[])),
            run: (params: ReadonlyArray<unknown>) => statement.run(...(params as never[])),
            iterate: (params: ReadonlyArray<unknown>) => statement.iterate(...(params as never[])),
          };
        },
      },
    }),
  });
}

test('migration 019: graphql bodies allowed after the rebuild, rows and indexes kept, new columns default', () => {
  const sqlite = migrated();
  const before = sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='api_requests'").get() as { sql: string };
  assert.match(before.sql, /'graphql'/);
  sqlite.exec(
    "INSERT INTO api_requests (id, name, body_type, created_at, updated_at) VALUES ('r1', 'Q', 'graphql', 1, 1)"
  );
  const row = sqlite.prepare('SELECT kind, assertions, captures, auth_type FROM api_requests').get();
  assert.deepEqual({ ...row }, { kind: 'http', assertions: '[]', captures: '[]', auth_type: 'none' });
  assert.throws(() =>
    sqlite.exec("INSERT INTO api_requests (id, name, body_type, created_at, updated_at) VALUES ('r2', 'X', 'soap', 1, 1)")
  );
  const indexes = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='api_requests'").all();
  assert.ok(indexes.some((index) => (index as { name: string }).name === 'idx_api_requests_collection_id'));
  // Idempotent.
  runIncrementalMigrations(sqlite as never);
  assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM api_requests').get() as { n: number }).n, 1);
});

/** The database as migration 018 left it: no 'graphql' in the body_type CHECK, no 019 columns, populated. */
function pre019Sqlite(): DatabaseSync {
  const sqlite = migrated();
  for (const column of ['kind', 'assertions', 'captures']) sqlite.exec(`ALTER TABLE api_requests DROP COLUMN ${column}`);
  const { sql } = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='api_requests'").get() as { sql: string };
  const indexes = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='api_requests' AND sql IS NOT NULL")
    .all() as Array<{ sql: string }>;
  sqlite.exec('PRAGMA foreign_keys = OFF');
  sqlite.exec(sql.replace(/,\s*'graphql'/, '').replace(/^CREATE TABLE\s+"?api_requests"?/i, 'CREATE TABLE api_requests_old'));
  sqlite.exec('DROP TABLE api_requests');
  sqlite.exec('ALTER TABLE api_requests_old RENAME TO api_requests');
  for (const index of indexes) sqlite.exec(index.sql);
  sqlite.exec('PRAGMA foreign_keys = ON');
  const now = 1_700_000_000_000;
  sqlite.exec(`
    INSERT INTO hosts (id, label, hostname, username, auth_type, created_at, updated_at)
      VALUES ('h1', 'host', 'example.test', 'root', 'key', ${now}, ${now});
    INSERT INTO vault_environments (id, name, project, variables, created_at, updated_at)
      VALUES ('e1', 'env', 'p', '[]', ${now}, ${now});
    INSERT INTO api_collections (id, name, created_at, updated_at, auth_type, auth_config, variables)
      VALUES ('c1', 'Folder', ${now}, ${now}, 'bearer', '{"token":"t"}', '[{"key":"A","value":"1"}]');
    INSERT INTO api_requests (id, collection_id, name, method, url, params, headers, body, body_type,
        auth_type, auth_config, network_host_id, environment_id, sort_order, created_at, updated_at,
        last_executed_at, raw_content_type, timeout_seconds, follow_redirects, verify_tls, variables, cookie_jar)
      VALUES ('r1', 'c1', 'Req', 'POST', 'https://api.test/{{A}}', '[{"key":"q"}]', '[{"key":"h"}]',
        '{"x":1}', 'json', 'oauth2', '{"grantType":"client_credentials"}', 'h1', 'e1', 7, ${now}, ${now + 1}, ${now + 2},
        'xml', 12, 0, 1, '[{"key":"B","value":"2"}]', 0);
    INSERT INTO api_requests (id, name, auth_type, created_at, updated_at) VALUES ('r2', 'Plain', 'inherit', ${now}, ${now});
    INSERT INTO api_request_history (id, request_id, method, url, status, duration_ms, response_size, created_at)
      VALUES ('hist1', 'r1', 'POST', 'https://api.test/{{A}}', 200, 5, 10, ${now});
  `);
  return sqlite;
}

const allRows = (sqlite: DatabaseSync, table: string) =>
  sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map((row) => ({ ...(row as Record<string, unknown>) }));
const requestIndexes = (sqlite: DatabaseSync) =>
  sqlite
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='api_requests' AND sql IS NOT NULL ORDER BY name")
    .all()
    .map((row) => ({ ...(row as Record<string, unknown>) }));

test('migration 019: a populated pre-019 api_requests survives the rebuild with every value, index and foreign key', () => {
  const sqlite = pre019Sqlite();
  const before = allRows(sqlite, 'api_requests');
  const historyBefore = allRows(sqlite, 'api_request_history');
  const indexesBefore = requestIndexes(sqlite);
  assert.equal(before.length, 2);
  assert.ok(indexesBefore.length >= 6);

  runIncrementalMigrations(sqlite as never);
  const schema = (sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='api_requests'").get() as { sql: string }).sql;
  assert.match(schema, /'graphql'/);
  assert.match(schema, /'oauth2'/, 'the 018 CHECK is kept');
  assert.deepEqual(
    allRows(sqlite, 'api_requests'),
    before.map((row) => ({ ...row, kind: 'http', assertions: '[]', captures: '[]' })),
    'every value survived, new columns default'
  );
  assert.deepEqual(allRows(sqlite, 'api_request_history'), historyBefore);
  assert.deepEqual(requestIndexes(sqlite), indexesBefore);
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal((sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
  sqlite.exec("DELETE FROM api_collections WHERE id='c1'");
  sqlite.exec("DELETE FROM hosts WHERE id='h1'");
  sqlite.exec("DELETE FROM vault_environments WHERE id='e1'");
  assert.deepEqual(
    { ...(sqlite.prepare("SELECT collection_id, network_host_id, environment_id FROM api_requests WHERE id='r1'").get() as object) },
    { collection_id: null, network_host_id: null, environment_id: null }
  );
  assert.throws(() =>
    sqlite.exec("INSERT INTO api_requests (id, name, collection_id, created_at, updated_at) VALUES ('r3', 'n', 'missing', 1, 1)")
  );
  assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='api_requests_rebuild'").get(), undefined);
});

test('migration 019: a failure during the rebuild rolls back; the new columns are still added', () => {
  const sqlite = pre019Sqlite();
  const before = allRows(sqlite, 'api_requests');
  // A view the rename cannot resolve makes the rebuild fail after DROP TABLE.
  sqlite.exec('CREATE VIEW broken_view AS SELECT id FROM api_requests');
  sqlite.exec('CREATE TRIGGER broken_trigger AFTER INSERT ON api_collections BEGIN SELECT id FROM api_requests; END');
  runIncrementalMigrations(sqlite as never);
  const kept = (sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='api_requests'").get() as { sql: string }).sql;
  assert.doesNotMatch(kept, /'graphql'/, 'rebuild did not happen');
  assert.deepEqual(
    allRows(sqlite, 'api_requests'),
    before.map((row) => ({ ...row, kind: 'http', assertions: '[]', captures: '[]' })),
    'original rows intact'
  );
  assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='api_requests_rebuild'").get(), undefined);
  assert.equal((sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
  assert.throws(() =>
    sqlite.exec("INSERT INTO api_requests (id, name, body_type, created_at, updated_at) VALUES ('g', 'Q', 'graphql', 1, 1)")
  );
});

test('collection runner order: subfolders first, then the folder requests, sidebar order', async () => {
  const sqlite = migrated();
  const db = kysely(sqlite);
  const folder = (id: string, parent: string | null, order: number) =>
    db.insertInto('api_collections').values({ id, parent_id: parent, name: id, sort_order: order, created_at: 1, updated_at: 1 } as never).execute();
  const request = (id: string, collection: string, order: number) =>
    db.insertInto('api_requests').values({ id, collection_id: collection, name: id, sort_order: order, created_at: 1, updated_at: 1 } as never).execute();
  await folder('root', null, 0);
  await folder('b', 'root', 1);
  await folder('a', 'root', 0);
  await folder('other', null, 1);
  await request('r2', 'root', 1);
  await request('r1', 'root', 0);
  await request('b1', 'b', 0);
  await request('a1', 'a', 0);
  await request('x', 'other', 0);
  const order = (await collectRunRequests(db, 'root')).map((row) => row.id);
  assert.deepEqual(order, ['a1', 'b1', 'r1', 'r2']);
});

test('old backups without the new request columns restore with defaults', () => {
  const parsed = vaultDataSchema.parse({
    version: 1,
    exportedAt: 1,
    appVersion: '1.0.0',
    hosts: [],
    keys: [],
    tunnels: [],
    snippets: [],
    s3Connections: [],
    apiRequests: [
      {
        id: 'r',
        collection_id: null,
        name: 'n',
        method: 'GET',
        url: '',
        params: '[]',
        headers: '[]',
        body: '',
        body_type: 'graphql',
        auth_type: 'none',
        auth_config: '{}',
        network_host_id: null,
        environment_id: null,
        sort_order: 0,
        created_at: 1,
        updated_at: 1,
        last_executed_at: null,
      },
    ],
  } as never);
  const request = parsed.apiRequests![0];
  assert.equal(request.kind, 'http');
  assert.equal(request.assertions, '[]');
  assert.equal(request.captures, '[]');
});
