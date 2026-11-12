import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { __testIpcMainHandlers } from 'electron';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@ownshell/core';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';
import { recordHistory } from '../electron/http/api-history';
import { redactParam, redactUrl } from '../electron/http/prepare-request';
import {
  buildStoredVariables,
  resolveVariableMap,
  toPublicVariables,
} from '../electron/http/api-variables';
import {
  ApiRequestError,
  prepareRequest,
  type PrepareContext,
  type RequestInput,
} from '../electron/http/prepare-request';
import { sendPreparedRequest } from '../electron/http/http-client';
import type { HttpRequestConfig, HttpResponse } from '../electron/http/types';
import { registerApiCollectionHandlers } from '../electron/ipc/api-client/collections';
import { loadCollectionChain, loadVariableScopes, saveHistory } from '../electron/ipc/api-client/request-context';
import { registerApiRequestHandlers } from '../electron/ipc/api-client/requests';
import { registerApiTransferHandlers } from '../electron/ipc/api-client/transfer';
import { cryptoManager } from '../electron/security/crypto';
import {
  applyVariableSuggestion,
  collectVariableSuggestions,
  filterVariableSuggestions,
  findVariableQuery,
} from '../src/components/api-client/variables/variable-suggestions';

function createTestDb(): Kysely<Database> {
  const sqlite = new DatabaseSync(':memory:');
  const initSource = readFileSync(path.join(__dirname, '../electron/db/init.ts'), 'utf8');
  const inline = /function getInlineMigration\(\): string \{\s*return `([\s\S]*?)`;/.exec(initSource);
  assert.ok(inline, 'inline migration not found in init.ts');
  sqlite.exec(inline[1].replace(/\$\{Date\.now\(\)\}/g, String(Date.now())));
  runIncrementalMigrations(sqlite as never);
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

const base: RequestInput = {
  method: 'GET',
  url: 'https://h.test/',
  params: '[]',
  headers: '[]',
  body: '',
  bodyType: 'none',
  authType: 'none',
  authConfig: '{}',
};
const noFiles: PrepareContext['loadFile'] = async () => assert.fail('no files expected');

test('scopes: request > folder > collection > environment > global', async () => {
  const scopes: PrepareContext['scopes'] = [
    { scope: 'request', variables: { A: 'request' } },
    { scope: 'folder', variables: { A: 'folder', B: 'folder' } },
    { scope: 'folder', variables: { B: 'outer-folder', C: 'outer-folder' } },
    { scope: 'collection', variables: { C: 'collection', D: 'collection' } },
    { scope: 'environment', variables: { D: 'environment', E: 'environment' } },
    { scope: 'global', variables: { E: 'global', F: 'global' } },
  ];
  const prepared = await prepareRequest(
    { ...base, url: 'https://h.test/{{A}}/{{B}}/{{C}}/{{D}}/{{E}}/{{F}}' },
    { scopes, loadFile: noFiles }
  );
  assert.equal(prepared.url.pathname, '/request/folder/outer-folder/collection/environment/global');
});

test('unknown variables fail before sending with the names and the searched scopes', async () => {
  await assert.rejects(
    prepareRequest(
      { ...base, url: 'https://h.test/{{X}}', headers: JSON.stringify([{ key: 'H', value: '{{$nope}}', enabled: true }]) },
      {
        scopes: [
          { scope: 'request', variables: {} },
          { scope: 'collection', variables: {} },
          { scope: 'global', variables: {} },
        ],
        loadFile: noFiles,
      }
    ),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === 'MISSING_VARIABLES' &&
      error.detail === 'X, $nope' &&
      JSON.stringify(error.scopes) === '["request","collection","global"]'
  );
});

test('dynamic values: $uuid per use, $timestamp in seconds, $isoTimestamp', async () => {
  let n = 0;
  const prepared = await prepareRequest(
    { ...base, url: 'https://h.test/{{$uuid}}/{{ $uuid }}?t={{$timestamp}}&iso={{$isoTimestamp}}' },
    {
      loadFile: noFiles,
      now: () => new Date('2026-01-02T03:04:05.678Z'),
      uuid: () => `id-${++n}`,
    }
  );
  assert.equal(prepared.url.pathname, '/id-1/id-2');
  assert.equal(prepared.url.searchParams.get('t'), String(Date.UTC(2026, 0, 2, 3, 4, 5) / 1000));
  assert.equal(prepared.url.searchParams.get('iso'), '2026-01-02T03:04:05.678Z');
  // A defined variable named like a built-in wins (same rule as any scope).
  const shadowed = await prepareRequest(
    { ...base, url: 'https://h.test/{{$uuid}}' },
    { variables: { $uuid: 'mine' }, loadFile: noFiles }
  );
  assert.equal(shadowed.url.pathname, '/mine');
});

test('stored variables: only secrets are encrypted, kept when unchanged and never public', () => {
  const encrypt = (value: string) => `enc(${value})`;
  const decrypt = (value: string) => value.replace(/^enc\((.*)\)$/, '$1');
  let ids = 0;
  const newId = () => `v${++ids}`;
  const first = buildStoredVariables(
    [
      { key: 'BASE', value: 'https://h', enabled: true, secret: false },
      { key: 'TOKEN', value: 't0p-s3cret', enabled: true, secret: true },
      { key: 'OFF', value: 'x', enabled: false, secret: false },
    ],
    '[]',
    encrypt,
    newId
  );
  assert.ok(!first.includes('"value":"t0p-s3cret"'));
  assert.ok(first.includes('enc(t0p-s3cret)'));
  // Unchanged secret (value omitted) keeps the stored value; renaming keeps it too (same id).
  const second = buildStoredVariables(
    [{ id: 'v2', key: 'API_TOKEN', enabled: true, secret: true }],
    first,
    encrypt,
    newId
  );
  assert.deepEqual(resolveVariableMap(second, decrypt), { variables: { API_TOKEN: 't0p-s3cret' }, locked: false });
  assert.deepEqual(resolveVariableMap(first, null).locked, true);
  assert.deepEqual(resolveVariableMap(first, null).variables, { BASE: 'https://h' });

  const publicJson = JSON.stringify(toPublicVariables(first));
  assert.ok(!publicJson.includes('s3cret') && !publicJson.includes('enc('));
  assert.deepEqual(
    toPublicVariables(first).map(({ key, secret, hasValue, value }) => ({ key, secret, hasValue, value })),
    [
      { key: 'BASE', secret: false, hasValue: true, value: 'https://h' },
      { key: 'TOKEN', secret: true, hasValue: true, value: '' },
      { key: 'OFF', secret: false, hasValue: true, value: 'x' },
    ]
  );
});

test('autocomplete: names with the winning scope, secrets without values, `{{` editing', () => {
  const suggestions = collectVariableSuggestions({
    request: [{ key: 'A', value: 'req', enabled: true }],
    chain: [
      { variables: JSON.stringify([{ key: 'A', value: 'folder' }, { key: 'TOKEN', value: '', secret: true }]) },
      { variables: JSON.stringify([{ key: 'ROOT', value: 'r' }]) },
    ],
    environmentVariables: JSON.stringify([{ key: 'ENV_KEY', value_encrypted: 'cipher' }]),
    globals: [{ key: 'G', value: 'g', enabled: true }, { key: 'OFF', value: 'o', enabled: false }],
  });
  const byName = Object.fromEntries(suggestions.map((s) => [s.name, s]));
  assert.deepEqual(byName.A, { name: 'A', scope: 'request', secret: false, value: 'req' });
  assert.deepEqual(byName.TOKEN, { name: 'TOKEN', scope: 'folder', secret: true });
  assert.equal(byName.ROOT.scope, 'collection');
  assert.deepEqual(byName.ENV_KEY, { name: 'ENV_KEY', scope: 'environment', secret: true });
  assert.equal(byName.G.scope, 'global');
  assert.equal(byName.OFF, undefined);
  assert.equal(byName.$uuid.scope, 'dynamic');
  assert.ok(!JSON.stringify(suggestions).includes('cipher'));

  assert.deepEqual(findVariableQuery('https://{{BA', 12), { start: 10, query: 'BA' });
  assert.equal(findVariableQuery('https://{{BASE}}/x', 18), null);
  assert.deepEqual(filterVariableSuggestions(suggestions, 'oo').map((s) => s.name), ['ROOT']);
  assert.deepEqual(applyVariableSuggestion('a {{BA b', 6, 4, 'BASE'), { text: 'a {{BASE}} b', caret: 10 });
  // An existing closing brace pair is reused, the caret moves past it.
  assert.deepEqual(applyVariableSuggestion('{{B}}/x', 3, 2, 'BASE'), { text: '{{BASE}}/x', caret: 8 });
});

test('redactUrl drops the user info and fragment and hides credential-like query values', () => {
  assert.equal(
    redactUrl('https://u:pw@h.test/p?token=abc&q=1&api_key={{apiKey}}&secret=&Access_Token=x&sig=s&key=k&monkey=1#frag'),
    'https://h.test/p?token={{token}}&q=1&api_key={{apiKey}}&secret={{secret}}&Access_Token={{Access_Token}}&sig={{sig}}&key={{key}}&monkey=1'
  );
  assert.equal(redactUrl('https://TOKEN123@h.test/x'), 'https://h.test/x');
  // Without a scheme the user info is still in the authority.
  assert.equal(redactUrl('user:SECRET@host/path'), 'host/path');
  assert.equal(redactUrl('//user:SECRET@[::1]/p'), '//[::1]/p');
  assert.equal(redactUrl('{{BASE}}/users/a@b.test'), '{{BASE}}/users/a@b.test');
  assert.equal(redactUrl('https://{{user}}:{{pw}}@h.test/x'), 'https://h.test/x');
  assert.equal(redactUrl('https://h.test/x?next=a@b'), 'https://h.test/x?next=a@b');
  assert.equal(redactUrl('{{BASE}}/x?page=2#top'), '{{BASE}}/x?page=2');
  assert.equal(redactParam('client_secret', 'abc'), '{{client_secret}}');
  assert.equal(redactParam('Password', '{{PW}}'), '{{PW}}');
  assert.equal(redactParam('page', '2'), '2');
});

test('history stores the redacted URL', async () => {
  const db = createTestDb();
  await recordHistory(db, {
    requestId: null,
    method: 'GET',
    templateUrl: 'https://u:pw@h.test/?token=secret#x',
    status: 200,
    durationMs: 1,
    responseSize: 1,
  });
  const rows = await db.selectFrom('api_request_history').select('url').execute();
  assert.deepEqual(rows.map((row) => row.url), ['https://h.test/?token={{token}}']);
});

test('history keeps only the newest entries', async () => {
  const db = createTestDb();
  for (let index = 0; index < 5; index += 1) {
    await recordHistory(
      db,
      { requestId: null, method: 'GET', templateUrl: `https://h.test/${index}`, status: 200, durationMs: 1, responseSize: 2 },
      3
    );
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  const rows = await db.selectFrom('api_request_history').select('url').orderBy('created_at', 'desc').execute();
  assert.deepEqual(rows.map((row) => row.url), ['https://h.test/4', 'https://h.test/3', 'https://h.test/2']);
});

test('send end to end: scoped variables resolve, secrets never reach history or the renderer', async () => {
  const db = createTestDb();
  cryptoManager.init(db);
  await cryptoManager.initialize('master-password');
  __testIpcMainHandlers.clear();
  // The execute handler pulls in the SSH stack (native modules); the same steps run below.
  registerApiCollectionHandlers(db);
  registerApiRequestHandlers(db);
  registerApiTransferHandlers(db);
  const mainFrame = { url: 'ownshell://app/index.html' };
  const event = { senderFrame: mainFrame, sender: { id: 1, mainFrame } };
  const invoke = (channel: string, payload?: unknown) => {
    const handler = __testIpcMainHandlers.get(channel);
    assert.ok(handler, `${channel} registered`);
    return handler(event, payload);
  };
  /** The execute handler's steps: scopes, preparation, send, history. */
  const execute = async (config: HttpRequestConfig): Promise<HttpResponse> => {
    const chain = await loadCollectionChain(db, config.collectionId);
    const { scopes, locked } = await loadVariableScopes(db, config, chain);
    let response: HttpResponse;
    try {
      const prepared = await prepareRequest(config, {
        scopes,
        variablesLocked: locked,
        authChain: chain,
        loadFile: noFiles,
      });
      response = await sendPreparedRequest(prepared, null, {
        openHostStream: async () => assert.fail('direct send'),
      });
    } catch (error) {
      assert.ok(error instanceof ApiRequestError);
      response = {
        status: 0, statusText: 'Error', headers: {}, body: '', time: 1, size: 0,
        errorCode: error.code, errorDetail: error.detail, errorScopes: error.scopes,
      };
    }
    await saveHistory(db, config, response);
    return response;
  };

  const received: Array<{ url?: string; headers: http.IncomingHttpHeaders }> = [];
  const server = http.createServer((req, res) => {
    received.push({ url: req.url, headers: req.headers });
    res.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const root = await invoke('api:collections:create', { name: 'Root' });
    const child = await invoke('api:collections:create', { name: 'Child', parent_id: root.id });
    await invoke('api:variables:set', {
      collectionId: root.id,
      variables: [
        { key: 'BASE', value: `http://127.0.0.1:${port}`, enabled: true, secret: false },
        { key: 'TOKEN', value: 'root-token-SECRET', enabled: true, secret: true },
      ],
    });
    await invoke('api:variables:set', {
      collectionId: child.id,
      variables: [{ key: 'TOKEN', value: 'child-token-SECRET', enabled: true, secret: true }],
    });
    await invoke('api:variables:set', {
      collectionId: null,
      variables: [
        { key: 'KEY', value: 'global-key-SECRET', enabled: true, secret: true },
        { key: 'PAGE', value: '7', enabled: true, secret: false },
      ],
    });
    const request = await invoke('api:requests:create', { name: 'R', collection_id: child.id });

    const response = await execute({
      method: 'GET',
      url: '{{BASE}}/items/{{ID}}?q=plain&password=literal-SECRET',
      params: JSON.stringify([{ key: 'page', value: '{{PAGE}}', enabled: true }]),
      headers: JSON.stringify([{ key: 'X-Token', value: '{{TOKEN}}', enabled: true }]),
      body: '',
      bodyType: 'none',
      authType: 'api-key',
      authConfig: JSON.stringify({ key: 'api_key', value: '{{KEY}}', addTo: 'query' }),
      collectionId: child.id,
      requestId: request.id,
      variables: JSON.stringify([{ key: 'ID', value: '42', enabled: true }]),
      networkHostId: null,
      environmentId: null,
    });
    assert.equal(response.status, 200, response.body);
    assert.equal(received[0].url, '/items/42?q=plain&password=literal-SECRET&page=7&api_key=global-key-SECRET');
    assert.equal(received[0].headers['x-token'], 'child-token-SECRET');

    // A missing variable is recorded too (status 0) and names the scopes.
    const failed = await execute({
      method: 'POST', url: '{{BASE}}/{{NOPE}}', params: '[]', headers: '[]', body: '', bodyType: 'none',
      authType: 'bearer', authConfig: JSON.stringify({ token: 'bearer-SECRET' }),
      collectionId: child.id, networkHostId: null, environmentId: null,
    });
    assert.equal(failed.errorCode, 'MISSING_VARIABLES');
    assert.deepEqual(failed.errorScopes, ['request', 'folder', 'collection', 'global']);

    const history = await invoke('api:history:list');
    assert.equal(history.length, 2);
    // Both sends may share a millisecond, so look them up by status instead of position.
    const sent = history.find((entry: { status: number }) => entry.status === 200);
    assert.equal(sent.request_id, request.id);
    assert.equal(sent.url, '{{BASE}}/items/{{ID}}?q=plain&password={{password}}&page={{PAGE}}&api_key={{KEY}}');
    assert.ok(history.some((entry: { status: number }) => entry.status === 0));

    // No resolved or literal secret anywhere in the history table, nor in what the renderer gets.
    const everything = JSON.stringify(await db.selectFrom('api_request_history').selectAll().execute());
    assert.ok(!/SECRET/.test(everything), everything);
    const forRenderer = JSON.stringify([
      await invoke('api:collections:get-all'),
      await invoke('api:variables:get-global'),
    ]);
    assert.ok(!/SECRET|value_encrypted/.test(forRenderer), forRenderer);
    // At rest only encrypted.
    const stored = JSON.stringify([
      await db.selectFrom('api_collections').select('variables').execute(),
      await db.selectFrom('app_settings').selectAll().execute(),
    ]);
    assert.ok(!/SECRET/.test(stored));

    await invoke('api:history:clear');
    assert.equal((await invoke('api:history:list')).length, 0);
  } finally {
    server.close();
  }
});
