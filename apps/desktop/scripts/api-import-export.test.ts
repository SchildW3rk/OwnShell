import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@ownshell/core';
import { BackupManager, parseVaultJson } from '../electron/backup/backup-manager';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';
import { insertImportTree, MAX_IMPORT_BYTES } from '../electron/http/api-import';
import { GLOBAL_VARIABLES_SETTING, parseStoredVariables, resolveVariableMap } from '../electron/http/api-variables';
import {
  buildOwnShellApiDocument,
  parseOwnShellApiFile,
  serializeOwnShellApiDocument,
} from '../electron/http/ownshell-api-format';
import { ImportError, parsePostmanFile, type PostmanCollectionImport } from '../electron/http/postman-import';
import { saveVariables } from '../electron/ipc/api-client/collections';
import { cryptoManager } from '../electron/security/crypto';

function createTestDb(): Kysely<Database> {
  const sqlite = new DatabaseSync(':memory:');
  const initSource = readFileSync(path.join(__dirname, '../electron/db/init.ts'), 'utf8');
  const inline = /function getInlineMigration\(\): string \{\s*return `([\s\S]*?)`;/.exec(initSource);
  assert.ok(inline, 'inline migration not found in init.ts');
  sqlite.exec(inline[1].replace(/\$\{Date\.now\(\)\}/g, String(Date.now())));
  runIncrementalMigrations(sqlite as never);
  sqlite.exec('PRAGMA foreign_keys = ON');
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

const fakeEncrypt = (value: string) => `enc(${value})`;
const importCode = (code: string) => (error: unknown) => error instanceof ImportError && error.code === code;
const kv = (json: string) => JSON.parse(json) as Array<Record<string, unknown>>;

// ---------------------------------------------------------------- Postman v2.1

const postman21 = {
  info: {
    _postman_id: '1',
    name: 'Shop API',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  event: [
    { listen: 'prerequest', script: { exec: ['pm.environment.set("a", 1);'] } },
    { listen: 'test', script: { exec: [''] } },
  ],
  variable: [
    { key: 'baseUrl', value: 'https://shop.test' },
    { key: 'token', value: 's3cr3t', type: 'secret' },
    { key: 'old', value: 'x', disabled: true },
  ],
  item: [
    {
      name: 'Orders',
      auth: { type: 'basic', basic: [{ key: 'username', value: 'u' }, { key: 'password', value: 'p' }] },
      item: [
        {
          name: 'Nested',
          item: [
            {
              name: 'List orders',
              event: [{ listen: 'test', script: { exec: ['pm.test("ok", () => {});'] } }],
              request: {
                method: 'GET',
                header: [
                  { key: 'Accept', value: 'application/json' },
                  { key: 'X-Debug', value: '1', disabled: true },
                ],
                url: {
                  raw: '{{baseUrl}}/orders?page=1&limit=5',
                  host: ['{{baseUrl}}'],
                  path: ['orders'],
                  query: [
                    { key: 'page', value: '1' },
                    { key: 'limit', value: '5', disabled: true },
                  ],
                },
              },
            },
          ],
        },
        {
          name: 'Create order',
          request: {
            method: 'post',
            auth: { type: 'noauth' },
            header: [],
            body: { mode: 'raw', raw: '{"id":"{{$guid}}"}', options: { raw: { language: 'json' } } },
            url: '{{baseUrl}}/orders',
          },
        },
      ],
    },
    {
      name: 'Form login',
      request: {
        method: 'POST',
        auth: {
          type: 'apikey',
          apikey: [
            { key: 'key', value: 'api_key' },
            { key: 'value', value: '{{key}}' },
            { key: 'in', value: 'query' },
          ],
        },
        body: {
          mode: 'urlencoded',
          urlencoded: [
            { key: 'user', value: 'me' },
            { key: 'skip', value: 'x', disabled: true },
          ],
        },
        url: { raw: 'https://auth.test/login' },
      },
    },
    {
      name: 'Upload',
      request: {
        method: 'PUT',
        auth: { type: 'oauth2', oauth2: [] },
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'note', value: 'hi', type: 'text' },
            { key: 'file', type: 'file', src: '/Users/someone/private/photo.png' },
          ],
        },
        url: { protocol: 'https', host: ['files', 'test'], port: '8443', path: ['up', ':id'] },
      },
    },
    {
      name: 'GraphQL',
      request: {
        method: 'POST',
        body: { mode: 'graphql', graphql: { query: '{ me { id } }', variables: '{"a":1}' } },
        url: 'https://gql.test/',
      },
    },
    { name: 'Xml', request: { method: 'POST', body: { mode: 'raw', raw: '<a/>', options: { raw: { language: 'xml' } } }, url: 'https://x.test' } },
    { name: 'Binary', request: { method: 'POST', body: { mode: 'file', file: { src: '/tmp/x.bin' } }, url: 'https://x.test' } },
    { name: 'Weird', request: { method: 'PURGE', url: 'https://x.test' } },
  ],
};

test('Postman v2.1: folders, requests, bodies, auth, variables and skipped features', () => {
  const result = parsePostmanFile(JSON.stringify(postman21)) as PostmanCollectionImport;
  assert.equal(result.kind, 'collection');
  const root = result.tree;
  assert.equal(root.name, 'Shop API');
  assert.equal(root.auth_type, 'bearer');
  assert.deepEqual(JSON.parse(root.auth_config), { token: '{{token}}' });
  assert.deepEqual(root.variables, [
    { key: 'baseUrl', value: 'https://shop.test', enabled: true, secret: false },
    { key: 'token', value: 's3cr3t', enabled: true, secret: true },
    { key: 'old', value: 'x', enabled: false, secret: false },
  ]);

  const [orders] = root.folders;
  assert.equal(orders.name, 'Orders');
  assert.equal(orders.auth_type, 'basic');
  assert.deepEqual(JSON.parse(orders.auth_config), { username: 'u', password: 'p' });
  const list = orders.folders[0].requests[0];
  assert.equal(orders.folders[0].name, 'Nested');
  assert.equal(list.method, 'GET');
  assert.equal(list.url, '{{baseUrl}}/orders');
  assert.equal(list.auth_type, 'inherit');
  assert.deepEqual(kv(list.params), [
    { key: 'page', value: '1', enabled: true },
    { key: 'limit', value: '5', enabled: false },
  ]);
  assert.deepEqual(kv(list.headers), [
    { key: 'Accept', value: 'application/json', enabled: true },
    { key: 'X-Debug', value: '1', enabled: false },
  ]);

  const create = orders.requests[0];
  assert.equal(create.method, 'POST');
  assert.equal(create.auth_type, 'none');
  assert.equal(create.body_type, 'json');
  assert.equal(create.body, '{"id":"{{$uuid}}"}');

  const [login, upload, graphql, xml, binary] = root.requests;
  assert.equal(root.requests.length, 5, 'PURGE is skipped');
  assert.equal(login.auth_type, 'api-key');
  assert.deepEqual(JSON.parse(login.auth_config), { key: 'api_key', value: '{{key}}', addTo: 'query' });
  assert.equal(login.body_type, 'form-urlencoded');
  assert.deepEqual(kv(login.body), [
    { key: 'user', value: 'me', enabled: true },
    { key: 'skip', value: 'x', enabled: false },
  ]);

  assert.equal(upload.url, 'https://files.test:8443/up/:id');
  assert.equal(upload.auth_type, 'none');
  assert.equal(upload.body_type, 'form-data');
  // File parts keep only the file name (no foreign local path).
  assert.deepEqual(kv(upload.body), [
    { key: 'note', value: 'hi', enabled: true, type: 'text' },
    { key: 'file', value: 'photo.png', enabled: true, type: 'file' },
  ]);

  assert.equal(graphql.body_type, 'graphql');
  assert.deepEqual(JSON.parse(graphql.body), { query: '{ me { id } }', variables: '{"a":1}' });
  assert.equal(xml.body_type, 'raw');
  assert.equal(xml.raw_content_type, 'xml');
  assert.equal(binary.body_type, 'binary');
  assert.equal(binary.body, '');

  assert.deepEqual(result.warnings, {
    SCRIPTS: 2,
    AUTH_UNSUPPORTED: 1,
    FILE_PARTS: 1,
    BINARY_FILE: 1,
    METHOD_UNSUPPORTED: 1,
  });
});

test('Postman v2.0: object auth, string URL and raw header string', () => {
  const result = parsePostmanFile(
    JSON.stringify({
      info: { name: 'Old', schema: 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json' },
      item: [
        {
          name: 'Ping',
          request: {
            method: 'GET',
            url: 'https://old.test/ping?x=1',
            header: 'Accept: text/plain\nX-Id: {{$randomUUID}}',
            auth: { type: 'bearer', bearer: { token: 'abc' } },
          },
        },
        { name: 'Shorthand', request: 'https://old.test/short' },
      ],
    })
  ) as PostmanCollectionImport;
  const [ping, short] = result.tree.requests;
  assert.equal(ping.url, 'https://old.test/ping?x=1');
  assert.deepEqual(JSON.parse(ping.auth_config), { token: 'abc' });
  assert.deepEqual(kv(ping.headers), [
    { key: 'Accept', value: 'text/plain', enabled: true },
    { key: 'X-Id', value: '{{$uuid}}', enabled: true },
  ]);
  assert.equal(short.method, 'GET');
  assert.equal(short.url, 'https://old.test/short');
  assert.equal(result.tree.auth_type, 'inherit');
});

test('Postman environment: valid keys only, disabled and invalid names reported', () => {
  const result = parsePostmanFile(
    JSON.stringify({
      name: 'Staging',
      _postman_variable_scope: 'environment',
      values: [
        { key: 'BASE_URL', value: 'https://stage.test', enabled: true },
        { key: 'api-key', value: 'x', enabled: true },
        { key: 'TOKEN', value: 'secret', type: 'secret', enabled: true },
        { key: 'OFF', value: '1', enabled: false },
        { key: 'TOKEN', value: 'dup', enabled: true },
      ],
    })
  );
  assert.deepEqual(result, {
    kind: 'environment',
    name: 'Staging',
    variables: [
      { key: 'BASE_URL', value: 'https://stage.test' },
      { key: 'TOKEN', value: 'secret' },
    ],
    skipped: ['api-key', 'OFF', 'TOKEN'],
  });
});

test('Postman: invalid, foreign, old, oversized and huge files are refused', () => {
  assert.throws(() => parsePostmanFile('{'), importCode('INVALID_JSON'));
  assert.throws(() => parsePostmanFile('{"requests":[]}'), importCode('NOT_POSTMAN'));
  assert.throws(
    () => parsePostmanFile(JSON.stringify({ info: { name: 'x', schema: 'https://schema.getpostman.com/json/collection/v1.0.0/' }, item: [] })),
    importCode('UNSUPPORTED_VERSION')
  );
  assert.throws(() => parsePostmanFile(JSON.stringify({ info: { name: 'x' }, item: 'nope' })), importCode('INVALID_FILE'));
  assert.throws(() => parsePostmanFile(' '.repeat(MAX_IMPORT_BYTES + 1)), importCode('TOO_LARGE'));
  const many = { info: { name: 'x' }, item: Array.from({ length: 10_001 }, () => ({ name: 'r', request: 'https://h.test' })) };
  assert.throws(() => parsePostmanFile(JSON.stringify(many)), importCode('TOO_MANY_ITEMS'));
  let deep: Record<string, unknown> = { name: 'leaf', request: 'https://h.test' };
  for (let depth = 0; depth < 40; depth += 1) deep = { name: `f${depth}`, item: [deep] };
  assert.throws(() => parsePostmanFile(JSON.stringify({ info: { name: 'x' }, item: [deep] })), importCode('TOO_MANY_ITEMS'));
});

test('Postman import lands in a new top-level folder with secret variables encrypted', async () => {
  const db = createTestDb();
  const { tree } = parsePostmanFile(JSON.stringify(postman21)) as PostmanCollectionImport;
  const counts = await insertImportTree(db, tree, fakeEncrypt);
  assert.deepEqual({ ...counts, folderId: '' }, { folderId: '', folders: 3, requests: 7, variables: 3 });
  const root = await db.selectFrom('api_collections').selectAll().where('id', '=', counts.folderId).executeTakeFirstOrThrow();
  assert.equal(root.parent_id, null);
  assert.ok(!root.variables.includes('"value":"s3cr3t"'));
  assert.ok(root.variables.includes('enc(s3cr3t)'));
});

// ---------------------------------------------------------------- OwnShell format

async function seedFolder(db: Kysely<Database>) {
  const t = 1_700_000_000_000;
  await db.insertInto('api_collections').values([
    {
      id: 'root', parent_id: null, name: 'Billing', description: 'Invoices', sort_order: 0,
      auth_type: 'bearer', auth_config: JSON.stringify({ token: 'literal-SECRET-token' }),
      variables: JSON.stringify([
        { id: 'a', key: 'BASE', value: 'https://billing.test', enabled: true, secret: false },
        { id: 'b', key: 'TOKEN', value: '', enabled: true, secret: true, value_encrypted: 'cipher-SECRET' },
      ]),
      created_at: t, updated_at: t,
    },
    {
      id: 'sub-b', parent_id: 'root', name: 'B', description: null, sort_order: 1,
      auth_type: 'inherit', auth_config: '{}', variables: '[]', created_at: t, updated_at: t,
    },
    {
      id: 'sub-a', parent_id: 'root', name: 'A', description: null, sort_order: 0,
      auth_type: 'api-key', auth_config: JSON.stringify({ key: 'X-Key', value: '{{KEY}}', addTo: 'header' }),
      variables: '[]', created_at: t, updated_at: t,
    },
    {
      id: 'other', parent_id: null, name: 'Other', description: null, sort_order: 1,
      auth_type: 'inherit', auth_config: '{}', variables: '[]', created_at: t, updated_at: t,
    },
  ]).execute();
  const request = {
    params: '[]', headers: '[]', body: '', body_type: 'none' as const, raw_content_type: 'text' as const,
    auth_type: 'inherit' as const, auth_config: '{}', network_host_id: null, environment_id: null,
    timeout_seconds: null, follow_redirects: null, verify_tls: null, variables: '[]',
    created_at: t, updated_at: t, last_executed_at: null,
  };
  await db.insertInto('api_requests').values([
    {
      ...request, id: 'r1', collection_id: 'root', name: 'Create', method: 'POST', url: '{{BASE}}/invoices',
      sort_order: 0, body_type: 'json', body: '{"n":1}',
      headers: JSON.stringify([
        { key: 'Authorization', value: 'Basic literal-SECRET', enabled: true },
        { key: 'X-Trace', value: '{{$uuid}}', enabled: false },
      ]),
      params: JSON.stringify([
        { key: 'dry', value: '1', enabled: true },
        { key: 'access_token', value: 'tok-SECRET', enabled: true },
      ]),
      variables: JSON.stringify([{ key: 'N', value: '1', enabled: true }]),
      timeout_seconds: 5, follow_redirects: 0, verify_tls: 1,
    },
    {
      ...request, id: 'r2', collection_id: 'sub-a', name: 'Upload', method: 'PUT',
      url: 'https://me:pw-SECRET@f.test/up?api_key=SECRET1&page=2#SECRET-frag',
      sort_order: 0, body_type: 'form-data',
      body: JSON.stringify([
        { key: 'f', value: '/Users/someone/private/scan.pdf', enabled: true, type: 'file' },
        { key: 't', value: 'x', enabled: true, type: 'text' },
      ]),
      auth_type: 'basic', auth_config: JSON.stringify({ username: 'me', password: 'pw-SECRET' }),
    },
    {
      ...request, id: 'r3', collection_id: 'sub-b', name: 'Raw file', method: 'POST', url: 'https://f.test',
      sort_order: 0, body_type: 'binary',
      body: JSON.stringify({ path: '/Users/someone/private/blob.bin', name: 'blob.bin', size: 3 }),
    },
    { ...request, id: 'r4', collection_id: 'other', name: 'Elsewhere', method: 'GET', url: 'https://o.test', sort_order: 0 },
  ]).execute();
}

const stripIds = (text: string) => text.replace(/"id": "[^"]*"/g, '"id": "-"');

test('OwnShell file: deterministic, no secrets or local paths, lossless round trip', async () => {
  const db = createTestDb();
  await seedFolder(db);
  const load = async () => [
    await db.selectFrom('api_collections').selectAll().execute(),
    await db.selectFrom('api_requests').selectAll().execute(),
  ] as const;

  const [collections, requests] = await load();
  const first = serializeOwnShellApiDocument(buildOwnShellApiDocument('root', collections, requests));
  // Same input, same bytes; reversed row order does not matter.
  assert.equal(
    serializeOwnShellApiDocument(buildOwnShellApiDocument('root', [...collections].reverse(), [...requests].reverse())),
    first
  );
  assert.ok(!/SECRET|cipher|\/Users\//.test(first), first);
  assert.ok(!first.includes('Elsewhere'));
  const document = JSON.parse(first);
  assert.equal(document.format, 'ownshell-api');
  assert.equal(document.version, 1);
  assert.deepEqual(Object.keys(document.folder), ['id', 'name', 'description', 'auth', 'variables', 'folders', 'requests']);
  assert.deepEqual(document.folder.folders.map((f: { name: string }) => f.name), ['A', 'B']);
  assert.deepEqual(document.folder.auth, { type: 'bearer', config: { token: '{{bearerToken}}' } });
  assert.deepEqual(document.folder.variables[1], { key: 'TOKEN', value: '', enabled: true, secret: true });
  const create = document.folder.requests[0];
  assert.equal(create.headers[0].value, '{{Authorization}}');
  assert.deepEqual(create.params.map((p: { value: string }) => p.value), ['1', '{{access_token}}']);
  assert.equal(document.folder.folders[0].requests[0].url, 'https://f.test/up?api_key={{api_key}}&page=2');
  assert.deepEqual(create.settings, { timeoutSeconds: 5, followRedirects: false, verifyTls: true });
  assert.deepEqual(document.folder.folders[0].requests[0].body.items[0], { key: 'f', value: 'scan.pdf', enabled: true, type: 'file' });
  assert.deepEqual(document.folder.folders[0].requests[0].auth.config, { username: 'me', password: '{{basicPassword}}' });
  assert.equal(document.folder.folders[1].requests[0].body.fileName, 'blob.bin');

  const counts = await insertImportTree(db, parseOwnShellApiFile(first), fakeEncrypt);
  assert.equal(counts.requests, 3);
  const [afterCollections, afterRequests] = await load();
  const imported = afterCollections.find((collection) => collection.id === counts.folderId)!;
  assert.equal(imported.parent_id, null, 'imported as a new top-level folder');
  assert.ok(afterCollections.some((collection) => collection.id === 'root'), 'nothing overwritten');
  const second = serializeOwnShellApiDocument(buildOwnShellApiDocument(counts.folderId, afterCollections, afterRequests));
  assert.equal(stripIds(second), stripIds(first));
});

test('OwnShell file: unknown major version and foreign files are refused', () => {
  const valid = { format: 'ownshell-api', version: 1, folder: { id: 'x', name: 'n', description: null, auth: { type: 'none', config: {} }, variables: [], folders: [], requests: [] } };
  assert.equal(parseOwnShellApiFile(JSON.stringify(valid)).name, 'n');
  assert.throws(() => parseOwnShellApiFile(JSON.stringify({ ...valid, version: 2 })), importCode('UNSUPPORTED_VERSION'));
  assert.throws(() => parseOwnShellApiFile(JSON.stringify({ ...valid, format: 'postman' })), importCode('INVALID_FILE'));
  assert.throws(() => parseOwnShellApiFile(JSON.stringify({ ...valid, folder: { ...valid.folder, auth: { type: 'digest', config: {} } } })), importCode('INVALID_FILE'));
  assert.throws(() => parseOwnShellApiFile('nope'), importCode('INVALID_JSON'));
});

test('imports: deeply nested, huge-string and prototype-key files are refused before the schema', () => {
  // Built as text: JSON.stringify itself would overflow on 5000 levels.
  const nest = (key: string, levels: number) => `{"name":"f","${key}":[`.repeat(levels) + '{}' + ']}'.repeat(levels);
  const deepPostman = `{"info":{"name":"x","schema":"https://schema.getpostman.com/json/collection/v2.1.0/"},"item":[${nest('item', 5000)}]}`;
  assert.throws(() => parsePostmanFile(deepPostman), importCode('TOO_MANY_ITEMS'));
  const deepOwnShell = `{"format":"ownshell-api","version":1,"folder":${nest('folders', 5000)}}`;
  assert.throws(() => parseOwnShellApiFile(deepOwnShell), importCode('TOO_MANY_ITEMS'));
  // The allowed folder depth still fits, with a request carrying nested url/auth/body.
  const request = '{"name":"r","request":{"method":"GET","url":{"raw":"https://h.test","query":[{"key":"a","value":"b"}]},"auth":{"type":"bearer","bearer":[{"key":"token","value":"t"}]},"body":{"mode":"formdata","formdata":[{"key":"k","value":"v"}]}}}';
  const allowed = `{"info":{"name":"x","schema":"https://schema.getpostman.com/json/collection/v2.1.0/"},"item":[${'{"name":"f","item":['.repeat(32)}${request}${']}'.repeat(32)}]}`;
  assert.equal(parsePostmanFile(allowed).kind, 'collection');
  const bigString = JSON.stringify({ info: { name: 'x'.repeat(1024 * 1024 + 1) }, item: [] });
  assert.throws(() => parsePostmanFile(bigString), importCode('TOO_LARGE'));
  const proto = '{"format":"ownshell-api","version":1,"folder":{"__proto__":{"x":1}}}';
  assert.throws(() => parseOwnShellApiFile(proto), importCode('INVALID_FILE'));
});

// ---------------------------------------------------------------- Backup

test('backup carries folder/global variables (secrets re-encrypted), never history; old backups get defaults', async () => {
  const db = createTestDb();
  cryptoManager.init(db);
  await cryptoManager.initialize('master-password');
  const t = 1_700_000_000_000;
  await db.insertInto('api_collections').values({
    id: 'c1', parent_id: null, name: 'C', description: null, sort_order: 0, auth_type: 'inherit',
    auth_config: '{}', variables: '[]', created_at: t, updated_at: t,
  }).execute();
  await saveVariables(db, 'c1', [
    { key: 'PLAIN', value: 'p', enabled: true, secret: false },
    { key: 'SECRET', value: 'folder-secret', enabled: true, secret: true },
  ]);
  await saveVariables(db, null, [{ key: 'G', value: 'global-secret', enabled: false, secret: true }]);
  await db.insertInto('api_request_history').values({
    id: 'h1', request_id: null, method: 'GET', url: 'https://h.test', status: 200, duration_ms: 1, response_size: 1, created_at: t,
  }).execute();

  const manager = new BackupManager(db);
  const vault = await manager.decryptVault(await manager.exportVault('backup-pw'), 'backup-pw');
  assert.deepEqual(
    vault.apiCollections?.[0].variables.map(({ key, value, secret }) => ({ key, value, secret })),
    [
      { key: 'PLAIN', value: 'p', secret: false },
      { key: 'SECRET', value: 'folder-secret', secret: true },
    ]
  );
  assert.deepEqual(vault.apiGlobalVariables?.map(({ key, value, enabled }) => ({ key, value, enabled })), [
    { key: 'G', value: 'global-secret', enabled: false },
  ]);
  assert.ok(!JSON.stringify(vault).includes('api_request_history'));

  await db.updateTable('api_collections').set({ variables: '[]' }).execute();
  await manager.restoreVault(vault);
  const restored = await db.selectFrom('api_collections').select('variables').executeTakeFirstOrThrow();
  assert.ok(!restored.variables.includes('folder-secret'), 'secret encrypted at rest again');
  const decrypt = (value: string) => cryptoManager.decryptData(value);
  assert.deepEqual(resolveVariableMap(restored.variables, decrypt).variables, { PLAIN: 'p', SECRET: 'folder-secret' });
  const globals = await db.selectFrom('app_settings').select('value').where('key', '=', GLOBAL_VARIABLES_SETTING).executeTakeFirstOrThrow();
  assert.equal(parseStoredVariables(globals.value)[0].secret, true);
  assert.ok(!globals.value.includes('global-secret'));
  assert.equal((await db.selectFrom('api_request_history').selectAll().execute()).length, 1, 'history untouched');

  // A backup from before migration 017.
  const old = parseVaultJson(JSON.stringify({
    version: 1, exportedAt: t, appVersion: '1.0.0', hosts: [], keys: [], tunnels: [], snippets: [], s3Connections: [],
    apiCollections: [{ id: 'c', parent_id: null, name: 'C', description: null, sort_order: 0, created_at: t, updated_at: t }],
    apiRequests: [{
      id: 'r', collection_id: 'c', name: 'R', method: 'GET', url: 'https://h.test', params: '[]', headers: '[]',
      body: '', body_type: 'none', auth_type: 'none', auth_config: '{}', network_host_id: null, environment_id: null,
      sort_order: 0, created_at: t, updated_at: t, last_executed_at: null,
    }],
  }));
  assert.deepEqual(old.apiCollections?.[0].variables, []);
  assert.equal(old.apiRequests?.[0].variables, '[]');
  assert.equal(old.apiGlobalVariables, undefined);
  await manager.restoreVault(old);
  assert.ok(
    (await db.selectFrom('app_settings').select('value').where('key', '=', GLOBAL_VARIABLES_SETTING).executeTakeFirst())?.value.includes('"G"'),
    'globals are kept when the backup has none'
  );
});
