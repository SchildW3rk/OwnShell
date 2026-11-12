import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { __testIpcMainHandlers } from 'electron';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@ownshell/core';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';
import { cookieHeaderFor, parseSetCookie, type JarCookie } from '../electron/http/cookie-jar';
import { sendPreparedRequest, type CookieJarAccess } from '../electron/http/http-client';
import {
  createPkce,
  obtainAccessToken,
  pkceChallenge,
  publicAuthConfig,
  requestToken,
  revealAuthSecrets,
  startLoopbackServer,
  storedAuthConfig,
  tokenFingerprint,
  type CachedToken,
  type ResolvedOAuth,
  type TokenStore,
} from '../electron/http/oauth';
import {
  ApiRequestError,
  prepareRequest,
  prepareRequestWithPlaceholders,
  type PreparedRequest,
  type RequestInput,
} from '../electron/http/prepare-request';
import type { HttpRequestConfig } from '../electron/http/types';
import { registerApiCollectionHandlers } from '../electron/ipc/api-client/collections';
import { createCookieJar } from '../electron/ipc/api-client/cookies';
import { createTokenStore, oauthTokenProvider, registerApiOAuthHandlers } from '../electron/ipc/api-client/oauth';
import {
  loadCollectionChain,
  loadVariableScopes,
  revealAuthSecret,
  saveHistory,
} from '../electron/ipc/api-client/request-context';
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

/** A fake token endpoint that records every request. */
async function tokenServer(
  respond: (body: URLSearchParams, req: http.IncomingMessage) => { status?: number; json: unknown }
) {
  const requests: Array<{ body: URLSearchParams; headers: http.IncomingHttpHeaders; url?: string }> = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = new URLSearchParams(raw);
      requests.push({ body, headers: req.headers, url: req.url });
      const { status = 200, json } = respond(body, req);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/token`;
  return { url, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

function oauthConfig(overrides: Partial<ResolvedOAuth> = {}): ResolvedOAuth {
  return {
    grantType: 'client_credentials',
    tokenUrl: 'http://127.0.0.1:1/token',
    authUrl: '',
    clientId: 'my client',
    clientSecret: 's3cr:et',
    scopes: 'read write',
    audience: '',
    clientAuth: 'basic',
    ...overrides,
  };
}

function memoryStore(initial: Record<string, CachedToken> = {}): TokenStore & { data: Record<string, CachedToken> } {
  const data = { ...initial };
  return { data, get: async (key) => data[key], save: async (key, token) => void (data[key] = token) };
}

const connectFails = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(true));
  });

// ---------------------------------------------------------------------------
// PKCE and loopback redirect
// ---------------------------------------------------------------------------

test('PKCE: S256 challenge matches RFC 7636 appendix B and verifiers are 43 url-safe chars', () => {
  assert.equal(
    pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  );
  const { verifier, challenge } = createPkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, pkceChallenge(verifier));
  assert.notEqual(createPkce().verifier, verifier);
});

test('loopback: binds 127.0.0.1 only, returns the code and closes after one request', async () => {
  const loopback = await startLoopbackServer('state-1', 5000);
  assert.match(loopback.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  const response = await fetch(`${loopback.redirectUri}?code=abc&state=state-1`);
  assert.equal(response.status, 200);
  assert.equal(await loopback.code, 'abc');
  assert.equal(await connectFails(loopback.port), true, 'closed after the first request');
});

test('loopback: a state mismatch is rejected and the server closes', async () => {
  const loopback = await startLoopbackServer('expected', 5000);
  const response = await fetch(`${loopback.redirectUri}?code=abc&state=forged`);
  assert.equal(response.status, 400);
  await assert.rejects(loopback.code, (error: unknown) =>
    error instanceof ApiRequestError && error.code === 'OAUTH_FAILED' && error.detail === 'state_mismatch'
  );
  assert.equal(await connectFails(loopback.port), true);
});

test('loopback: gives up and closes after the timeout', async () => {
  const loopback = await startLoopbackServer('s', 50);
  await assert.rejects(loopback.code, (error: unknown) => error instanceof ApiRequestError && error.detail === 'timeout');
  assert.equal(await connectFails(loopback.port), true);
});

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

test('client credentials: basic header method (form-encoded id/secret) and body method', async () => {
  const server = await tokenServer(() => ({ json: { access_token: 'tok', expires_in: 60 } }));
  try {
    await requestToken(oauthConfig({ tokenUrl: server.url, audience: 'api://x' }), {
      grant_type: 'client_credentials',
      scope: 'read write',
      audience: 'api://x',
    });
    const basic = server.requests[0];
    assert.equal(
      basic.headers.authorization,
      `Basic ${Buffer.from('my+client:s3cr%3Aet').toString('base64')}`
    );
    assert.equal(basic.headers['content-type'], 'application/x-www-form-urlencoded');
    assert.equal(basic.body.get('grant_type'), 'client_credentials');
    assert.equal(basic.body.get('scope'), 'read write');
    assert.equal(basic.body.get('audience'), 'api://x');
    assert.equal(basic.body.has('client_secret'), false);

    await requestToken(oauthConfig({ tokenUrl: server.url, clientAuth: 'body' }), { grant_type: 'client_credentials' });
    const body = server.requests[1];
    assert.equal(body.headers.authorization, undefined);
    assert.equal(body.body.get('client_id'), 'my client');
    assert.equal(body.body.get('client_secret'), 's3cr:et');

    // Public client: no secret, client_id in the body even with the basic method.
    await requestToken(oauthConfig({ tokenUrl: server.url, clientSecret: '' }), { grant_type: 'client_credentials' });
    assert.equal(server.requests[2].headers.authorization, undefined);
    assert.equal(server.requests[2].body.get('client_id'), 'my client');
  } finally {
    await server.close();
  }
});

test('token endpoint: errors expose only the error code; invalid JSON is refused', async () => {
  let reply: { status?: number; json: unknown } = {
    status: 400,
    json: { error: 'invalid_client', error_description: 'secret <script>' },
  };
  const server = await tokenServer(() => reply);
  try {
    await assert.rejects(requestToken(oauthConfig({ tokenUrl: server.url }), {}), (error: unknown) =>
      error instanceof ApiRequestError && error.code === 'OAUTH_FAILED' && error.detail === 'invalid_client'
    );
    reply = { json: { token_type: 'bearer' } };
    await assert.rejects(requestToken(oauthConfig({ tokenUrl: server.url }), {}), (error: unknown) =>
      error instanceof ApiRequestError && error.detail === 'invalid_response'
    );
  } finally {
    await server.close();
  }
});

test('cached token reused; expired token refreshed via refresh_token, old refresh token kept', async () => {
  const server = await tokenServer(() => ({ json: { access_token: 'fresh', expires_in: 3600 } }));
  try {
    const config = oauthConfig({ tokenUrl: server.url });
    const fingerprint = tokenFingerprint(config);
    const now = 1_000_000;
    const store = memoryStore({
      'request:r1': { fingerprint, accessToken: 'valid', refreshToken: null, expiresAt: now + 600_000 },
      'request:r2': { fingerprint, accessToken: 'old', refreshToken: 'rt-1', expiresAt: now - 1 },
    });
    assert.equal(await obtainAccessToken(config, { store, ownerKey: 'request:r1', now: () => now }), 'valid');
    assert.equal(server.requests.length, 0);

    assert.equal(await obtainAccessToken(config, { store, ownerKey: 'request:r2', now: () => now }), 'fresh');
    assert.equal(server.requests[0].body.get('grant_type'), 'refresh_token');
    assert.equal(server.requests[0].body.get('refresh_token'), 'rt-1');
    assert.deepEqual(store.data['request:r2'], {
      fingerprint,
      accessToken: 'fresh',
      refreshToken: 'rt-1',
      expiresAt: now + 3600_000,
    });

    // A changed config ignores the cached token.
    await obtainAccessToken({ ...config, scopes: 'admin' }, { store, ownerKey: 'request:r1', now: () => now });
    assert.equal(server.requests[1].body.get('grant_type'), 'client_credentials');
    assert.equal(server.requests[1].body.get('scope'), 'admin');
  } finally {
    await server.close();
  }
});

test('authorization code without a valid token never opens a browser on send', async () => {
  await assert.rejects(
    obtainAccessToken(oauthConfig({ grantType: 'authorization_code', authUrl: 'https://auth.test/authorize' }), {
      store: memoryStore(),
      ownerKey: 'request:x',
    }),
    (error: unknown) => error instanceof ApiRequestError && error.code === 'OAUTH_TOKEN_REQUIRED'
  );
});

test('authorization code flow: browser gets PKCE + state, the code is exchanged with the verifier', async () => {
  const server = await tokenServer(() => ({ json: { access_token: 'code-token', refresh_token: 'rt' } }));
  try {
    const store = memoryStore();
    const token = await obtainAccessToken(
      oauthConfig({ grantType: 'authorization_code', authUrl: 'https://auth.test/authorize', tokenUrl: server.url }),
      {
        store,
        ownerKey: 'collection:c1',
        force: true,
        openUrl: async (url) => {
          const auth = new URL(url);
          assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
          assert.equal(auth.searchParams.get('response_type'), 'code');
          assert.equal(auth.searchParams.get('scope'), 'read write');
          const redirect = auth.searchParams.get('redirect_uri')!;
          assert.match(redirect, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
          // The "browser" follows the redirect.
          setImmediate(() => void fetch(`${redirect}?code=c0de&state=${auth.searchParams.get('state')}`));
          (globalThis as { challenge?: string }).challenge = auth.searchParams.get('code_challenge')!;
        },
      }
    );
    assert.equal(token, 'code-token');
    const exchange = server.requests[0].body;
    assert.equal(exchange.get('grant_type'), 'authorization_code');
    assert.equal(exchange.get('code'), 'c0de');
    assert.equal(pkceChallenge(exchange.get('code_verifier')!), (globalThis as { challenge?: string }).challenge);
    assert.equal(store.data['collection:c1'].refreshToken, 'rt');
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// Preparation and stored config
// ---------------------------------------------------------------------------

const base: RequestInput = {
  method: 'GET',
  url: 'https://api.test/x',
  params: '[]',
  headers: '[]',
  body: '',
  bodyType: 'none',
  authType: 'oauth2',
  authConfig: JSON.stringify({ tokenUrl: '{{AUTH}}/token', clientId: 'id', clientSecret: '{{SECRET}}', headerPrefix: 'Token' }),
};
const noFiles = async () => assert.fail('no files expected');

test('prepare: OAuth fields resolve variables; export keeps {{oauthAccessToken}}; missing vars stop the token request', async () => {
  let seen: ResolvedOAuth | undefined;
  const prepared = await prepareRequest(base, {
    variables: { AUTH: 'https://idp.test', SECRET: 'shh' },
    loadFile: noFiles,
    oauthToken: async (config) => {
      seen = config;
      return 'abc';
    },
  });
  assert.equal(prepared.headers.Authorization, 'Token abc');
  assert.equal(seen?.tokenUrl, 'https://idp.test/token');
  assert.equal(seen?.clientSecret, 'shh');

  const exported = await prepareRequestWithPlaceholders(base, {});
  assert.equal(exported.headers.Authorization, 'Token {{oauthAccessToken}}');

  await assert.rejects(
    prepareRequest(base, {
      variables: {},
      loadFile: noFiles,
      oauthToken: async () => assert.fail('no token request with unresolved variables'),
    }),
    (error: unknown) => error instanceof ApiRequestError && error.code === 'MISSING_VARIABLES'
  );
});

test('stored config: secret encrypted, kept when omitted, cleared with "", never public', () => {
  const encrypt = (value: string) => `enc(${value})`;
  const decrypt = (value: string) => value.replace(/^enc\((.*)\)$/, '$1');
  const stored = storedAuthConfig('oauth2', JSON.stringify({ clientId: 'a', clientSecret: 'x' }), undefined, encrypt);
  assert.deepEqual(JSON.parse(stored), { clientId: 'a', clientSecretEncrypted: 'enc(x)' });
  const pub = publicAuthConfig('oauth2', stored);
  assert.deepEqual(JSON.parse(pub), { clientId: 'a', hasClientSecret: true });
  // The renderer saves its public config back: the secret is kept.
  const kept = storedAuthConfig('oauth2', pub, stored, encrypt);
  assert.equal(JSON.parse(kept).clientSecretEncrypted, 'enc(x)');
  assert.equal(JSON.parse(revealAuthSecrets(pub, kept, decrypt)).clientSecret, 'x');
  const cleared = storedAuthConfig('oauth2', JSON.stringify({ clientId: 'a', clientSecret: '' }), stored, encrypt);
  assert.equal(JSON.parse(cleared).clientSecretEncrypted, undefined);
  // Other auth types' secrets are encrypted too (see api-auth-secrets.test.ts).
  assert.deepEqual(JSON.parse(storedAuthConfig('bearer', '{"token":"t"}', undefined, encrypt)), { tokenEncrypted: 'enc(t)' });
});

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

test('cookies: domain, path, Secure and expiry rules', () => {
  const now = Date.UTC(2026, 0, 1);
  const url = new URL('https://www.example.test/app/page');
  const parse = (header: string, from = url) => parseSetCookie(header, from, now);

  const hostOnly = parse('a=1')!;
  assert.deepEqual(
    { domain: hostOnly.domain, path: hostOnly.path, hostOnly: hostOnly.hostOnly },
    { domain: 'www.example.test', path: '/app', hostOnly: true }
  );
  const wide = parse('b=2; Domain=.example.test; Path=/; Secure; Max-Age=60; Expires=Thu, 01 Jan 2099 00:00:00 GMT')!;
  assert.equal(wide.hostOnly, false);
  assert.equal(wide.expiresAt, now + 60_000, 'Max-Age wins over Expires');
  assert.equal(parse('c=3; Domain=other.test'), null, 'foreign domain refused');
  assert.equal(parse('c=3; Domain=test'), null, 'single-label domain refused');
  assert.equal(parse('s=1; Secure', new URL('http://www.example.test/')), null, 'Secure only from https');
  assert.equal(parse('novalue'), null);
  assert.equal(parse('gone=1; Max-Age=0')!.expiresAt, 0);

  const jar: JarCookie[] = [hostOnly, wide, { ...parse('old=1; Expires=Wed, 01 Jan 2020 00:00:00 GMT')! }];
  assert.equal(cookieHeaderFor(jar, new URL('https://www.example.test/app/x'), now), 'a=1; b=2');
  assert.equal(cookieHeaderFor(jar, new URL('https://www.example.test/application'), now), 'b=2', 'path boundary');
  assert.equal(cookieHeaderFor(jar, new URL('https://api.example.test/app/x'), now), 'b=2', 'host-only stays on its host');
  assert.equal(cookieHeaderFor(jar, new URL('http://www.example.test/app/x'), now), 'a=1', 'Secure needs https');
  assert.equal(cookieHeaderFor(jar, new URL('https://www.example.test/app/x'), now + 61_000), 'a=1', 'expired');
});

test('cookies across redirects: the jar is asked again per hop, the old Cookie header is not forwarded', async () => {
  const cookies: JarCookie[] = [];
  const jar: CookieJarAccess = {
    header: async (url) => cookieHeaderFor(cookies, url, Date.now()),
    store: async (url, headers) => {
      for (const header of headers) {
        const cookie = parseSetCookie(header, url, Date.now());
        if (cookie) cookies.push(cookie);
      }
    },
  };
  cookies.push(parseSetCookie('other=b', new URL('https://b.test/'), Date.now())!);
  const sent: Array<{ url: string; cookie: string | null }> = [];
  const fakeFetch = (async (input: URL, init: RequestInit) => {
    const headers = new Headers(init.headers);
    sent.push({ url: input.href, cookie: headers.get('cookie') });
    if (input.hostname === 'a.test' && input.pathname === '/login') {
      const response = new Response(null, { status: 302, headers: { Location: '/home' } });
      response.headers.append('Set-Cookie', 'session=one; Path=/');
      return response;
    }
    if (input.hostname === 'a.test') return new Response(null, { status: 302, headers: { Location: 'https://b.test/' } });
    return new Response('ok');
  }) as typeof fetch;

  const prepared: PreparedRequest = {
    method: 'GET',
    url: new URL('https://a.test/login'),
    headers: { Cookie: 'manual=1' },
  };
  await sendPreparedRequest(prepared, null, {
    openHostStream: async () => assert.fail('direct'),
    fetch: fakeFetch,
    cookieJar: jar,
  });
  assert.deepEqual(sent, [
    { url: 'https://a.test/login', cookie: 'manual=1' },
    { url: 'https://a.test/home', cookie: 'manual=1; session=one' },
    { url: 'https://b.test/', cookie: 'other=b' },
  ]);
});

// ---------------------------------------------------------------------------
// End to end with the database
// ---------------------------------------------------------------------------

test('migration: api_requests accepts oauth2 after the CHECK rebuild and keeps its indexes', async () => {
  const db = createTestDb();
  const now = Date.now();
  await db
    .insertInto('api_requests')
    .values({ id: 'r', name: 'n', auth_type: 'oauth2', created_at: now, updated_at: now })
    .execute();
  const row = await db.selectFrom('api_requests').select(['auth_type', 'cookie_jar']).executeTakeFirstOrThrow();
  assert.deepEqual({ ...row }, { auth_type: 'oauth2', cookie_jar: null });
  await assert.rejects(
    db.insertInto('api_requests').values({ id: 'x', name: 'n', auth_type: 'bogus' as never, created_at: now, updated_at: now }).execute()
  );
  const indexes = await db
    .selectFrom('sqlite_master' as never)
    .select('name' as never)
    .where('tbl_name' as never, '=', 'api_requests' as never)
    .where('type' as never, '=', 'index' as never)
    .execute();
  assert.ok(indexes.length >= 6);
});

test('send end to end: secret and token stay in the main process, encrypted at rest, cookies encrypted', async () => {
  const db = createTestDb();
  cryptoManager.init(db);
  await cryptoManager.initialize('master-password');
  __testIpcMainHandlers.clear();
  registerApiCollectionHandlers(db);
  registerApiRequestHandlers(db);
  registerApiOAuthHandlers(db);
  const mainFrame = { url: 'ownshell://app/index.html' };
  const event = { senderFrame: mainFrame, sender: { id: 1, mainFrame } };
  const invoke = (channel: string, payload?: unknown) => {
    const handler = __testIpcMainHandlers.get(channel);
    assert.ok(handler, `${channel} registered`);
    return handler(event, payload);
  };

  const idp = await tokenServer(() => ({ json: { access_token: 'ACCESS-TOKEN-1', expires_in: 3600 } }));
  const received: http.IncomingHttpHeaders[] = [];
  const api = http.createServer((req, res) => {
    received.push(req.headers);
    res.setHeader('Set-Cookie', ['sid=SESSION-VALUE; Path=/; Max-Age=600']);
    res.end('ok');
  });
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  const apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}/data`;

  try {
    const folder = (await invoke('api:collections:create', {
      name: 'F',
      auth_type: 'oauth2',
      auth_config: JSON.stringify({ tokenUrl: idp.url, clientId: 'cid', clientSecret: 'CLIENT-SECRET' }),
    })) as { id: string; auth_config: string };
    assert.doesNotMatch(folder.auth_config, /CLIENT-SECRET|clientSecretEncrypted/);
    assert.equal(JSON.parse(folder.auth_config).hasClientSecret, true);
    const storedFolder = await db.selectFrom('api_collections').select('auth_config').executeTakeFirstOrThrow();
    assert.doesNotMatch(storedFolder.auth_config, /CLIENT-SECRET/);

    const request = (await invoke('api:requests:create', {
      name: 'R',
      collection_id: folder.id,
      url: apiUrl,
      auth_type: 'inherit',
    })) as { id: string };

    const config: HttpRequestConfig = {
      method: 'GET',
      url: apiUrl,
      params: '[]',
      headers: '[]',
      body: '',
      bodyType: 'none',
      authType: 'inherit',
      authConfig: '{}',
      collectionId: folder.id,
      requestId: request.id,
      networkHostId: null,
      environmentId: null,
    };
    const tokens = createTokenStore(db);
    // The execute handler's steps (it pulls in the SSH stack, so it is not registered here).
    const send = async () => {
      const owner = { type: 'request' as const, id: request.id };
      const revealed = await revealAuthSecret(db, config, await loadCollectionChain(db, config.collectionId), owner);
      const { scopes } = await loadVariableScopes(db, config, revealed.chain);
      const prepared = await prepareRequest(
        { ...config, authConfig: revealed.authConfig },
        { scopes, authChain: revealed.chain, oauthToken: oauthTokenProvider(tokens, owner), loadFile: noFiles }
      );
      const response = await sendPreparedRequest(prepared, null, {
        openHostStream: async () => assert.fail('direct'),
        cookieJar: createCookieJar(db),
      });
      await saveHistory(db, config, response);
      return response;
    };

    await send();
    await send();
    assert.equal(idp.requests.length, 1, 'token cached for the folder');
    assert.equal(idp.requests[0].headers.authorization, `Basic ${Buffer.from('cid:CLIENT-SECRET').toString('base64')}`);
    assert.equal(received[0].authorization, 'Bearer ACCESS-TOKEN-1');
    assert.equal(received[0].cookie, undefined);
    assert.equal(received[1].cookie, 'sid=SESSION-VALUE');

    const tokenRow = await db.selectFrom('api_oauth_tokens').selectAll().executeTakeFirstOrThrow();
    assert.equal(tokenRow.owner_key, `collection:${folder.id}`);
    assert.doesNotMatch(JSON.stringify(tokenRow), /ACCESS-TOKEN-1/);
    const cookieRow = await db.selectFrom('api_cookies').selectAll().executeTakeFirstOrThrow();
    assert.doesNotMatch(JSON.stringify(cookieRow), /SESSION-VALUE/);
    assert.equal(cryptoManager.decryptData(cookieRow.value_encrypted), 'SESSION-VALUE');

    const status = await invoke('api:oauth:status', { type: 'collection', id: folder.id });
    assert.deepEqual(Object.keys(status as object).sort(), ['canRefresh', 'expiresAt', 'hasToken']);
    assert.equal((status as { hasToken: boolean }).hasToken, true);

    const renderer = JSON.stringify([
      await invoke('api:collections:get-all'),
      await invoke('api:requests:get-all'),
      await db.selectFrom('api_request_history').selectAll().execute(),
    ]);
    assert.doesNotMatch(renderer, /ACCESS-TOKEN-1|CLIENT-SECRET|SESSION-VALUE|clientSecretEncrypted/);

    // Saving the public config back keeps the encrypted secret.
    await __testIpcMainHandlers.get('api:collections:update')!(event, folder.id, {
      auth_type: 'oauth2',
      auth_config: folder.auth_config,
    });
    await invoke('api:oauth:clear-token', { type: 'collection', id: folder.id });
    await send();
    assert.equal(idp.requests[1].headers.authorization, `Basic ${Buffer.from('cid:CLIENT-SECRET').toString('base64')}`);
  } finally {
    await idp.close();
    await new Promise((resolve) => api.close(resolve));
  }
});
