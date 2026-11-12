import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, stat } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import {
  ApiRequestError,
  prepareRequest,
  resolveAuth,
  type PrepareContext,
  type RequestInput,
} from '../electron/http/prepare-request';
import { sendPreparedRequest } from '../electron/http/http-client';
import { decodeResponseBody } from '../electron/http/fetch-timeout';
import { loadRequestFile } from '../electron/http/request-files';

const base: RequestInput = {
  method: 'POST',
  url: 'https://api.example.com/items',
  params: '[]',
  headers: '[]',
  body: '',
  bodyType: 'none',
  authType: 'none',
  authConfig: '{}',
};

const noFiles: PrepareContext['loadFile'] = async () => {
  throw new Error('no files expected');
};

function ctx(overrides: Partial<PrepareContext> = {}): PrepareContext {
  return { variables: {}, loadFile: noFiles, ...overrides };
}

const kv = (items: Array<Record<string, unknown>>) =>
  JSON.stringify(items.map((item) => ({ enabled: true, ...item })));

test('variables resolve in url, params, headers, auth and body', async () => {
  const prepared = await prepareRequest(
    {
      ...base,
      url: '{{BASE}}/items',
      params: kv([{ key: 'q', value: '{{Q}}' }]),
      headers: kv([{ key: 'X-Env', value: '{{ ENV }}' }]),
      body: '{"name":"{{NAME}}"}',
      bodyType: 'json',
      authType: 'bearer',
      authConfig: JSON.stringify({ token: '{{TOKEN}}' }),
    },
    ctx({ variables: { BASE: 'https://h.test', Q: 'a b', ENV: 'prod', NAME: 'x', TOKEN: 't0k' } })
  );
  assert.equal(prepared.url.toString(), 'https://h.test/items?q=a+b');
  assert.equal(prepared.headers['X-Env'], 'prod');
  assert.equal(prepared.headers['Authorization'], 'Bearer t0k');
  assert.equal(prepared.headers['Content-Type'], 'application/json');
  assert.equal(prepared.body?.toString(), '{"name":"x"}');
});

test('unknown variables fail before sending and list every missing name', async () => {
  await assert.rejects(
    prepareRequest(
      {
        ...base,
        url: '{{BASE}}/x',
        headers: kv([{ key: 'X-A', value: '{{HEADER_VAR}}' }]),
        body: '{{BODY_VAR}}',
        bodyType: 'raw',
        authType: 'bearer',
        authConfig: JSON.stringify({ token: '{{TOKEN}}' }),
      },
      ctx()
    ),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === 'MISSING_VARIABLES' &&
      error.detail === 'BASE, HEADER_VAR, TOKEN, BODY_VAR'
  );
});

test('a locked vault is reported instead of silently resolving to empty', async () => {
  await assert.rejects(
    prepareRequest({ ...base, url: 'https://h.test/{{ID}}' }, ctx({ variablesLocked: true })),
    (error: unknown) => error instanceof ApiRequestError && error.code === 'VAULT_LOCKED'
  );
});

test('query params append without re-encoding the existing query; api-key can go to the query', async () => {
  const prepared = await prepareRequest(
    {
      ...base,
      method: 'GET',
      url: 'https://h.test/p?a=b%20c&x',
      params: kv([{ key: 'page', value: '2' }, { key: 'off', value: '1', enabled: false }]),
      authType: 'api-key',
      authConfig: JSON.stringify({ key: 'api_key', value: 'k', addTo: 'query' }),
    },
    ctx()
  );
  assert.equal(prepared.url.search, '?a=b%20c&x&page=2&api_key=k');
  assert.equal(prepared.body, undefined);
});

test('inherit walks the collection chain; root inherit means no auth', async () => {
  const chain = [
    { auth_type: 'inherit' as const, auth_config: '{}' },
    { auth_type: 'basic' as const, auth_config: JSON.stringify({ username: 'u', password: 'p' }) },
    { auth_type: 'bearer' as const, auth_config: JSON.stringify({ token: 'ignored' }) },
  ];
  assert.deepEqual(resolveAuth('inherit', '{}', chain), {
    type: 'basic',
    config: { username: 'u', password: 'p' },
  });
  assert.equal(resolveAuth('inherit', '{}', [{ auth_type: 'inherit', auth_config: '{}' }]).type, 'none');
  assert.equal(resolveAuth('bearer', '{"token":"own"}', chain).config.token, 'own');

  const prepared = await prepareRequest({ ...base, authType: 'inherit' }, ctx({ authChain: chain }));
  assert.equal(prepared.headers['Authorization'], `Basic ${Buffer.from('u:p').toString('base64')}`);
  const root = await prepareRequest({ ...base, authType: 'inherit' }, ctx({ authChain: [] }));
  assert.equal(root.headers['Authorization'], undefined);
});

test('form-data sends the boundary header and a file part', async () => {
  const prepared = await prepareRequest(
    {
      ...base,
      bodyType: 'form-data',
      headers: kv([{ key: 'content-type', value: 'multipart/form-data' }]),
      body: kv([
        { key: 'title', value: '{{T}}' },
        { key: 'upload', value: '/abs/pic.png', type: 'file' },
        { key: 'skip', value: 'x', enabled: false },
      ]),
    },
    ctx({
      boundary: 'B',
      variables: { T: 'hello' },
      loadFile: async (filePath) => {
        assert.equal(filePath, '/abs/pic.png');
        return { data: Buffer.from([0, 1, 2]), name: 'pic.png', contentType: 'image/png' };
      },
    })
  );
  assert.deepEqual(prepared.headers, { 'Content-Type': 'multipart/form-data; boundary=B' });
  assert.deepEqual(
    prepared.body,
    Buffer.concat([
      Buffer.from('--B\r\nContent-Disposition: form-data; name="title"\r\n\r\nhello\r\n'),
      Buffer.from(
        '--B\r\nContent-Disposition: form-data; name="upload"; filename="pic.png"\r\nContent-Type: image/png\r\n\r\n'
      ),
      Buffer.from([0, 1, 2]),
      Buffer.from('\r\n--B--\r\n'),
    ])
  );
});

test('binary body sends file bytes, user Content-Type wins', async () => {
  const loadFile: PrepareContext['loadFile'] = async () => ({
    data: Buffer.from([255, 216, 255]),
    name: 'a.jpg',
    contentType: 'image/jpeg',
  });
  const body = JSON.stringify({ path: '/abs/a.jpg', name: 'a.jpg' });
  const auto = await prepareRequest({ ...base, bodyType: 'binary', body }, ctx({ loadFile }));
  assert.deepEqual(auto.body, Buffer.from([255, 216, 255]));
  assert.equal(auto.headers['Content-Type'], 'image/jpeg');

  const custom = await prepareRequest(
    { ...base, bodyType: 'binary', body, headers: kv([{ key: 'content-type', value: 'application/x-foo' }]) },
    ctx({ loadFile })
  );
  assert.deepEqual(custom.headers, { 'content-type': 'application/x-foo' });

  await assert.rejects(
    prepareRequest({ ...base, bodyType: 'binary', body: '{"name":"old.bin","size":3}' }, ctx()),
    (error: unknown) => error instanceof ApiRequestError && error.code === 'FILE_ERROR'
  );
});

test('raw body Content-Type follows the chosen raw type unless the user set one', async () => {
  const types = { text: 'text/plain', json: 'application/json', xml: 'application/xml', html: 'text/html' } as const;
  for (const [rawContentType, expected] of Object.entries(types)) {
    const prepared = await prepareRequest(
      { ...base, bodyType: 'raw', body: 'x', rawContentType: rawContentType as keyof typeof types },
      ctx()
    );
    assert.equal(prepared.headers['Content-Type'], expected);
  }
  const custom = await prepareRequest(
    { ...base, bodyType: 'raw', body: 'x', rawContentType: 'xml', headers: kv([{ key: 'Content-Type', value: 'text/csv' }]) },
    ctx()
  );
  assert.equal(custom.headers['Content-Type'], 'text/csv');
});

test('form-urlencoded and invalid URLs', async () => {
  const prepared = await prepareRequest(
    { ...base, bodyType: 'form-urlencoded', body: kv([{ key: 'a', value: '1 2' }, { key: 'b', value: '&' }]) },
    ctx()
  );
  assert.equal(prepared.body?.toString(), 'a=1+2&b=%26');
  assert.equal(prepared.headers['Content-Type'], 'application/x-www-form-urlencoded');

  for (const url of ['not a url', 'file:///etc/passwd']) {
    await assert.rejects(
      prepareRequest({ ...base, url }, ctx()),
      (error: unknown) => error instanceof ApiRequestError && error.code === 'INVALID_URL'
    );
  }
});

test('loadRequestFile only accepts absolute paths to regular files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'api-file-'));
  const file = path.join(dir, 'data.json');
  await writeFile(file, '{"a":1}');
  await mkdir(path.join(dir, 'sub'));

  const picked = {
    identity: async (p: string) => {
      const s = await stat(p, { bigint: true });
      return { dev: s.dev.toString(), ino: s.ino.toString() };
    },
  };
  const loaded = await loadRequestFile(file, picked);
  assert.equal(loaded.name, 'data.json');
  assert.equal(loaded.contentType, 'application/json');
  assert.equal(loaded.data.toString(), '{"a":1}');

  for (const bad of ['data.json', path.join(dir, 'sub'), path.join(dir, 'missing.bin')]) {
    await assert.rejects(
      loadRequestFile(bad, picked),
      (error: unknown) => error instanceof ApiRequestError && error.code === 'FILE_ERROR'
    );
  }
});

test('network host: failure to reach the host never falls back to a direct request', async () => {
  const prepared = await prepareRequest({ ...base, method: 'GET' }, ctx());
  let fetchCalls = 0;
  await assert.rejects(
    sendPreparedRequest(prepared, 'host-1', {
      openHostStream: async () => {
        throw new Error('SSH auth failed');
      },
      fetch: (async () => {
        fetchCalls++;
        return new Response('direct');
      }) as typeof fetch,
    }),
    (error: unknown) => error instanceof ApiRequestError && error.code === 'NETWORK_HOST_UNAVAILABLE'
  );
  assert.equal(fetchCalls, 0);
});

test('network host: request goes over the stream opened for the target host:port', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ host: req.headers.host, path: req.url }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const prepared = await prepareRequest(
      { ...base, method: 'GET', url: 'http://internal.service:8080/health?x=1' },
      ctx()
    );
    const opened: Array<[string, string, number]> = [];
    const response = await sendPreparedRequest(prepared, 'host-1', {
      openHostStream: async (hostId, host, targetPort) => {
        opened.push([hostId, host, targetPort]);
        return net.connect(port, '127.0.0.1');
      },
      fetch: (async () => assert.fail('direct fetch must not be used')) as typeof fetch,
    });
    assert.deepEqual(opened, [['host-1', 'internal.service', 8080]]);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { host: 'internal.service:8080', path: '/health?x=1' });
  } finally {
    server.close();
  }
});

test('binary responses stay bytes; text is decoded once', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff]);
  assert.deepEqual(decodeResponseBody(png, 'image/png'), { body: '', bodyBytes: new Uint8Array(png) });
  assert.deepEqual(decodeResponseBody(Buffer.from('ä'), 'application/json; charset=utf-8'), { body: 'ä' });
  assert.deepEqual(decodeResponseBody(Buffer.from('ä'), 'application/vnd.api+json'), { body: 'ä' });
  assert.deepEqual(decodeResponseBody(Buffer.from('plain'), undefined), { body: 'plain' });
  assert.ok(decodeResponseBody(png, undefined).bodyBytes);
});
