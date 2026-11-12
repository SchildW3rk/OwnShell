import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { __testIpcMainHandlers } from 'electron';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@ownshell/core';
import { BackupManager } from '../electron/backup/backup-manager';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';
import { insertImportTree } from '../electron/http/api-import';
import { publicAuthConfig, revealAuthSecrets, storedAuthConfig } from '../electron/http/oauth';
import { buildOwnShellApiDocument } from '../electron/http/ownshell-api-format';
import { prepareRequest } from '../electron/http/prepare-request';
import type { HttpRequestConfig } from '../electron/http/types';
import { registerApiCollectionHandlers } from '../electron/ipc/api-client/collections';
import { exportCurl, loadCollectionChain, revealAuthSecret } from '../electron/ipc/api-client/request-context';
import { registerApiRequestHandlers } from '../electron/ipc/api-client/requests';
import { cryptoManager } from '../electron/security/crypto';

function createTestDb(): Kysely<Database> {
  const sqlite = new DatabaseSync(':memory:');
  const initSource = readFileSync(path.join(__dirname, '../electron/db/init.ts'), 'utf8');
  const inline = /function getInlineMigration\(\): string \{\s*return `([\s\S]*?)`;/.exec(initSource);
  assert.ok(inline, 'inline migration not found in init.ts');
  sqlite.exec(inline[1].replace(/\$\{Date\.now\(\)\}/g, String(Date.now())));
  sqlite.exec('PRAGMA foreign_keys = ON');
  runIncrementalMigrations(sqlite as never);
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

const encrypt = (value: string) => `enc(${value})`;
const decrypt = (value: string) => value.replace(/^enc\((.*)\)$/s, '$1');
const SECRETS = /TOKEN-SECRET|PASSWORD-SECRET|APIKEY-SECRET/;

async function setup() {
  const db = createTestDb();
  cryptoManager.init(db);
  const { recoveryKey } = await cryptoManager.initialize('master-password');
  __testIpcMainHandlers.clear();
  registerApiCollectionHandlers(db);
  registerApiRequestHandlers(db);
  const mainFrame = { url: 'ownshell://app/index.html' };
  const event = { senderFrame: mainFrame, sender: { id: 1, mainFrame } };
  const invoke = (channel: string, ...args: unknown[]) => {
    const handler = __testIpcMainHandlers.get(channel);
    assert.ok(handler, `${channel} registered`);
    return handler(event, ...args) as Promise<Record<string, unknown> & { id: string; auth_config: string }>;
  };
  return { db, invoke, recoveryKey };
}

function sendConfig(request: { id: string }, collectionId: string | null): HttpRequestConfig {
  return {
    method: 'GET',
    url: 'https://api.test/data',
    params: '[]',
    headers: '[]',
    body: '',
    bodyType: 'none',
    authType: 'inherit',
    authConfig: '{}',
    collectionId,
    requestId: request.id,
    networkHostId: null,
    environmentId: null,
  };
}

async function sentHeaders(db: Kysely<Database>, config: HttpRequestConfig) {
  const owner = { type: 'request' as const, id: config.requestId! };
  const revealed = await revealAuthSecret(db, config, await loadCollectionChain(db, config.collectionId), owner);
  const prepared = await prepareRequest(
    { ...config, authConfig: revealed.authConfig },
    { variables: {}, authChain: revealed.chain, loadFile: async () => assert.fail('no files') }
  );
  return { headers: prepared.headers, url: prepared.url.href };
}

test('stored config: bearer/basic/api-key secrets encrypted, kept, cleared, never public', () => {
  for (const [type, field, flag] of [
    ['bearer', 'token', 'hasToken'],
    ['basic', 'password', 'hasPassword'],
    ['api-key', 'value', 'hasValue'],
  ] as const) {
    const stored = storedAuthConfig(type, JSON.stringify({ username: 'u', [field]: 's3cr3t' }), undefined, encrypt);
    assert.deepEqual(JSON.parse(stored), { username: 'u', [`${field}Encrypted`]: 'enc(s3cr3t)' });
    const pub = publicAuthConfig(type, stored);
    assert.deepEqual(JSON.parse(pub), { username: 'u', [flag]: true });
    // Saving the public config back (empty input) keeps the secret; reveal decrypts it.
    const kept = storedAuthConfig(type, pub, stored, encrypt);
    assert.equal(JSON.parse(kept)[`${field}Encrypted`], 'enc(s3cr3t)');
    assert.equal(JSON.parse(revealAuthSecrets(pub, kept, decrypt))[field], 's3cr3t');
    // Explicit '' clears it.
    const cleared = storedAuthConfig(type, JSON.stringify({ [field]: '' }), stored, encrypt);
    assert.deepEqual(JSON.parse(cleared), {});
    // A new value replaces it.
    assert.equal(JSON.parse(storedAuthConfig(type, JSON.stringify({ [field]: 'new' }), stored, encrypt))[`${field}Encrypted`], 'enc(new)');
  }
});

test('stored config: a pure {{variable}} reference stays plain and visible, literal text around it is encrypted', () => {
  const variable = storedAuthConfig('bearer', '{"token":"{{TOKEN}}"}', undefined, encrypt);
  assert.deepEqual(JSON.parse(variable), { token: '{{TOKEN}}' });
  assert.equal(publicAuthConfig('bearer', variable), variable);
  const mixed = storedAuthConfig('bearer', '{"token":"abc{{TOKEN}}"}', undefined, encrypt);
  assert.deepEqual(JSON.parse(mixed), { tokenEncrypted: 'enc(abc{{TOKEN}})' });
  // Secrets of another auth type in the same config are encrypted too.
  const lingering = storedAuthConfig('bearer', '{"token":"t","password":"p"}', undefined, encrypt);
  assert.deepEqual(JSON.parse(lingering), { tokenEncrypted: 'enc(t)', passwordEncrypted: 'enc(p)' });
  // Imported encrypted fields are never trusted as stored ciphertext.
  assert.deepEqual(JSON.parse(storedAuthConfig('bearer', '{"tokenEncrypted":"x"}', undefined, encrypt)), {});
});

test('IPC save/load, inherited send and curl export: the secret stays in the main process', async () => {
  const { db, invoke } = await setup();
  const folder = await invoke('api:collections:create', {
    name: 'F',
    auth_type: 'basic',
    auth_config: JSON.stringify({ username: 'user', password: 'PASSWORD-SECRET' }),
  });
  const request = await invoke('api:requests:create', {
    name: 'R',
    collection_id: folder.id,
    url: 'https://api.test/data',
    auth_type: 'bearer',
    auth_config: JSON.stringify({ token: 'TOKEN-SECRET' }),
  });
  assert.equal(JSON.parse(request.auth_config).hasToken, true);
  assert.equal(JSON.parse(folder.auth_config).hasPassword, true);

  const renderer = JSON.stringify([
    folder,
    request,
    await invoke('api:collections:get-all'),
    await invoke('api:requests:get-all'),
    await invoke('api:requests:get-by-id', request.id),
  ]);
  assert.doesNotMatch(renderer, SECRETS);
  assert.doesNotMatch(renderer, /Encrypted/);
  const rows = JSON.stringify([
    await db.selectFrom('api_collections').selectAll().execute(),
    await db.selectFrom('api_requests').selectAll().execute(),
  ]);
  assert.doesNotMatch(rows, SECRETS);

  // Saving the public config back keeps the secret.
  await invoke('api:requests:update', request.id, { auth_config: request.auth_config });

  // Own bearer token.
  const own = { ...sendConfig(request, folder.id), authType: 'bearer' as const, authConfig: request.auth_config };
  assert.equal((await sentHeaders(db, own)).headers.Authorization, 'Bearer TOKEN-SECRET');
  // A typed (unsaved) value wins over the stored one.
  const typed = { ...own, authConfig: '{"token":"TYPED"}' };
  assert.equal((await sentHeaders(db, typed)).headers.Authorization, 'Bearer TYPED');
  // Inherited basic password.
  const inherited = sendConfig(request, folder.id);
  const basic = `Basic ${Buffer.from('user:PASSWORD-SECRET').toString('base64')}`;
  assert.equal((await sentHeaders(db, inherited)).headers.Authorization, basic);

  // Copy as curl: resolved has the secret, the placeholder export never does.
  assert.match(await exportCurl(db, own, true), /Bearer TOKEN-SECRET/);
  const placeholder = await exportCurl(db, own, false);
  assert.match(placeholder, /Bearer \{\{bearerToken\}\}/);
  assert.doesNotMatch(placeholder, SECRETS);
  assert.match(await exportCurl(db, inherited, true), /-u 'user:PASSWORD-SECRET'/);
  assert.doesNotMatch(await exportCurl(db, inherited, false), SECRETS);

  // Explicit clear removes it.
  await invoke('api:requests:update', request.id, { auth_config: '{"token":""}' });
  const stored = await db.selectFrom('api_requests').select('auth_config').executeTakeFirstOrThrow();
  assert.equal(stored.auth_config, '{}');
});

test('legacy plain-text secrets are hidden, encrypted on the first read after unlock, idempotently', async () => {
  const { db, invoke } = await setup();
  const now = Date.now();
  await db.insertInto('api_collections').values({
    id: 'c1', parent_id: null, name: 'F', description: null, sort_order: 0, variables: '[]',
    auth_type: 'api-key', auth_config: JSON.stringify({ key: 'X-Key', value: 'APIKEY-SECRET', addTo: 'query' }),
    created_at: now, updated_at: now,
  } as never).execute();
  await db.insertInto('api_requests').values({
    id: 'r1', collection_id: 'c1', name: 'R', method: 'GET', url: 'https://api.test/data', params: '[]',
    headers: '[]', body: '', body_type: 'none', auth_type: 'bearer',
    auth_config: JSON.stringify({ token: 'TOKEN-SECRET' }), sort_order: 0, created_at: now, updated_at: now,
  } as never).execute();
  await db.insertInto('api_requests').values({
    id: 'r2', collection_id: 'c1', name: 'V', method: 'GET', url: 'https://api.test/data', params: '[]',
    headers: '[]', body: '', body_type: 'none', auth_type: 'bearer',
    auth_config: JSON.stringify({ token: '{{TOKEN}}' }), sort_order: 1, created_at: now, updated_at: now,
  } as never).execute();

  // Never public, even before the migration.
  const legacy = await db.selectFrom('api_requests').select('auth_config').where('id', '=', 'r1').executeTakeFirstOrThrow();
  assert.deepEqual(JSON.parse(publicAuthConfig('bearer', legacy.auth_config)), { hasToken: true });

  const renderer = JSON.stringify([await invoke('api:requests:get-all'), await invoke('api:collections:get-all')]);
  assert.doesNotMatch(renderer, SECRETS);
  const after = JSON.stringify([
    await db.selectFrom('api_collections').selectAll().execute(),
    await db.selectFrom('api_requests').selectAll().execute(),
  ]);
  assert.doesNotMatch(after, SECRETS);
  const r2 = await db.selectFrom('api_requests').select('auth_config').where('id', '=', 'r2').executeTakeFirstOrThrow();
  assert.equal(r2.auth_config, '{"token":"{{TOKEN}}"}', 'variable references stay as they are');

  const r1 = await db.selectFrom('api_requests').select('auth_config').where('id', '=', 'r1').executeTakeFirstOrThrow();
  await invoke('api:requests:get-all');
  const again = await db.selectFrom('api_requests').select('auth_config').where('id', '=', 'r1').executeTakeFirstOrThrow();
  assert.equal(again.auth_config, r1.auth_config, 'idempotent');

  const sent = await sentHeaders(db, { ...sendConfig({ id: 'r1' }, 'c1'), authType: 'bearer', authConfig: '{"hasToken":true}' });
  assert.equal(sent.headers.Authorization, 'Bearer TOKEN-SECRET');
  const viaFolder = await sentHeaders(db, sendConfig({ id: 'r1' }, 'c1'));
  assert.equal(viaFolder.url, 'https://api.test/data?X-Key=APIKEY-SECRET');
});

test('backup carries the secrets inside the encrypted file and re-encrypts them on restore', async () => {
  const { db, invoke } = await setup();
  const folder = await invoke('api:collections:create', {
    name: 'F', auth_type: 'api-key', auth_config: JSON.stringify({ key: 'X-Key', value: 'APIKEY-SECRET' }),
  });
  await invoke('api:requests:create', {
    name: 'R', collection_id: folder.id, url: 'https://api.test', auth_type: 'bearer',
    auth_config: JSON.stringify({ token: 'TOKEN-SECRET' }),
  });
  const manager = new BackupManager(db);
  const exported = await manager.decryptVault(await manager.exportVault('backup-pw'), 'backup-pw');
  assert.equal(JSON.parse(exported.apiRequests![0]!.auth_config).token, 'TOKEN-SECRET');
  assert.equal(JSON.parse(exported.apiCollections![0]!.auth_config).value, 'APIKEY-SECRET');

  await db.deleteFrom('api_requests').execute();
  await manager.restoreVault(exported);
  const rows = JSON.stringify([
    await db.selectFrom('api_collections').selectAll().execute(),
    await db.selectFrom('api_requests').selectAll().execute(),
  ]);
  assert.doesNotMatch(rows, SECRETS);
  const request = await db.selectFrom('api_requests').selectAll().executeTakeFirstOrThrow();
  const sent = await sentHeaders(db, { ...sendConfig(request, folder.id), authType: 'bearer', authConfig: '{}' });
  assert.equal(sent.headers.Authorization, 'Bearer TOKEN-SECRET');
});

test('import encrypts literal secrets; the OwnShell export writes placeholders for stored ones', async () => {
  const db = createTestDb();
  await insertImportTree(db, {
    name: 'Imported', description: null, auth_type: 'bearer', auth_config: '{"token":"TOKEN-SECRET"}',
    variables: [], folders: [], requests: [],
  }, encrypt);
  const collections = await db.selectFrom('api_collections').selectAll().execute();
  assert.deepEqual(JSON.parse(collections[0]!.auth_config), { tokenEncrypted: 'enc(TOKEN-SECRET)' });
  const document = buildOwnShellApiDocument(collections[0]!.id, collections, []);
  assert.doesNotMatch(JSON.stringify(document), /TOKEN-SECRET|Encrypted/);
  assert.match(JSON.stringify(document), /\{\{bearerToken\}\}/);
});

test('recovery-key reset drops the encrypted auth secrets and keeps the rest', async () => {
  const { db, invoke, recoveryKey } = await setup();
  const request = await invoke('api:requests:create', {
    name: 'R', url: 'https://api.test', auth_type: 'basic',
    auth_config: JSON.stringify({ username: 'user', password: 'PASSWORD-SECRET', token: '{{TOKEN}}' }),
  });
  cryptoManager.lock();
  assert.equal((await cryptoManager.resetWithRecoveryKey(recoveryKey, 'new-master')).success, true);
  const row = await db.selectFrom('api_requests').select('auth_config').where('id', '=', request.id).executeTakeFirstOrThrow();
  assert.deepEqual(JSON.parse(row.auth_config), { username: 'user', token: '{{TOKEN}}' });
});
