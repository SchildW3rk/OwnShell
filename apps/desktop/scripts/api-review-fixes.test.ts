import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@ownshell/core';
import { toCurlCommand } from '../electron/http/curl-export';
import { decideRedirect, sendPreparedRequest } from '../electron/http/http-client';
import {
  ApiRequestError,
  prepareRequest,
  prepareRequestWithPlaceholders,
  type RequestInput,
} from '../electron/http/prepare-request';
import { saveSortOrders } from '../electron/ipc/api-client/requests';
import { reorderSchema } from '../electron/ipc/api-client/schemas';
import { parseCurl } from '../src/components/api-client/curl-import';
import { createSendFlow } from '../src/components/api-client/send-flow';
import { getShortcutAction } from '../src/components/api-client/shortcuts';

const base: RequestInput = {
  method: 'GET',
  url: 'https://api.example.com/v1/items',
  params: '[]',
  headers: '[]',
  body: '',
  bodyType: 'none',
  authType: 'none',
  authConfig: '{}',
};
const noFiles = { variables: {}, loadFile: async () => assert.fail('no files') };
const kv = (pairs: Record<string, string>) =>
  JSON.stringify(Object.entries(pairs).map(([key, value]) => ({ key, value, enabled: true })));
const follow = { followRedirects: true, viaSshHost: false, redirectCount: 0 };
const isCode = (code: string) => (error: unknown) => error instanceof ApiRequestError && error.code === code;

test('redirect: API-key header is not forwarded to another origin, on every hop', async () => {
  const prepared = await prepareRequest(
    { ...base, authType: 'api-key', authConfig: JSON.stringify({ key: 'X-Api-Key', value: 'secret' }) },
    noFiles
  );
  assert.equal(prepared.headers['X-Api-Key'], 'secret');

  const same = decideRedirect(prepared, { status: 302, location: '/next' }, follow);
  assert.ok(same.follow);
  assert.equal(same.request.headers['X-Api-Key'], 'secret');

  // Second hop leaves the origin; the case of the header name does not matter.
  const away = decideRedirect(
    { ...same.request, headers: { 'x-api-key': 'secret', Accept: '*/*' } },
    { status: 302, location: 'https://other-host.example/' },
    follow
  );
  assert.ok(away.follow);
  assert.deepEqual(away.request.headers, { Accept: '*/*' });
});

test('redirect: API-key query param is dropped, also when the server echoes it', async () => {
  const prepared = await prepareRequest(
    {
      ...base,
      params: kv({ page: '2' }),
      authType: 'api-key',
      authConfig: JSON.stringify({ key: 'api_key', value: 'secret', addTo: 'query' }),
    },
    noFiles
  );
  assert.equal(prepared.url.search, '?page=2&api_key=secret');

  const echoed = decideRedirect(
    prepared,
    { status: 307, location: 'https://other-host.example/x?api_key=secret&page=2' },
    follow
  );
  assert.ok(echoed.follow);
  assert.equal(echoed.request.url.href, 'https://other-host.example/x?page=2');

  // Kept on the same origin; a later cross-origin hop still strips it.
  const same = decideRedirect(prepared, { status: 302, location: '/y?api_key=secret' }, follow);
  assert.ok(same.follow);
  assert.equal(same.request.url.search, '?api_key=secret');
  const later = decideRedirect(same.request, { status: 302, location: 'https://c.example/?api_key=secret' }, follow);
  assert.ok(later.follow);
  assert.equal(later.request.url.search, '');
});

test('curl export with placeholders: auth secrets and credential headers are not in the command', async () => {
  const cases: Array<[Partial<RequestInput>, string]> = [
    [{ authType: 'bearer', authConfig: JSON.stringify({ token: 'tok-123' }) }, 'Bearer {{bearerToken}}'],
    [{ authType: 'basic', authConfig: JSON.stringify({ username: 'u', password: 'pw-123' }) }, "-u 'u:{{basicPassword}}'"],
    [{ authType: 'api-key', authConfig: JSON.stringify({ key: 'X-Api-Key', value: 'key-123' }) }, "'X-Api-Key: {{apiKey}}'"],
    [{ authType: 'api-key', authConfig: JSON.stringify({ key: 'k', value: 'key-123', addTo: 'query' }) }, 'k={{apiKey}}'],
    [{ headers: kv({ Authorization: 'Bearer tok-123', Cookie: 'sid=tok-123', 'X-Auth-Token': 'tok-123' }) }, '{{Cookie}}'],
  ];
  // A secret that happens to equal an auth scheme word is still a secret.
  for (const secret of ['token', 'bearer', 'basic']) {
    const command = toCurlCommand(
      await prepareRequestWithPlaceholders(
        { ...base, authType: 'basic', authConfig: JSON.stringify({ username: 'u', password: secret }) },
        {}
      )
    );
    assert.ok(command.includes("-u 'u:{{basicPassword}}'"), command);
  }
  for (const [input, expected] of cases) {
    const command = toCurlCommand(await prepareRequestWithPlaceholders({ ...base, ...input }, {}));
    assert.doesNotMatch(command, /-123/, command);
    assert.ok(command.includes(expected), command);
  }

  // Inherited auth is redacted the same way.
  const inherited = toCurlCommand(
    await prepareRequestWithPlaceholders(
      { ...base, authType: 'inherit' },
      { authChain: [{ auth_type: 'bearer', auth_config: JSON.stringify({ token: 'tok-123' }) }] }
    )
  );
  assert.match(inherited, /Bearer \{\{bearerToken\}\}/);

  // Values that only reference variables stay as written; ordinary headers are untouched.
  const kept = toCurlCommand(
    await prepareRequestWithPlaceholders(
      {
        ...base,
        headers: kv({ Authorization: 'Bearer {{TOKEN}}', Accept: 'text/plain' }),
        authType: 'api-key',
        authConfig: JSON.stringify({ key: 'X-Api-Key', value: '{{KEY}}' }),
      },
      {}
    )
  );
  assert.ok(kept.includes("'Authorization: Bearer {{TOKEN}}'"), kept);
  assert.ok(kept.includes("'X-Api-Key: {{KEY}}'"), kept);
  assert.ok(kept.includes("'Accept: text/plain'"), kept);
});

test('curl export with placeholders: URL user info, query and param credentials are redacted', async () => {
  const command = toCurlCommand(
    await prepareRequestWithPlaceholders(
      { ...base, url: 'https://u:SECRET@host.test/?token=SECRET&q=1', params: kv({ api_key: 'SECRET' }) },
      {}
    )
  );
  assert.doesNotMatch(command, /SECRET/, command);
  assert.match(command, /q=1/);
});

test('curl export: deadline and redirect limit match a send', async () => {
  const command = toCurlCommand(await prepareRequestWithPlaceholders(base, {}));
  assert.match(command, /-L \\\n {2}--max-redirs 10 \\\n {2}--max-time 30$/);
  const noFollow = toCurlCommand(await prepareRequestWithPlaceholders(base, {}), { followRedirects: false, timeoutSeconds: 5 });
  assert.doesNotMatch(noFollow, /-L|--max-redirs/);
  assert.match(noFollow, /--max-time 5$/);
});

test('curl export: a POSIX shell passes every argument literally', async () => {
  const nasty = `it's "quoted" $HOME \`id\` !x \\ end\nsecond line`;
  const prepared = await prepareRequest(
    {
      ...base,
      method: 'POST',
      params: kv({ q: nasty }),
      headers: kv({ 'X-Note': `a'b"c$d\`e!f\\g` }),
      bodyType: 'raw',
      body: nasty,
    },
    noFiles
  );
  const command = toCurlCommand({ ...prepared, url: prepared.url.href });
  // Same words, printed by the shell instead of passed to curl.
  const printed = execFileSync('/bin/sh', ['-c', command.replace(/^curl/, `printf '%s\\0'`)], { encoding: 'utf8' });
  const argv = printed.split('\0').slice(0, -1);
  assert.deepEqual(argv.slice(argv.indexOf('-H'), argv.indexOf('-H') + 2), ['-H', `X-Note: a'b"c$d\`e!f\\g`]);
  assert.equal(argv[argv.indexOf('--data-raw') + 1], nasty);
  assert.equal(argv[argv.indexOf('-X') + 2], prepared.url.href);
});

test('curl import: --json', () => {
  const r = parseCurl(`curl https://h/items --json '{"a":' --json '1}'`);
  assert.equal(r.method, 'POST');
  assert.equal(r.bodyType, 'json');
  assert.equal(r.body, '{"a":1}');
  assert.deepEqual(JSON.parse(r.headers), [{ key: 'Accept', value: 'application/json', enabled: true }]);

  const own = parseCurl(`curl https://h --json '{}' -H 'Accept: text/plain'`);
  assert.deepEqual(JSON.parse(own.headers), [{ key: 'Accept', value: 'text/plain', enabled: true }]);

  const file = parseCurl(`curl https://h --json @/tmp/payload.json`);
  assert.equal(file.bodyType, 'binary');
  assert.deepEqual(JSON.parse(file.body), { path: '/tmp/payload.json', name: 'payload.json' });
  assert.deepEqual(file.files, ['/tmp/payload.json']);
  assert.deepEqual(JSON.parse(file.headers).map((h: { key: string }) => h.key), ['Content-Type', 'Accept']);
});

test('send flow: cancel during a slow save means nothing is sent', async () => {
  const flow = createSendFlow();
  let finishSave = () => {};
  let executed = 0;
  const running = flow.run(
    'e1',
    () => new Promise<string>((resolve) => (finishSave = () => resolve('body'))),
    async () => ++executed
  );
  flow.cancel('e1');
  finishSave();
  assert.equal(await running, null);
  assert.equal(executed, 0);

  // The id is forgotten afterwards; other executions are unaffected.
  assert.deepEqual(await flow.run('e1', async () => 'b', async (saved) => saved), { saved: 'b', result: 'b' });
  flow.cancel('other');
  assert.deepEqual(await flow.run('e2', async () => 1, async () => 2), { saved: 1, result: 2 });
});

test('shortcuts: open menus and dialogs get the key first', () => {
  const key = (k: string, mod = false) => ({ key: k, metaKey: mod, ctrlKey: false, shiftKey: false, altKey: false });
  const idle = { loading: false, overlayOpen: false };
  assert.equal(getShortcutAction(key('Enter', true), idle), 'send');
  assert.equal(getShortcutAction(key('s', true), idle), 'save');
  assert.equal(getShortcutAction(key('Escape'), idle), null);
  assert.equal(getShortcutAction(key('Escape'), { loading: true, overlayOpen: false }), 'cancel');
  assert.equal(getShortcutAction(key('Escape'), { loading: true, overlayOpen: true }), null);
  assert.equal(getShortcutAction(key('Enter', true), { loading: false, overlayOpen: true }), null);
});

test('reorder: all positions in one transaction, bounded payload', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE api_collections (id TEXT PRIMARY KEY, parent_id TEXT, sort_order INTEGER);
    CREATE TABLE api_requests (id TEXT PRIMARY KEY, collection_id TEXT, sort_order INTEGER);
    INSERT INTO api_collections VALUES ('c1', NULL, 0), ('c2', NULL, 1), ('c3', 'c1', 0);
    INSERT INTO api_requests VALUES ('r1', NULL, 0), ('bad', NULL, 1), ('r2', 'c1', 0);
    CREATE TRIGGER fail BEFORE UPDATE ON api_requests WHEN NEW.id = 'bad' BEGIN SELECT RAISE(ABORT, 'boom'); END;
  `);
  const db = new Kysely<Database>({
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
  const orders = () =>
    sqlite
      .prepare("SELECT id, sort_order FROM api_collections WHERE id IN ('c1','c2') UNION ALL SELECT id, sort_order FROM api_requests WHERE id IN ('r1','bad')")
      .all()
      .map((row) => ({ ...row }));
  const before = orders();

  await assert.rejects(
    saveSortOrders(db, {
      collections: [{ id: 'c1', sort_order: 1 }, { id: 'c2', sort_order: 0 }],
      requests: [{ id: 'r1', sort_order: 1 }, { id: 'bad', sort_order: 0 }],
    })
  );
  assert.deepEqual(orders(), before);

  // Siblings only: unknown ids or items of another folder abort the whole reorder.
  await assert.rejects(saveSortOrders(db, { collections: [{ id: 'nope', sort_order: 0 }], requests: [] }));
  await assert.rejects(
    saveSortOrders(db, { collections: [{ id: 'c1', sort_order: 1 }], requests: [{ id: 'r2', sort_order: 0 }] })
  );
  assert.deepEqual(orders(), before);

  await saveSortOrders(db, { collections: [{ id: 'c1', sort_order: 1 }, { id: 'c2', sort_order: 0 }], requests: [] });
  assert.deepEqual(orders().slice(0, 2), [{ id: 'c1', sort_order: 1 }, { id: 'c2', sort_order: 0 }]);
  await db.destroy();

  const many = Array.from({ length: 5001 }, (_, i) => ({ id: `id-${i}`, sort_order: i }));
  assert.equal(reorderSchema.safeParse({ collections: many, requests: [] }).success, false);
  const half = many.slice(0, 2600);
  assert.equal(reorderSchema.safeParse({ collections: half, requests: half }).success, false, 'total cap');
  assert.equal(reorderSchema.safeParse({ collections: [{ id: 'x', sort_order: -1 }], requests: [] }).success, false);
});

// ---- TLS verification off on the direct route ----

/** Minimal self-signed X.509 (P-256) built at test time, so no key file is checked in. */
function selfSignedCert(): { key: string; cert: string } {
  const der = (tag: number, ...parts: Buffer[]) => {
    const body = Buffer.concat(parts);
    const len = body.length < 128 ? Buffer.from([body.length]) : body.length < 256 ? Buffer.from([0x81, body.length]) : Buffer.from([0x82, body.length >> 8, body.length & 0xff]);
    return Buffer.concat([Buffer.from([tag]), len, body]);
  };
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const ecdsaSha256 = der(0x30, der(0x06, Buffer.from('2a8648ce3d040302', 'hex')));
  const name = der(0x30, der(0x31, der(0x30, der(0x06, Buffer.from('550403', 'hex')), der(0x0c, Buffer.from('localhost')))));
  const validity = der(0x30, der(0x17, Buffer.from('250101000000Z')), der(0x17, Buffer.from('491231235959Z')));
  const tbs = der(0x30, der(0x02, Buffer.from([1])), ecdsaSha256, name, validity, name, publicKey.export({ type: 'spki', format: 'der' }));
  const certificate = der(0x30, tbs, ecdsaSha256, der(0x03, Buffer.from([0]), sign('sha256', tbs, privateKey)));
  const pem = certificate.toString('base64').replace(/.{1,64}/g, '$&\n');
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    cert: `-----BEGIN CERTIFICATE-----\n${pem}-----END CERTIFICATE-----\n`,
  };
}

test('TLS off (direct): reaches a self-signed server, honors timeout and cancel, does not leak', async () => {
  const server = https.createServer(selfSignedCert(), (req, res) => {
    if (req.url === '/slow') return; // never answers
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = (path: string) => new URL(`https://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
  const request = (path: string) => ({ method: 'GET' as const, url: url(path), headers: {} });
  const openHostStream = async () => assert.fail('direct route');
  try {
    const ok = await sendPreparedRequest(request('/'), null, { openHostStream, verifyTls: false });
    assert.equal(ok.status, 200);
    assert.equal(ok.body, 'ok');

    await assert.rejects(
      sendPreparedRequest(request('/slow'), null, { openHostStream, verifyTls: false, timeoutMs: 100 }),
      isCode('TIMEOUT')
    );

    const controller = new AbortController();
    const running = sendPreparedRequest(request('/slow'), null, { openHostStream, verifyTls: false, signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(running, isCode('CANCELLED'));

    // The next default request verifies again: both through fetch and through Node's global agent.
    await assert.rejects(sendPreparedRequest(request('/'), null, { openHostStream }), (error: unknown) => !isCode('TIMEOUT')(error));
    await assert.rejects(
      new Promise((resolve, reject) => https.get(url('/'), resolve).on('error', reject)),
      /self[- ]signed|unable to verify|certificate/i
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
  // Plain http is unaffected by the flag (nothing to verify).
  const plain = http.createServer((_req, res) => res.end('plain'));
  await new Promise<void>((resolve) => plain.listen(0, '127.0.0.1', resolve));
  try {
    const port = (plain.address() as AddressInfo).port;
    const res = await sendPreparedRequest({ method: 'GET', url: new URL(`http://127.0.0.1:${port}/`), headers: {} }, null, {
      openHostStream,
      verifyTls: false,
    });
    assert.equal(res.body, 'plain');
  } finally {
    plain.close();
  }
});
