import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { requestViaTunnel } from '../electron/http/tunnel-request';
import { readResponseText } from '../electron/http/fetch-timeout';

test('tunnel response decodes multibyte characters split across chunks', async () => {
  const body = Buffer.from('größe: 😀 €', 'utf8');
  const split = body.indexOf(Buffer.from('😀')) + 2; // cut inside the emoji
  const server = http.createServer((_req, res) => {
    res.write(body.subarray(0, split));
    setTimeout(() => res.end(body.subarray(split)), 20);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await requestViaTunnel(port, false, '/', 'GET', {});
    assert.equal(response.body, 'größe: 😀 €');
    assert.equal(response.size, body.length);
  } finally {
    server.close();
  }
});

test('fetch body reader decodes once and enforces the size cap', async () => {
  const text = 'a😀b';
  const ok = await readResponseText(new Response(text));
  assert.deepEqual(ok, { text, size: Buffer.byteLength(text) });

  await assert.rejects(readResponseText(new Response('x'.repeat(11)), 10), /exceeds/);
  assert.deepEqual(await readResponseText(new Response(null)), { text: '', size: 0 });
});
