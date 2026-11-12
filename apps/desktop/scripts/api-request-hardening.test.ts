import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rename, stat, symlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, type Duplex } from 'node:stream';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import {
  ApiRequestError,
  MAX_REQUEST_BODY_BYTES,
  prepareRequest,
  type RequestInput,
} from '../electron/http/prepare-request';
import { sendPreparedRequest } from '../electron/http/http-client';
import { createPickedFiles, loadRequestFile } from '../electron/http/request-files';

const isCode = (code: string) => (error: unknown) => error instanceof ApiRequestError && error.code === code;

function memorySettings() {
  const values = new Map<string, string>();
  return {
    values,
    get: async (key: string) => values.get(key),
    set: async (setting: { key: string; value: string }) => {
      values.set(setting.key, setting.value);
    },
  };
}

test('only files picked in the dialog are read; symlink swaps after the pick are refused', async () => {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'api-pick-')));
  const pickedFile = path.join(dir, 'picked.txt');
  const secret = path.join(dir, 'secret.txt');
  await writeFile(pickedFile, 'ok');
  await writeFile(secret, 'secret');

  const settings = memorySettings();
  const picked = createPickedFiles(settings);

  await assert.rejects(loadRequestFile(secret, picked), isCode('FILE_ERROR'));

  await picked.add(pickedFile);
  assert.equal((await loadRequestFile(pickedFile, picked)).data.toString(), 'ok');
  // Persisted: a fresh instance (next app start) still allows it.
  assert.equal((await loadRequestFile(pickedFile, createPickedFiles(settings))).data.toString(), 'ok');

  // A symlink pointing at a picked file is fine, a symlink to anything else is not.
  const linkToPicked = path.join(dir, 'link-picked');
  await symlink(pickedFile, linkToPicked);
  assert.equal((await loadRequestFile(linkToPicked, picked)).data.toString(), 'ok');

  await rename(pickedFile, path.join(dir, 'moved.txt'));
  await symlink(secret, pickedFile);
  await assert.rejects(loadRequestFile(pickedFile, picked), isCode('FILE_ERROR'));
});

test('a parent directory swapped for a symlink between the check and open() is refused', async () => {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'api-parent-')));
  await mkdir(path.join(dir, 'upload'));
  await mkdir(path.join(dir, 'secrets'));
  const pickedFile = path.join(dir, 'upload', 'id_rsa');
  await writeFile(pickedFile, 'ok');
  await writeFile(path.join(dir, 'secrets', 'id_rsa'), 'secret');
  const original = await stat(pickedFile, { bigint: true });

  // identity() runs after realpath() and before open(): swap the parent directory right there.
  const racingPicker = {
    identity: async () => {
      await rename(path.join(dir, 'upload'), path.join(dir, 'upload-old'));
      await symlink(path.join(dir, 'secrets'), path.join(dir, 'upload'));
      return { dev: original.dev.toString(), ino: original.ino.toString() };
    },
  };
  await assert.rejects(loadRequestFile(pickedFile, racingPicker), isCode('FILE_ERROR'));
});

test('loadRequestFile never returns more than maxBytes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'api-size-'));
  const file = path.join(dir, 'big.bin');
  await writeFile(file, Buffer.alloc(10));
  const picked = {
    identity: async (p: string) => {
      const s = await stat(p, { bigint: true });
      return { dev: s.dev.toString(), ino: s.ino.toString() };
    },
  };
  assert.equal((await loadRequestFile(file, picked, 10)).data.length, 10);
  await assert.rejects(loadRequestFile(file, picked, 9), isCode('BODY_TOO_LARGE'));
});

test('multipart enforces one running 50 MB budget across parts', async () => {
  const input: RequestInput = {
    method: 'POST',
    url: 'https://api.example.com/upload',
    params: '[]',
    headers: '[]',
    bodyType: 'form-data',
    body: JSON.stringify([
      { enabled: true, key: 'a', value: '/abs/a.bin', type: 'file' },
      { enabled: true, key: 'b', value: '/abs/b.bin', type: 'file' },
    ]),
    authType: 'none',
    authConfig: '{}',
  };
  const budgets: number[] = [];
  const half = Math.floor(MAX_REQUEST_BODY_BYTES / 2) + 1;
  await assert.rejects(
    prepareRequest(input, {
      variables: {},
      boundary: 'B',
      loadFile: async (_path, maxBytes) => {
        budgets.push(maxBytes);
        // A well-behaved loader returns at most maxBytes; two halves still overflow the total.
        return { data: Buffer.alloc(Math.min(half, maxBytes)), name: 'x.bin', contentType: 'application/octet-stream' };
      },
    }),
    isCode('BODY_TOO_LARGE')
  );
  assert.equal(budgets.length, 2);
  assert.ok(budgets[1] < MAX_REQUEST_BODY_BYTES - half + 1, 'second file gets only the remaining budget');
});

const getRequest = async (url: string) =>
  prepareRequest(
    { method: 'GET', url, params: '[]', headers: '[]', body: '', bodyType: 'none', authType: 'none', authConfig: '{}' },
    { variables: {}, loadFile: async () => assert.fail('no files') }
  );

test('SSH route: a channel that never opens hits the overall deadline and is closed if it arrives late', async () => {
  const prepared = await getRequest('http://internal.service/');
  let deliver: ((stream: Duplex) => void) | undefined;
  await assert.rejects(
    sendPreparedRequest(prepared, 'host-1', {
      openHostStream: () => new Promise((resolve) => (deliver = resolve)),
      timeoutMs: 50,
    }),
    /timed out/
  );
  const lateChannel = new PassThrough();
  deliver?.(lateChannel);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lateChannel.destroyed, true);
});

test('SSH route: a trickling response cannot outlive the overall deadline', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    const interval = setInterval(() => res.write('.'), 10);
    res.on('close', () => clearInterval(interval));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const prepared = await getRequest('http://internal.service/stream');
    const started = Date.now();
    await assert.rejects(
      sendPreparedRequest(prepared, 'host-1', {
        openHostStream: async () => net.connect(port, '127.0.0.1'),
        timeoutMs: 200,
      }),
      /timed out/
    );
    assert.ok(Date.now() - started < 2000);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
