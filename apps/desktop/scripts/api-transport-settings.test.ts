import assert from 'node:assert/strict';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { Duplex, PassThrough } from 'node:stream';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { vaultDataSchema } from '../electron/backup/types';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';
import { MAX_REDIRECTS, decideRedirect, sendPreparedRequest } from '../electron/http/http-client';
import { ApiRequestError, type PreparedRequest } from '../electron/http/prepare-request';

const isCode = (code: string) => (error: unknown) => error instanceof ApiRequestError && error.code === code;

const request = (url: string, extra: Partial<PreparedRequest> = {}): PreparedRequest => ({
  method: 'GET',
  url: new URL(url),
  headers: {},
  ...extra,
});
const follow = { followRedirects: true, viaSshHost: false, redirectCount: 0 };

test('redirect policy: off, non-3xx, limit and method rewrite', () => {
  const post = request('https://a.example/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
    body: Buffer.from('{}'),
  });
  assert.deepEqual(decideRedirect(post, { status: 302, location: '/y' }, { ...follow, followRedirects: false }), { follow: false });
  assert.deepEqual(decideRedirect(post, { status: 200, location: '/y' }, follow), { follow: false });
  assert.deepEqual(decideRedirect(post, { status: 302 }, follow), { follow: false });
  assert.deepEqual(decideRedirect(post, { status: 302, location: 'ftp://a.example/' }, follow), { follow: false });
  assert.deepEqual(
    decideRedirect(post, { status: 302, location: '/y' }, { ...follow, redirectCount: MAX_REDIRECTS }),
    { follow: false, notice: 'REDIRECT_LIMIT' }
  );

  const rewritten = decideRedirect(post, { status: 302, location: '/y' }, follow);
  assert.ok(rewritten.follow);
  assert.equal(rewritten.request.method, 'GET');
  assert.equal(rewritten.request.body, undefined);
  assert.deepEqual(rewritten.request.headers, { Authorization: 'Bearer t' }); // same origin keeps auth

  const kept = decideRedirect(post, { status: 307, location: 'https://b.example/z' }, follow);
  assert.ok(kept.follow);
  assert.equal(kept.request.method, 'POST');
  assert.equal(kept.request.body?.toString(), '{}');
  // Credentials never go to another origin.
  assert.deepEqual(kept.request.headers, { 'Content-Type': 'application/json' });
});

test('redirect policy on the SSH route: only same host:port is followed', () => {
  const ssh = { ...follow, viaSshHost: true };
  const current = request('http://internal.svc:8080/a');
  assert.ok(decideRedirect(current, { status: 301, location: '/b' }, ssh).follow);
  assert.ok(decideRedirect(current, { status: 301, location: 'https://internal.svc:8080/b' }, ssh).follow);
  for (const location of ['http://internal.svc/b', 'http://other.svc:8080/b', 'https://evil.example/']) {
    assert.deepEqual(decideRedirect(current, { status: 302, location }, ssh), {
      follow: false,
      notice: 'REDIRECT_OTHER_HOST',
    });
  }
  // Default ports count as the same port.
  assert.ok(decideRedirect(request('https://h/'), { status: 302, location: 'https://h:443/x' }, ssh).follow);
});

async function withServer(handler: http.RequestListener, run: (port: number) => Promise<void>) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run((server.address() as AddressInfo).port);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

const redirectingServer: http.RequestListener = (req, res) => {
  if (req.url === '/start') {
    res.writeHead(302, { Location: '/end' }).end();
  } else if (req.url === '/loop') {
    res.writeHead(302, { Location: '/loop' }).end();
  } else if (req.url === '/away') {
    res.writeHead(302, { Location: 'http://elsewhere.example/' }).end('moved');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(`at ${req.url}`);
  }
};

test('direct and SSH route follow redirects; off shows the 3xx as is', async () => {
  await withServer(redirectingServer, async (port) => {
    const openHostStream = async (_id: string, _host: string, targetPort: number) => net.connect(targetPort, '127.0.0.1');
    const direct = await sendPreparedRequest(request(`http://127.0.0.1:${port}/start`), null, { openHostStream });
    assert.equal(direct.body, 'at /end');

    const viaHost = await sendPreparedRequest(request(`http://internal.svc:${port}/start`), 'host-1', { openHostStream });
    assert.equal(viaHost.body, 'at /end');

    const off = await sendPreparedRequest(request(`http://127.0.0.1:${port}/start`), null, { openHostStream, followRedirects: false });
    assert.equal(off.status, 302);
    assert.equal(off.headers['location'], '/end');

    const loop = await sendPreparedRequest(request(`http://127.0.0.1:${port}/loop`), null, { openHostStream });
    assert.equal(loop.status, 302);
    assert.equal(loop.redirectNotice, 'REDIRECT_LIMIT');

    const opened: string[] = [];
    const away = await sendPreparedRequest(request(`http://internal.svc:${port}/away`), 'host-1', {
      openHostStream: async (id, host, targetPort) => {
        opened.push(host);
        return openHostStream(id, host, targetPort);
      },
    });
    assert.equal(away.status, 302);
    assert.equal(away.redirectNotice, 'REDIRECT_OTHER_HOST');
    assert.deepEqual(opened, ['internal.svc']);
    assert.ok(away.timings && away.timings.totalMs >= away.timings.headersMs);
  });
});

test('direct route: cancel and timeout abort the fetch', async () => {
  const hangingFetch = ((_url: URL, init: RequestInit) =>
    new Promise((_resolve, reject) =>
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    )) as typeof fetch;
  const noHost = async (): Promise<Duplex> => assert.fail('direct');

  const cancelled = new AbortController();
  const running = sendPreparedRequest(request('https://h/slow'), null, {
    openHostStream: noHost,
    signal: cancelled.signal,
    fetch: hangingFetch,
  });
  cancelled.abort();
  await assert.rejects(running, isCode('CANCELLED'));

  await assert.rejects(
    sendPreparedRequest(request('https://h/slow'), null, { openHostStream: noHost, timeoutMs: 20, fetch: hangingFetch }),
    (error: unknown) => isCode('TIMEOUT')(error) && /timed out/.test((error as Error).message)
  );
});

test('cancel on the SSH route closes the channel, also one that opens late', async () => {
  // Channel open, server never answers.
  const channel = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback(); } });
  const controller = new AbortController();
  const running = sendPreparedRequest(request('http://internal.svc/'), 'host-1', {
    openHostStream: async () => channel,
    signal: controller.signal,
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(running, isCode('CANCELLED'));
  assert.equal(channel.destroyed, true);

  // Channel still opening when cancelled.
  let deliver: ((stream: Duplex) => void) | undefined;
  const early = new AbortController();
  const opening = sendPreparedRequest(request('http://internal.svc/'), 'host-1', {
    openHostStream: () => new Promise((resolve) => (deliver = resolve)),
    signal: early.signal,
  });
  early.abort();
  await assert.rejects(opening, isCode('CANCELLED'));
  const late = new PassThrough();
  deliver?.(late);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(late.destroyed, true);

  // Already cancelled before the send starts: nothing is opened.
  const before = new AbortController();
  before.abort();
  await assert.rejects(
    sendPreparedRequest(request('http://internal.svc/'), 'host-1', {
      openHostStream: async () => assert.fail('must not open'),
      signal: before.signal,
    }),
    isCode('CANCELLED')
  );
});

test('migration 016 adds nullable request settings; backups default them to null', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE api_requests (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  sqlite.exec(`INSERT INTO api_requests (id, name) VALUES ('r1', 'old')`);
  runIncrementalMigrations(sqlite as never);
  runIncrementalMigrations(sqlite as never); // idempotent
  const row = sqlite.prepare('SELECT timeout_seconds, follow_redirects, verify_tls FROM api_requests').get();
  assert.deepEqual({ ...row }, { timeout_seconds: null, follow_redirects: null, verify_tls: null });

  const oldBackupRequest = {
    id: 'r1', collection_id: null, name: 'x', method: 'GET', url: 'https://h', params: '[]', headers: '[]',
    body: '', body_type: 'none', auth_type: 'none', auth_config: '{}', network_host_id: null,
    environment_id: null, sort_order: 0, created_at: 1, updated_at: 1, last_executed_at: null,
  };
  const parsed = vaultDataSchema.parse({
    version: 1, exportedAt: 1, appVersion: '1', hosts: [], keys: [], tunnels: [], snippets: [], s3Connections: [],
    apiRequests: [oldBackupRequest],
  });
  const restored = (parsed as { apiRequests?: Array<Record<string, unknown>> }).apiRequests?.[0];
  assert.equal(restored?.timeout_seconds, null);
  assert.equal(restored?.verify_tls, null);
  assert.equal(restored?.follow_redirects, null);
});
