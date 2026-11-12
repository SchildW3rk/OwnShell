import assert from 'node:assert/strict';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { Duplex } from 'node:stream';
import { test } from 'node:test';
import { ApiRequestError, prepareRequest } from '../electron/http/prepare-request';
import {
  acceptKey,
  buildHandshake,
  connectWebSocket,
  createFrameDecoder,
  encodeFrame,
  MAX_WS_FRAGMENTS,
  MAX_WS_PENDING_WRITE_BYTES,
  Opcode,
  verifyHandshake,
  WebSocketHandshakeRejected,
  WebSocketProtocolError,
  wrapConnection,
  type DecodedMessage,
} from '../electron/http/websocket';

/** Unmasked server frame. */
function serverFrame(opcode: number, payload: Buffer | string, fin = true, extra = 0): Buffer {
  const data = typeof payload === 'string' ? Buffer.from(payload) : payload;
  const header =
    data.length < 126
      ? Buffer.from([(fin ? 0x80 : 0) | extra | opcode, data.length])
      : Buffer.from([(fin ? 0x80 : 0) | opcode, 126, data.length >> 8, data.length & 0xff]);
  return Buffer.concat([header, data]);
}

/** Reads one masked client frame (test helper). */
function readClientFrame(frame: Buffer): { opcode: number; payload: Buffer; masked: boolean } {
  let length = frame[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    length = frame.readUInt16BE(2);
    offset = 4;
  }
  const masked = (frame[1] & 0x80) !== 0;
  const mask = frame.subarray(offset, offset + 4);
  const payload = Buffer.from(frame.subarray(offset + 4, offset + 4 + length));
  for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index & 3];
  return { opcode: frame[0] & 0x0f, payload, masked };
}

function decoder(max?: number) {
  const messages: DecodedMessage[] = [];
  const controls: Array<[number, string]> = [];
  const decode = createFrameDecoder({
    maxMessageBytes: max,
    message: (message) => messages.push(message),
    control: (opcode, payload) => controls.push([opcode, payload.toString()]),
  });
  return { decode, messages, controls };
}

test('handshake: request headers, accept key (RFC 6455 example), no header injection', () => {
  assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  const request = buildHandshake(new URL('wss://api.test:8443/socket?x=1'), { Authorization: 'Bearer t', Upgrade: 'no' }, 'k');
  assert.match(request, /^GET \/socket\?x=1 HTTP\/1\.1\r\nHost: api\.test:8443\r\nUpgrade: websocket\r\n/);
  assert.match(request, /Authorization: Bearer t\r\n/);
  assert.doesNotMatch(request, /Upgrade: no/);
  assert.ok(request.endsWith('\r\n\r\n'));
  assert.throws(() => buildHandshake(new URL('ws://a/'), { 'X-A': 'x\r\nEvil: 1' }, 'k'), ApiRequestError);

  const good = `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey('k')}`;
  assert.equal(verifyHandshake(good, 'k').status, 101);
  assert.throws(() => verifyHandshake(good.replace(acceptKey('k'), 'wrong'), 'k'), WebSocketProtocolError);
  assert.throws(() => verifyHandshake(`${good}\r\nSec-WebSocket-Extensions: permessage-deflate`, 'k'), WebSocketProtocolError);
  assert.equal(verifyHandshake('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer', 'k').status, 401);
});

test('client frames are masked, with 7-bit, 16-bit and 64-bit lengths', () => {
  for (const size of [5, 300, 70000]) {
    const payload = Buffer.alloc(size, 'a');
    const frame = encodeFrame(Opcode.Text, payload, Buffer.from([1, 2, 3, 4]));
    assert.equal(frame[0], 0x81);
    assert.equal(frame[1] & 0x80, 0x80);
    const lengthCode = frame[1] & 0x7f;
    assert.equal(lengthCode, size < 126 ? size : size < 65536 ? 126 : 127);
    const headerLength = size < 126 ? 2 : size < 65536 ? 4 : 10;
    const mask = frame.subarray(headerLength, headerLength + 4);
    const body = Buffer.from(frame.subarray(headerLength + 4));
    for (let index = 0; index < body.length; index++) body[index] ^= mask[index & 3];
    assert.deepEqual(body, payload);
  }
});

test('decoder: split frames, fragmentation with interleaved ping, binary, control frames', () => {
  const { decode, messages, controls } = decoder();
  const stream = Buffer.concat([
    serverFrame(Opcode.Text, 'hello'),
    serverFrame(Opcode.Text, 'frag-', false),
    serverFrame(Opcode.Ping, 'p'),
    serverFrame(Opcode.Continuation, 'ment', false),
    serverFrame(Opcode.Continuation, 'ed'),
    serverFrame(Opcode.Binary, Buffer.from([0, 255])),
    serverFrame(Opcode.Text, 'x'.repeat(300)),
  ]);
  // Byte by byte: every partial header/payload path.
  for (const byte of stream) decode.feed(Buffer.from([byte]));
  assert.deepEqual(
    messages.map((message) => [message.binary, message.binary ? [...message.data] : message.data.toString()]),
    [
      [false, 'hello'],
      [false, 'frag-mented'],
      [true, [0, 255]],
      [false, 'x'.repeat(300)],
    ]
  );
  assert.deepEqual(controls, [[Opcode.Ping, 'p']]);
});

test('decoder: protocol violations and size limit throw with the right close code', () => {
  const code = (feed: Buffer, max?: number) => {
    try {
      decoder(max).decode.feed(feed);
      return 0;
    } catch (error) {
      return (error as WebSocketProtocolError).closeCode;
    }
  };
  assert.equal(code(Buffer.from([0x81, 0x81, 0, 0, 0, 0, 0])), 1002, 'masked server frame');
  assert.equal(code(serverFrame(Opcode.Text, 'a', true, 0x40)), 1002, 'RSV1 without extension');
  assert.equal(code(serverFrame(Opcode.Continuation, 'a')), 1002, 'continuation without start');
  assert.equal(code(serverFrame(Opcode.Ping, 'a', false)), 1002, 'fragmented control frame');
  assert.equal(code(serverFrame(0x3, 'a')), 1002, 'reserved opcode');
  assert.equal(code(Buffer.concat([serverFrame(Opcode.Text, 'a', false), serverFrame(Opcode.Text, 'b')])), 1002);
  assert.equal(code(serverFrame(Opcode.Text, Buffer.from([0xff, 0xfe]))), 1007, 'invalid UTF-8');
  assert.equal(code(serverFrame(Opcode.Text, 'x'.repeat(20)), 10), 1009, 'too large');
  assert.equal(
    code(Buffer.concat([serverFrame(Opcode.Text, 'x'.repeat(8), false), serverFrame(Opcode.Continuation, 'x'.repeat(8))]), 10),
    1009,
    'too large after reassembly'
  );
  // 64-bit length announcing 2^40 bytes: refused from the header alone.
  const huge = Buffer.from([0x82, 127, 0, 0, 1, 0, 0, 0, 0, 0]);
  assert.equal(code(huge), 1009);
});

/** Minimal test server: checks the upgrade, then echoes text, pings once and closes on "bye". */
async function wsServer(options: { status?: number } = {}) {
  const seen: { head?: string; frames: Array<{ opcode: number; payload: string; masked: boolean }> } = { frames: [] };
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let upgraded = false;
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        seen.head = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 4);
        if (options.status) {
          socket.end(`HTTP/1.1 ${options.status} Nope\r\nContent-Length: 0\r\n\r\n`);
          return;
        }
        const key = /Sec-WebSocket-Key: (.+)/.exec(seen.head)![1].trim();
        upgraded = true;
        // The first message in the same packet as the 101 response.
        socket.write(
          Buffer.concat([
            Buffer.from(
              `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`
            ),
            serverFrame(Opcode.Text, 'welcome'),
            serverFrame(Opcode.Ping, 'are you there'),
          ])
        );
      }
      while (buffer.length >= 6) {
        const length = buffer[1] & 0x7f;
        if (length > 125 || buffer.length < 6 + length) return;
        const frame = readClientFrame(buffer.subarray(0, 6 + length));
        buffer = buffer.subarray(6 + length);
        seen.frames.push({ opcode: frame.opcode, payload: frame.payload.toString('latin1'), masked: frame.masked });
        if (frame.opcode === Opcode.Text) {
          if (frame.payload.toString() === 'bye') socket.write(serverFrame(Opcode.Close, Buffer.from([0x03, 0xe8, 0x62])));
          else socket.write(serverFrame(Opcode.Text, `echo:${frame.payload}`));
        } else if (frame.opcode === Opcode.Close) {
          socket.end();
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port, seen };
}

const noFiles = async () => {
  throw new Error('no files');
};

test('end to end through the SSH-host route: auth headers, echo, pong, server close', async () => {
  const { server, port, seen } = await wsServer();
  try {
    const prepared = await prepareRequest(
      {
        method: 'GET',
        url: `ws://internal.service:${port}/live?room={{room}}`,
        params: '[]',
        headers: '[]',
        body: '',
        bodyType: 'none',
        authType: 'bearer',
        authConfig: JSON.stringify({ token: '{{token}}' }),
      },
      { variables: { room: 'a', token: 'secret' }, loadFile: noFiles, webSocket: true }
    );
    const hosts: string[] = [];
    const { connection, response } = await connectWebSocket(prepared, 'host-1', {
      openHostStream: async (_id, host, targetPort) => {
        hosts.push(`${host}:${targetPort}`);
        return net.connect(port, '127.0.0.1');
      },
      connectDirect: () => assert.fail('must not dial directly'),
      timeoutMs: 2000,
      cookieHeader: 'sid=1',
    });
    assert.equal(response.status, 101);
    assert.deepEqual(hosts, [`internal.service:${port}`]);
    assert.match(seen.head!, /^GET \/live\?room=a HTTP\/1\.1/);
    assert.match(seen.head!, /Authorization: Bearer secret/);
    assert.match(seen.head!, /Cookie: sid=1/);

    const received: string[] = [];
    const closed = new Promise<[number, string]>((resolve) => connection.on('close', (code, reason) => resolve([code, reason])));
    connection.on('message', (message) => {
      received.push(message.data.toString());
      if (received.length === 1) connection.send('hi');
      if (message.data.toString() === 'echo:hi') connection.send('bye');
    });
    assert.deepEqual(await closed, [1000, 'b']);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(received, ['welcome', 'echo:hi']);
    assert.ok(seen.frames.every((frame) => frame.masked));
    assert.deepEqual(
      seen.frames.map((frame) => [frame.opcode, frame.payload]),
      [
        // "hi" is sent from the welcome handler, before the ping that followed it is answered.
        [Opcode.Text, 'hi'],
        [Opcode.Pong, 'are you there'],
        [Opcode.Text, 'bye'],
        [Opcode.Close, '\u0003è'],
      ]
    );
  } finally {
    server.close();
  }
});

test('a non-101 answer, a bad URL, an unavailable host and a hung handshake fail cleanly', async () => {
  const rejecting = await wsServer({ status: 401 });
  const prepared = (url: string) => ({ method: 'GET' as const, url: new URL(url), headers: {} });
  try {
    await assert.rejects(
      connectWebSocket(prepared(`ws://127.0.0.1:${rejecting.port}/`), null, {
        openHostStream: async () => assert.fail('direct'),
        timeoutMs: 2000,
      }),
      (error: WebSocketHandshakeRejected) => error instanceof WebSocketHandshakeRejected && error.response.status === 401
    );
  } finally {
    rejecting.server.close();
  }
  await assert.rejects(
    prepareRequest(
      { method: 'GET', url: 'https://x.test', params: '[]', headers: '[]', body: '', bodyType: 'none', authType: 'none', authConfig: '{}' },
      { loadFile: noFiles, webSocket: true }
    ),
    (error: ApiRequestError) => error.code === 'INVALID_URL'
  );
  await assert.rejects(
    connectWebSocket(prepared('ws://x.test/'), 'host-1', {
      openHostStream: async () => {
        throw new Error('channel refused');
      },
      timeoutMs: 2000,
    }),
    (error: ApiRequestError) => error.code === 'NETWORK_HOST_UNAVAILABLE'
  );
  const silent = net.createServer(() => undefined);
  await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(
      connectWebSocket(prepared(`ws://127.0.0.1:${(silent.address() as AddressInfo).port}/`), null, {
        openHostStream: async () => assert.fail('direct'),
        timeoutMs: 100,
      }),
      (error: ApiRequestError) => error.code === 'TIMEOUT'
    );
  } finally {
    silent.close();
  }
});

test('decoder: empty continuation frames are not stored and the fragment count is capped', () => {
  const ok = decoder();
  ok.decode.feed(
    Buffer.concat([
      serverFrame(Opcode.Text, 'a', false),
      serverFrame(Opcode.Continuation, '', false),
      serverFrame(Opcode.Continuation, 'b'),
    ])
  );
  assert.equal(ok.messages[0].data.toString(), 'ab');

  const flood = decoder();
  const frames = [serverFrame(Opcode.Text, 'a', false)];
  for (let index = 0; index < MAX_WS_FRAGMENTS + 10; index++) frames.push(serverFrame(Opcode.Continuation, '', false));
  assert.throws(
    () => flood.decode.feed(Buffer.concat(frames)),
    (error: WebSocketProtocolError) => error.closeCode === 1009
  );
});

test('decoder: close frames are validated per RFC 6455 §7.4', () => {
  const close = (payload: Buffer) => {
    try {
      decoder().decode.feed(serverFrame(Opcode.Close, payload));
      return 0;
    } catch (error) {
      return (error as WebSocketProtocolError).closeCode;
    }
  };
  const withCode = (code: number, reason: Buffer = Buffer.alloc(0)) => {
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code);
    return Buffer.concat([payload, reason]);
  };
  assert.equal(close(Buffer.alloc(0)), 0, 'empty close is fine');
  for (const code of [1000, 1001, 1003, 1007, 1011, 1012, 1014, 3000, 4999]) assert.equal(close(withCode(code)), 0, `code ${code}`);
  assert.equal(close(Buffer.from([0x03])), 1002, 'one-byte payload');
  for (const code of [0, 999, 1004, 1005, 1006, 1015, 1016, 2000, 2999, 5000, 65535]) {
    assert.equal(close(withCode(code)), 1002, `code ${code}`);
  }
  assert.equal(close(withCode(1000, Buffer.from('bye'))), 0);
  assert.equal(close(withCode(1000, Buffer.from([0xff, 0xfe]))), 1007, 'invalid UTF-8 reason');
});

/** A socket whose peer never reads: writes stay queued until `drain()` is called. */
function stuckSocket() {
  const callbacks: Array<() => void> = [];
  const written: Buffer[] = [];
  const socket = new Duplex({
    highWaterMark: 1,
    read() {},
    write(chunk: Buffer, _encoding, callback) {
      written.push(chunk);
      callbacks.push(() => callback());
    },
  });
  const drain = () => {
    while (callbacks.length) callbacks.shift()!();
  };
  return { socket, written, drain };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('connection: pongs are coalesced while the socket is backed up; queued bytes are capped', async () => {
  const { socket, written, drain } = stuckSocket();
  socket.pause();
  const connection = wrapConnection(socket, Buffer.alloc(0));
  const errors: Error[] = [];
  const closes: number[] = [];
  connection.on('error', (error) => errors.push(error));
  connection.on('close', (code) => closes.push(code));
  await tick();

  for (let index = 0; index < 500; index++) socket.push(serverFrame(Opcode.Ping, `p${index}`));
  await tick();
  // Only the first pong went out; the rest wait as one (the latest) pong.
  assert.equal(written.length, 1);
  assert.equal(readClientFrame(written[0]).payload.toString(), 'p0');
  assert.ok(socket.writableLength < 100);
  drain();
  await tick();
  assert.equal(written.length, 2);
  assert.equal(readClientFrame(written[1]).payload.toString(), 'p499');

  // Sends queue up to the cap; the one beyond it closes the connection.
  const chunk = 'x'.repeat(3 * 1024 * 1024);
  connection.send(chunk);
  connection.send(chunk);
  assert.throws(() => connection.send(chunk));
  assert.ok(socket.writableLength <= MAX_WS_PENDING_WRITE_BYTES);
  assert.equal(errors.length, 1);
  assert.deepEqual(closes, [1006]);
  assert.ok(socket.destroyed);
});

test('connection: a protocol error still delivers its close frame through a backed-up socket', async () => {
  const { socket, written, drain } = stuckSocket();
  socket.pause();
  const connection = wrapConnection(socket, Buffer.alloc(0));
  const errors: Error[] = [];
  connection.on('error', (error) => errors.push(error));
  await tick();
  // Back the socket up with one pong, then send a masked (forbidden) server frame.
  socket.push(serverFrame(Opcode.Ping, 'p'));
  await tick();
  const masked = serverFrame(Opcode.Text, 'x');
  masked[1] |= 0x80;
  socket.push(Buffer.concat([masked, Buffer.alloc(4)]));
  await tick();
  assert.equal(errors.length, 1);
  assert.equal(socket.destroyed, false, 'not torn down before the queued close frame is flushed');
  drain();
  await tick();
  const close = written.map(readClientFrame).find((frame) => frame.opcode === Opcode.Close);
  assert.ok(close, 'close frame written');
  assert.equal(close.payload.readUInt16BE(0), 1002);
});

test('a host channel that opens after cancel is destroyed, not leaked', async () => {
  const controller = new AbortController();
  let resolveChannel: (channel: Duplex) => void = () => undefined;
  const late = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback(); } });
  const pending = connectWebSocket({ method: 'GET', url: new URL('ws://x.test/'), headers: {} }, 'host-1', {
    openHostStream: () => new Promise<Duplex>((resolve) => (resolveChannel = resolve)),
    timeoutMs: 5000,
    signal: controller.signal,
  });
  await tick();
  controller.abort();
  await assert.rejects(pending, (error: ApiRequestError) => error.code === 'CANCELLED');
  resolveChannel(late);
  await tick();
  assert.ok(late.destroyed);
});
