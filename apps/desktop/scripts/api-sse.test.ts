import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { sendPreparedRequest } from '../electron/http/http-client';
import { ApiRequestError } from '../electron/http/prepare-request';
import { createSseParser, isEventStream, MAX_EVENT_CHARS, type SseEvent } from '../electron/http/sse';

function parse(chunks: Array<string | Uint8Array>): SseEvent[] {
  const events: SseEvent[] = [];
  const parser = createSseParser((event) => events.push(event), () => 1);
  for (const chunk of chunks) parser.feed(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  parser.end();
  return events;
}

test('SSE parser: spec examples (multi-line data, comments, event type, id persistence)', () => {
  const events = parse([
    '﻿: comment\n',
    'data: first\ndata:  second\n\n',
    'event: add\nid: 7\ndata: {"a":1}\n\n',
    'data\n\n',
    'id\ndata: after-reset\n\n',
    'event: ignored\n\n',
    'data: kept-type?\nretry: 1000\nunknown: x\n\n',
    'data: no trailing blank line',
  ]);
  assert.deepEqual(
    events.map(({ event, data, id }) => ({ event, data, id })),
    [
      { event: 'message', data: 'first\n second', id: '' },
      { event: 'add', data: '{"a":1}', id: '7' },
      { event: 'message', data: '', id: '7' },
      { event: 'message', data: 'after-reset', id: '' },
      // An event without data resets the type and is not dispatched.
      { event: 'message', data: 'kept-type?', id: '' },
    ]
  );
});

test('SSE parser: CRLF, CR and LF line ends, also split across chunks and inside UTF-8 sequences', () => {
  const euro = Buffer.from('data: €\r\n\r\n');
  const events = parse(['data: a\r', '\ndata: b\r\r', 'data: c\n', '\n', euro.subarray(0, 8), euro.subarray(8)]);
  assert.deepEqual(
    events.map((event) => event.data),
    ['a\nb', 'c', '€']
  );
});

test('SSE parser: ids with NUL are ignored, oversized data is cut and flagged', () => {
  const events = parse([
    'id: ok\n',
    'id: bad\0id\ndata: x\n\n',
    `data: ${'y'.repeat(MAX_EVENT_CHARS + 50)}\n`,
    'data: more\n\n',
  ]);
  assert.equal(events[0].id, 'ok');
  assert.equal(events[1].truncated, true);
  assert.ok(events[1].data.length <= MAX_EVENT_CHARS);
  assert.equal(isEventStream('Text/Event-Stream; charset=utf-8'), true);
  assert.equal(isEventStream('application/json'), false);
});

async function sseServer(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/events`) };
}

test('event-stream responses are streamed; the overall timeout does not end a live stream, the idle timeout does', async () => {
  const { server, url } = await sseServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    let count = 0;
    const timer = setInterval(() => {
      res.write(`data: tick ${++count}\n\n`);
      // Then silence: the idle timeout ends the stream.
      if (count === 6) clearInterval(timer);
    }, 40);
    res.on('close', () => clearInterval(timer));
  });
  try {
    const events: string[] = [];
    let opened = 0;
    const parser = createSseParser((event) => events.push(event.data));
    const response = await sendPreparedRequest({ method: 'GET', url, headers: {} }, null, {
      openHostStream: async () => {
        throw new Error('direct only');
      },
      // Shorter than the whole stream (6 × 40 ms), longer than the gap between events.
      timeoutMs: 150,
      onEventStream: { start: (status) => (opened = status), data: (chunk) => parser.feed(chunk) },
    });
    assert.equal(opened, 200);
    assert.equal(response.streamEnd, 'timeout');
    assert.equal(response.body, '');
    assert.deepEqual(events, ['tick 1', 'tick 2', 'tick 3', 'tick 4', 'tick 5', 'tick 6']);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('cancelling a stream returns the response (not an error); a closed stream ends as complete', async () => {
  const { server, url } = await sseServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: one\n\n');
    if (req.url?.includes('close')) res.end('data: two\n\n');
  });
  try {
    const controller = new AbortController();
    const deps = {
      openHostStream: async () => {
        throw new Error('direct only');
      },
      timeoutMs: 5000,
    };
    const cancelled = await sendPreparedRequest({ method: 'GET', url, headers: {} }, null, {
      ...deps,
      signal: controller.signal,
      onEventStream: { start: () => setTimeout(() => controller.abort(), 50), data: () => undefined },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.streamEnd, 'cancelled');

    let bytes = 0;
    const closed = await sendPreparedRequest({ method: 'GET', url: new URL('?close=1', url), headers: {} }, null, {
      ...deps,
      onEventStream: { start: () => undefined, data: (chunk) => (bytes += chunk.length) },
    });
    assert.equal(closed.streamEnd, 'complete');
    assert.equal(closed.size, bytes);

    // Without stream hooks the response is buffered as before.
    const buffered = await sendPreparedRequest({ method: 'GET', url: new URL('?close=1', url), headers: {} }, null, deps);
    assert.equal(buffered.body, 'data: one\n\ndata: two\n\n');
    assert.equal(buffered.streamEnd, undefined);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('a stream that never sends headers still hits the request timeout', async () => {
  const { server, url } = await sseServer(() => undefined);
  try {
    await assert.rejects(
      sendPreparedRequest({ method: 'GET', url, headers: {} }, null, {
        openHostStream: async () => {
          throw new Error('direct only');
        },
        timeoutMs: 100,
        onEventStream: { start: () => undefined, data: () => undefined },
      }),
      (error: ApiRequestError) => error.code === 'TIMEOUT'
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('event streams work through the SSH-host route (gzip-encoded too) and never dial directly', async () => {
  const { gzipSync } = await import('node:zlib');
  const net = await import('node:net');
  const { server, url } = await sseServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Content-Encoding': 'gzip' });
    res.end(gzipSync('event: hello\ndata: via host\n\n'));
  });
  try {
    const events: SseEvent[] = [];
    const parser = createSseParser((event) => events.push(event));
    const hosts: string[] = [];
    const response = await sendPreparedRequest(
      { method: 'GET', url: new URL(`http://internal.service:${url.port}/events`), headers: {} },
      'host-1',
      {
        openHostStream: async (_hostId, host) => {
          hosts.push(host);
          return net.connect(Number(url.port), '127.0.0.1');
        },
        fetch: (() => assert.fail('direct')) as never,
        timeoutMs: 2000,
        onEventStream: { start: () => undefined, data: (chunk) => parser.feed(chunk) },
      }
    );
    parser.end();
    assert.deepEqual(hosts, ['internal.service']);
    assert.equal(response.streamEnd, 'complete');
    assert.deepEqual(events.map((event) => [event.event, event.data]), [['hello', 'via host']]);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('response viewer stream buffer keeps the newest 1000 events / 5 MB and counts the rest', async () => {
  const { applyStreamMessage } = await import('../src/components/api-client/response-viewer/stream-state');
  const event = (data: string): SseEvent => ({ event: 'message', data, id: '', time: 0 });
  let state = applyStreamMessage(undefined, {
    executionId: 'x',
    kind: 'open',
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/event-stream' },
  });
  state = applyStreamMessage(state, {
    executionId: 'x',
    kind: 'events',
    events: Array.from({ length: 1200 }, (_, index) => event(String(index))),
    dropped: 3,
  });
  assert.equal(state.status, 200);
  assert.equal(state.events.length, 1000);
  assert.equal(state.events[0].data, '200');
  assert.equal(state.dropped, 203);
  const big = 'z'.repeat(1024 * 1024);
  state = applyStreamMessage(state, { executionId: 'x', kind: 'events', events: Array(6).fill(event(big)), dropped: 0 });
  assert.ok(state.chars <= 5 * 1024 * 1024);
  assert.equal(state.events.at(-1)!.data, big);
});

test('SSE: event and id fields are capped and count against the stream budgets (parser, viewer; the IPC batch uses the same sseEventChars)', async () => {
  const { MAX_SSE_FIELD_CHARS, STREAM_BUFFER_CHARS, sseEventChars } = await import('../electron/http/sse');
  const huge = 'i'.repeat(200_000);
  const [parsed] = parse([`event: ${huge}\nid: ${huge}\ndata:\n\n`]);
  assert.equal(parsed.event.length, MAX_SSE_FIELD_CHARS);
  assert.equal(parsed.id.length, MAX_SSE_FIELD_CHARS);
  assert.equal(parsed.data, '');

  // Huge fields with empty data still count, so the 5 MB budget holds.
  const event: SseEvent = { event: huge, data: '', id: huge, time: 0 };
  assert.equal(sseEventChars(event), 400_000);
  const { applyStreamMessage } = await import('../src/components/api-client/response-viewer/stream-state');
  const state = applyStreamMessage(undefined, { executionId: 'x', kind: 'events', events: Array(40).fill(event), dropped: 0 });
  assert.ok(state.chars <= STREAM_BUFFER_CHARS);
  assert.ok(state.dropped > 0);

});
