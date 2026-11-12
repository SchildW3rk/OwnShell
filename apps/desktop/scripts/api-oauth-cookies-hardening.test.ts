import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@ownshell/core';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';
import { candidateDomains, cookieHeaderFor, parseSetCookie } from '../electron/http/cookie-jar';
import {
  assertSecureOAuthUrls,
  authorizationCodeFlow,
  obtainAccessToken,
  requestToken,
  startLoopbackServer,
  tokenFingerprint,
  type CachedToken,
  type ResolvedOAuth,
  type TokenStore,
} from '../electron/http/oauth';
import { ApiRequestError } from '../electron/http/prepare-request';
import type { HttpRequestConfig } from '../electron/http/types';
import { createCookieJar, MAX_COOKIES, MAX_COOKIES_PER_DOMAIN } from '../electron/ipc/api-client/cookies';
import { exportCurl } from '../electron/ipc/api-client/request-context';
import { createTokenStore, oauthTokenProvider } from '../electron/ipc/api-client/oauth';
import { cryptoManager } from '../electron/security/crypto';

function openSqlite(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  const initSource = readFileSync(path.join(__dirname, '../electron/db/init.ts'), 'utf8');
  const inline = /function getInlineMigration\(\): string \{\s*return `([\s\S]*?)`;/.exec(initSource);
  assert.ok(inline, 'inline migration not found in init.ts');
  sqlite.exec(inline[1].replace(/\$\{Date\.now\(\)\}/g, String(Date.now())));
  sqlite.exec('PRAGMA foreign_keys = ON');
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

async function unlockedDb(): Promise<Kysely<Database>> {
  const sqlite = openSqlite();
  runIncrementalMigrations(sqlite as never);
  const db = kysely(sqlite);
  cryptoManager.init(db);
  await cryptoManager.initialize('master-password');
  return db;
}

function oauthConfig(overrides: Partial<ResolvedOAuth> = {}): ResolvedOAuth {
  return {
    grantType: 'client_credentials',
    tokenUrl: 'https://idp.test/token',
    authUrl: '',
    clientId: 'cid',
    clientSecret: 'secret',
    scopes: '',
    audience: '',
    clientAuth: 'basic',
    ...overrides,
  };
}

function memoryStore(initial: Record<string, CachedToken> = {}): TokenStore & { data: Record<string, CachedToken> } {
  const data = { ...initial };
  return { data, get: async (key) => data[key], save: async (key, token) => void (data[key] = token) };
}

const isCode = (code: string) => (error: unknown) => error instanceof ApiRequestError && error.code === code;

/** A token endpoint that answers only when `release` is called; records each call's signal. */
function gatedFetch() {
  const calls: Array<{ body: URLSearchParams; signal: AbortSignal }> = [];
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const fetchImpl = (async (_url: URL, init: RequestInit) => {
    const signal = init.signal as AbortSignal;
    calls.push({ body: new URLSearchParams(String(init.body)), signal });
    await new Promise<void>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      void gate.then(resolve);
    });
    return new Response(JSON.stringify({ access_token: `tok-${calls.length}`, expires_in: 3600 }));
  }) as unknown as typeof fetch;
  return { calls, fetchImpl, release: () => open() };
}

// ---------------------------------------------------------------------------
// #1 curl export never carries a cached OAuth token
// ---------------------------------------------------------------------------

test('curl export: OAuth stays {{oauthAccessToken}} in resolved mode, even with a cached token', async () => {
  const db = await unlockedDb();
  const now = Date.now();
  await db
    .insertInto('api_requests')
    .values({
      id: 'r1',
      name: 'R',
      url: 'https://api.test/x',
      auth_type: 'oauth2',
      auth_config: JSON.stringify({ tokenUrl: 'https://idp.test/token', clientId: 'cid' }),
      created_at: now,
      updated_at: now,
    })
    .execute();
  const config: HttpRequestConfig = {
    method: 'GET',
    url: 'https://api.test/x',
    params: '[]',
    headers: '[]',
    body: '',
    bodyType: 'none',
    authType: 'oauth2',
    authConfig: JSON.stringify({ tokenUrl: 'https://idp.test/token', clientId: 'cid' }),
    collectionId: null,
    requestId: 'r1',
    networkHostId: null,
    environmentId: null,
  };
  const resolved = oauthConfig({ clientSecret: '' });
  // A cached token for the current config and one for an older config.
  await createTokenStore(db).save('request:r1', {
    fingerprint: tokenFingerprint(resolved),
    accessToken: 'CACHED-ACCESS-TOKEN',
    refreshToken: null,
    expiresAt: null,
  });
  for (const resolveVariables of [true, false]) {
    const command = await exportCurl(db, config, resolveVariables);
    assert.match(command, /Bearer \{\{oauthAccessToken\}\}/);
    assert.doesNotMatch(command, /CACHED-ACCESS-TOKEN/);
  }
});

// ---------------------------------------------------------------------------
// #2 public suffixes
// ---------------------------------------------------------------------------

test('cookies: Domain=<public suffix> is refused, a registrable domain under it works', () => {
  const now = Date.now();
  const evil = new URL('https://evil.co.uk/');
  assert.equal(parseSetCookie('sid=x; Domain=co.uk', evil, now), null);
  assert.equal(parseSetCookie('sid=x; Domain=.co.uk', evil, now), null);
  // Full Public Suffix List, not a short list: co.at, wildcard rules (*.ck) and private suffixes.
  assert.equal(parseSetCookie('sid=x; Domain=co.at', new URL('https://evil.co.at/'), now), null);
  assert.equal(parseSetCookie('sid=x; Domain=foo.ck', new URL('https://evil.foo.ck/'), now), null);
  assert.equal(parseSetCookie('sid=x; Domain=pages.dev', new URL('https://evil.pages.dev/'), now), null);
  assert.equal(parseSetCookie('sid=x; Domain=bank.co.at', new URL('https://www.bank.co.at/'), now)!.domain, 'bank.co.at');
  assert.equal(parseSetCookie('sid=x; Domain=github.io', new URL('https://me.github.io/'), now), null);
  assert.equal(parseSetCookie('sid=x; Domain=uk', evil, now), null);

  const legit = parseSetCookie('sid=ok; Domain=example.co.uk; Path=/', new URL('https://www.example.co.uk/'), now)!;
  assert.equal(legit.domain, 'example.co.uk');
  assert.equal(legit.hostOnly, false);
  assert.equal(cookieHeaderFor([legit], new URL('https://api.example.co.uk/'), now), 'sid=ok');
  assert.equal(cookieHeaderFor([legit], new URL('https://bank.co.uk/'), now), undefined);

  // A host that is itself a listed suffix may set Domain=itself; it stays host-only.
  const self = parseSetCookie('a=1; Domain=co.uk', new URL('https://co.uk/'), now)!;
  assert.deepEqual({ domain: self.domain, hostOnly: self.hostOnly }, { domain: 'co.uk', hostOnly: true });
});

// ---------------------------------------------------------------------------
// #3 https for token and authorization endpoints
// ---------------------------------------------------------------------------

test('OAuth: plain http token/auth URLs are refused for remote hosts, allowed on loopback', async () => {
  let fetched = 0;
  const ok = (async () => {
    fetched++;
    return new Response(JSON.stringify({ access_token: 't' }));
  }) as unknown as typeof fetch;

  await assert.rejects(
    requestToken(oauthConfig({ tokenUrl: 'http://idp.example.com/token' }), {}, ok),
    (error: unknown) => isCode('OAUTH_INSECURE_URL')(error) && (error as ApiRequestError).detail === 'tokenUrl'
  );
  assert.equal(fetched, 0, 'the secret never went out');
  for (const tokenUrl of [
    'https://idp.example.com/token',
    'http://localhost:8080/token',
    'http://127.0.0.1/token',
    'http://127.1.2.3/token',
    'http://[::1]:9000/token',
  ]) {
    await requestToken(oauthConfig({ tokenUrl }), {}, ok);
  }
  assert.equal(fetched, 5);
  await assert.rejects(
    requestToken(oauthConfig({ tokenUrl: 'http://localhost.evil.com/token' }), {}, ok),
    isCode('OAUTH_INSECURE_URL')
  );

  let opened = false;
  await assert.rejects(
    authorizationCodeFlow(
      oauthConfig({ grantType: 'authorization_code', authUrl: 'http://auth.example.com/authorize' }),
      async () => void (opened = true),
      ok,
      1000
    ),
    (error: unknown) => isCode('OAUTH_INSECURE_URL')(error) && (error as ApiRequestError).detail === 'authUrl'
  );
  assert.equal(opened, false, 'no browser opened');
});

// ---------------------------------------------------------------------------
// #4 cookie storage bounds
// ---------------------------------------------------------------------------

test('cookie jar: per-domain and total limits evict the oldest, expired purged on store, size limit', async () => {
  const db = await unlockedDb();
  let clock = 1_000_000;
  const jar = createCookieJar(db, () => clock);
  const url = new URL('https://www.example.test/');

  for (let i = 0; i < MAX_COOKIES_PER_DOMAIN + 5; i++) {
    clock++;
    await jar.store(url, [`c${i}=v; Max-Age=3600`]);
  }
  const names = (await db.selectFrom('api_cookies').select('name').execute()).map((row) => row.name);
  assert.equal(names.length, MAX_COOKIES_PER_DOMAIN);
  for (let i = 0; i < 5; i++) assert.ok(!names.includes(`c${i}`), `c${i} evicted`);
  assert.ok(names.includes(`c${MAX_COOKIES_PER_DOMAIN + 4}`));

  // Expired rows go on the next store, not only when the manager opens.
  clock += 3600_000;
  await jar.store(url, ['fresh=1']);
  assert.deepEqual((await db.selectFrom('api_cookies').select('name').execute()).map((row) => row.name), ['fresh']);

  // Total limit across domains.
  await db
    .insertInto('api_cookies')
    .values(
      Array.from({ length: MAX_COOKIES }, (_, i) => ({
        id: `bulk-${i}`,
        domain: `d${i % 100}.test`,
        path: '/',
        name: `n${i}`,
        value_encrypted: 'x',
        host_only: 1,
        secure: 0,
        expires_at: null,
        created_at: 1 + i,
      }))
    )
    .execute();
  clock++;
  await jar.store(url, ['newest=1']);
  const total = await db.selectFrom('api_cookies').select(['id', 'name']).execute();
  assert.equal(total.length, MAX_COOKIES);
  assert.ok(total.some((row) => row.name === 'newest'));
  assert.ok(!total.some((row) => row.id === 'bulk-0'), 'oldest evicted');

  // Name + value + attributes over 4096 bytes is ignored.
  assert.equal(parseSetCookie(`big=${'a'.repeat(4000)}; Path=/${'p'.repeat(100)}`, url, clock), null);
  assert.ok(parseSetCookie(`ok=${'a'.repeat(4000)}`, url, clock));
});

test('cookie jar: only rows whose domain can match the host are read', async () => {
  assert.deepEqual(candidateDomains(new URL('https://a.b.example.test/')), [
    'a.b.example.test',
    'b.example.test',
    'example.test',
    'test',
  ]);
  assert.deepEqual(candidateDomains(new URL('http://[::1]:8080/')), ['::1']);
  assert.deepEqual(candidateDomains(new URL('http://10.0.0.1/')), ['10.0.0.1']);

  const db = await unlockedDb();
  const jar = createCookieJar(db);
  await jar.store(new URL('https://www.example.test/'), ['mine=1; Domain=example.test']);
  // An undecryptable row elsewhere would throw if it were read; it is skipped by the query anyway.
  await db
    .insertInto('api_cookies')
    .values({ id: 'x', domain: 'other.test', path: '/', name: 'o', value_encrypted: 'garbage', host_only: 1, secure: 0, expires_at: null, created_at: 1 })
    .execute();
  assert.equal(await jar.header(new URL('https://api.example.test/')), 'mine=1');
  assert.equal(await jar.header(new URL('https://unrelated.test/')), undefined);
});

// ---------------------------------------------------------------------------
// #5 single-flight, #6 cancel
// ---------------------------------------------------------------------------

test('OAuth: parallel sends share one refresh with the same refresh token', async () => {
  const config = oauthConfig();
  const store = memoryStore({
    'request:r': { fingerprint: tokenFingerprint(config), accessToken: 'old', refreshToken: 'rt-1', expiresAt: 1 },
  });
  const endpoint = gatedFetch();
  const options = { store, ownerKey: 'request:r', fetch: endpoint.fetchImpl };
  const first = obtainAccessToken(config, options);
  const second = obtainAccessToken(config, options);
  await new Promise((resolve) => setImmediate(resolve));
  endpoint.release();
  assert.deepEqual(await Promise.all([first, second]), ['tok-1', 'tok-1']);
  assert.equal(endpoint.calls.length, 1);
  assert.equal(endpoint.calls[0].body.get('refresh_token'), 'rt-1');

  // Done flights are removed: a later forced-expiry send asks again.
  store.data['request:r'].expiresAt = 1;
  const again = obtainAccessToken(config, options);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(endpoint.calls.length, 2);
  assert.equal(await again, 'tok-2');
});

test('OAuth: cancel detaches one waiter; the shared request is aborted only when all cancelled', async () => {
  const config = oauthConfig();
  const endpoint = gatedFetch();
  const store = memoryStore();
  const a = new AbortController();
  const b = new AbortController();
  const first = obtainAccessToken(config, { store, ownerKey: 'request:c', fetch: endpoint.fetchImpl, signal: a.signal });
  const second = obtainAccessToken(config, { store, ownerKey: 'request:c', fetch: endpoint.fetchImpl, signal: b.signal });
  await new Promise((resolve) => setImmediate(resolve));
  a.abort();
  await assert.rejects(first, isCode('CANCELLED'));
  assert.equal(endpoint.calls[0].signal.aborted, false, 'shared fetch keeps going');
  endpoint.release();
  assert.equal(await second, 'tok-1');
  assert.equal(store.data['request:c'].accessToken, 'tok-1');

  // Everyone cancels: the token request itself is aborted.
  const solo = gatedFetch();
  const c = new AbortController();
  const only = obtainAccessToken(oauthConfig({ scopes: 'x' }), { store, ownerKey: 'request:c', fetch: solo.fetchImpl, signal: c.signal });
  await new Promise((resolve) => setImmediate(resolve));
  c.abort();
  await assert.rejects(only, isCode('CANCELLED'));
  assert.equal(solo.calls[0].signal.aborted, true);

  // Without an owner (no single-flight) the signal still reaches the fetch.
  const direct = gatedFetch();
  const d = new AbortController();
  const unowned = obtainAccessToken(config, { store, fetch: direct.fetchImpl, signal: d.signal });
  await new Promise((resolve) => setImmediate(resolve));
  d.abort();
  await assert.rejects(unowned, isCode('CANCELLED'));
  assert.equal(direct.calls[0].signal.aborted, true);

  // The IPC provider passes the send's signal through.
  const viaProvider = gatedFetch();
  const e = new AbortController();
  e.abort();
  const realFetch = globalThis.fetch;
  globalThis.fetch = viaProvider.fetchImpl;
  try {
    await assert.rejects(
      oauthTokenProvider(store, { type: 'request', id: 'p' }, { signal: e.signal })(oauthConfig({ scopes: 'p' }), undefined),
      isCode('CANCELLED')
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------------------------------------------------------------------------
// #8 state check
// ---------------------------------------------------------------------------

test('loopback: a state of a different length is rejected', async () => {
  const loopback = await startLoopbackServer('expected-state', 5000);
  const response = await fetch(`${loopback.redirectUri}?code=abc&state=x`);
  assert.equal(response.status, 400);
  await assert.rejects(loopback.code, (error: unknown) => error instanceof ApiRequestError && error.detail === 'state_mismatch');
});

// ---------------------------------------------------------------------------
// #7 migration 018 from a pre-018 database
// ---------------------------------------------------------------------------

/** The database as migrations 011–017 left it: the old auth_type CHECK, no cookie_jar. */
function pre018Sqlite(): DatabaseSync {
  const sqlite = openSqlite();
  const source = readFileSync(path.join(__dirname, '../electron/db/incremental-migrations.ts'), 'utf8');
  const ddl = (marker: string) => {
    const match = new RegExp(`Running migration ${marker}[^\\n]*\\n\\s*sqlite\\.exec\\(\`([\\s\\S]*?)\`\\);`).exec(source);
    assert.ok(match, `migration ${marker} DDL found`);
    return match[1];
  };
  sqlite.exec(ddl('011a'));
  sqlite.exec(ddl('011b'));
  sqlite.exec(`
    ALTER TABLE api_collections ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'inherit';
    ALTER TABLE api_collections ADD COLUMN auth_config TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE api_collections ADD COLUMN variables TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE api_requests ADD COLUMN raw_content_type TEXT NOT NULL DEFAULT 'text';
    ALTER TABLE api_requests ADD COLUMN timeout_seconds INTEGER;
    ALTER TABLE api_requests ADD COLUMN follow_redirects INTEGER;
    ALTER TABLE api_requests ADD COLUMN verify_tls INTEGER;
    ALTER TABLE api_requests ADD COLUMN variables TEXT NOT NULL DEFAULT '[]';
  `);
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
        last_executed_at, raw_content_type, timeout_seconds, follow_redirects, verify_tls, variables)
      VALUES ('r1', 'c1', 'Req', 'POST', 'https://api.test/{{A}}', '[{"key":"q"}]', '[{"key":"h"}]',
        '{"x":1}', 'json', 'api-key', '{"key":"k"}', 'h1', 'e1', 7, ${now}, ${now + 1}, ${now + 2},
        'xml', 12, 0, 1, '[{"key":"B","value":"2"}]');
    INSERT INTO api_requests (id, name, auth_type, created_at, updated_at) VALUES ('r2', 'Plain', 'inherit', ${now}, ${now});
  `);
  return sqlite;
}

const snapshot = (sqlite: DatabaseSync) =>
  sqlite.prepare('SELECT * FROM api_requests ORDER BY id').all().map((row) => {
    const copy = { ...(row as Record<string, unknown>) };
    delete copy.cookie_jar;
    return copy;
  });

test('migration 018: a populated pre-018 api_requests survives the rebuild, idempotent, rollback on failure', () => {
  const sqlite = pre018Sqlite();
  const before = snapshot(sqlite);
  const indexesBefore = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='api_requests' AND sql IS NOT NULL ORDER BY name")
    .all();
  assert.equal(before.length, 2);

  runIncrementalMigrations(sqlite as never);
  const schema = (sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='api_requests'").get() as { sql: string }).sql;
  assert.match(schema, /'oauth2'/);
  assert.deepEqual(snapshot(sqlite), before, 'every value survived');
  assert.equal((sqlite.prepare("SELECT cookie_jar FROM api_requests WHERE id='r1'").get() as { cookie_jar: unknown }).cookie_jar, null);
  assert.deepEqual(
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='api_requests' AND sql IS NOT NULL ORDER BY name")
      .all(),
    indexesBefore
  );
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal((sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
  // Foreign keys still act on the rebuilt table.
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
  sqlite.exec("INSERT INTO api_requests (id, name, auth_type, created_at, updated_at) VALUES ('r4', 'n', 'oauth2', 1, 1)");

  // Second run: nothing changes.
  const afterFirst = sqlite.prepare('SELECT * FROM api_requests ORDER BY id').all();
  runIncrementalMigrations(sqlite as never);
  assert.deepEqual(sqlite.prepare('SELECT * FROM api_requests ORDER BY id').all(), afterFirst);
  assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='api_requests_018'").get(), undefined);

  // A failure after DROP TABLE (a view the rename cannot resolve) rolls everything back.
  const failing = pre018Sqlite();
  const original = snapshot(failing);
  failing.exec('CREATE VIEW broken_view AS SELECT id FROM api_requests');
  failing.exec('CREATE TRIGGER broken_trigger AFTER INSERT ON api_collections BEGIN SELECT id FROM api_requests; END');
  runIncrementalMigrations(failing as never);
  const kept = (failing.prepare("SELECT sql FROM sqlite_master WHERE name='api_requests'").get() as { sql: string }).sql;
  assert.doesNotMatch(kept, /'oauth2'/, 'rebuild did not happen');
  assert.deepEqual(snapshot(failing), original, 'original rows intact');
  assert.equal(failing.prepare("SELECT name FROM sqlite_master WHERE name='api_requests_018'").get(), undefined);
  assert.equal((failing.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
  // The new tables and column are created even when the rebuild failed.
  for (const name of ['api_cookies', 'api_oauth_tokens']) {
    assert.ok(failing.prepare('SELECT name FROM sqlite_master WHERE name = ?').get(name), name);
  }
});

test('OAuth: http token/auth URLs for remote hosts are refused when saving', () => {
  const cfg = (tokenUrl: string, authUrl = '') => JSON.stringify({ grantType: 'client_credentials', tokenUrl, authUrl });
  const refused = (e: unknown) => e instanceof ApiRequestError && e.code === 'OAUTH_INSECURE_URL';
  assert.throws(() => assertSecureOAuthUrls('oauth2', cfg('http://idp.example.com/token')), refused);
  assert.throws(() => assertSecureOAuthUrls('oauth2', cfg('https://idp.example.com/token', 'http://idp.example.com/auth')), refused);
  for (const ok of ['https://idp.example.com/token', 'http://localhost:8080/token', 'http://127.0.0.1/token', '{{IDP}}/token', '']) {
    assert.doesNotThrow(() => assertSecureOAuthUrls('oauth2', cfg(ok)), ok);
  }
  assert.doesNotThrow(() => assertSecureOAuthUrls('bearer', cfg('http://idp.example.com/token')));
});
