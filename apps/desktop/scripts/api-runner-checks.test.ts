import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyCaptures,
  evaluateAssertions,
  parseAssertions,
  parseJsonPath,
  resolveJsonPath,
  type Assertion,
} from '../electron/http/runner-checks';

const doc = {
  data: { items: [{ id: 7, name: 'a' }, { id: 8, tags: ['x', 'y'] }], 'odd key': true, n: null },
  token: 'secret-token',
};

test('JSON path parser: dot, bracket, quoted keys, optional $; malformed is null', () => {
  assert.deepEqual(parseJsonPath('$.data.items[1].id'), ['data', 'items', 1, 'id']);
  assert.deepEqual(parseJsonPath('data.items.0.name'), ['data', 'items', 0, 'name']);
  assert.deepEqual(parseJsonPath(`data["odd key"]`), ['data', 'odd key']);
  assert.deepEqual(parseJsonPath(`data['it\\'s']`), ['data', "it's"]);
  assert.deepEqual(parseJsonPath('$'), []);
  assert.equal(parseJsonPath('data..x'), null);
  assert.equal(parseJsonPath('data[x]'), null);
  assert.equal(parseJsonPath('data)'), null);
  assert.equal(parseJsonPath('a' + '.a'.repeat(100)), null);
});

test('JSON path resolver: values, null, out of range, no prototype access', () => {
  assert.deepEqual(resolveJsonPath(doc, '$.data.items[0].id'), { found: true, value: 7 });
  assert.deepEqual(resolveJsonPath(doc, 'data.n'), { found: true, value: null });
  assert.deepEqual(resolveJsonPath(doc, 'data.items[5]'), { found: false });
  assert.deepEqual(resolveJsonPath(doc, 'data.constructor'), { found: false });
  assert.deepEqual(resolveJsonPath(doc, 'data.__proto__'), { found: false });
  assert.deepEqual(resolveJsonPath([1, 2], '[1]'), { found: true, value: 2 });
  assert.deepEqual(resolveJsonPath('text', 'length'), { found: false });
});

const check = (type: Assertion['type'], target: string, value: string): Assertion => ({
  id: `${type}:${target}:${value}`,
  enabled: true,
  type,
  target,
  value,
});

test('assertions: status, headers, time and JSON', () => {
  const response = {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
    time: 120,
  };
  const results = evaluateAssertions(
    [
      check('status-equals', '', '200, 201'),
      check('status-range', '', '200-299'),
      check('status-range', '', 'nonsense'),
      check('header-exists', 'content-type', ''),
      check('header-equals', 'CONTENT-TYPE', 'application/json'),
      check('header-exists', 'x-missing', ''),
      check('time-below', '', '500'),
      check('time-below', '', '100'),
      check('json-equals', 'data.items[0].id', '7'),
      check('json-equals', 'data.items[0].name', 'a'),
      check('json-equals', 'data.items[0].name', '"a"'),
      check('json-equals', 'data.items[1].tags', '["x","y"]'),
      check('json-equals', 'data.n', 'null'),
      check('json-exists', 'data.n', ''),
      check('json-exists', 'data.nope', ''),
      check('json-contains', 'data.items[1].tags', 'y'),
      check('json-contains', 'token', 'secret'),
      check('json-contains', 'data.items[0].id', '7'),
      { ...check('status-equals', '', '500'), enabled: false },
    ],
    response
  );
  assert.deepEqual(
    results.map((result) => result.passed),
    [true, true, false, true, true, false, true, false, true, true, true, true, true, true, false, true, true, false]
  );
  assert.equal(results[0].actual, '201');
});

test('assertions: JSON checks fail on a non-JSON body; actual text is truncated', () => {
  const [exists, equals] = evaluateAssertions(
    [check('json-exists', 'a', ''), check('header-equals', 'x', 'y')],
    { status: 200, headers: { x: 'z'.repeat(500) }, body: '<html>', time: 1 }
  );
  assert.equal(exists.passed, false);
  assert.equal(equals.passed, false);
  assert.ok(equals.actual!.length <= 201);
});

test('stored assertions: invalid entries and non-arrays are dropped', () => {
  assert.deepEqual(parseAssertions('nope'), []);
  assert.deepEqual(parseAssertions('{}'), []);
  const parsed = parseAssertions(JSON.stringify([check('status-equals', '', '200'), { type: 'eval', code: 'x' }]));
  assert.equal(parsed.length, 1);
});

test('captures: strings stay raw, other values as JSON, missing paths and non-JSON capture nothing', () => {
  const into: Record<string, string> = Object.create(null);
  const captured = applyCaptures(
    [
      { id: '1', enabled: true, variable: 'token', path: 'token' },
      { id: '2', enabled: true, variable: 'firstId', path: 'data.items[0].id' },
      { id: '3', enabled: true, variable: 'tags', path: 'data.items[1].tags' },
      { id: '4', enabled: true, variable: 'missing', path: 'nope' },
      { id: '5', enabled: false, variable: 'off', path: 'token' },
      { id: '6', enabled: true, variable: '__proto__', path: 'token' },
    ],
    JSON.stringify(doc),
    into
  );
  assert.deepEqual(captured, ['token', 'firstId', 'tags', '__proto__']);
  assert.equal(into.token, 'secret-token');
  assert.equal(into.firstId, '7');
  assert.equal(into.tags, '["x","y"]');
  assert.equal(Object.prototype.hasOwnProperty.call(into, '__proto__'), true);
  assert.equal(Object.getPrototypeOf(into), null);
  assert.deepEqual(applyCaptures([{ id: '1', enabled: true, variable: 'a', path: 'a' }], 'not json', into), []);
  assert.throws(() => applyCaptures([], '{}', {}));
});

test('runner: sequential, chaining through captured values, skip websocket, stop on first failure, cancel', async () => {
  const { runRequests } = await import('../electron/http/collection-runner');
  const row = (id: string, extra: Record<string, unknown> = {}) =>
    ({
      id,
      name: id,
      method: 'GET',
      url: `https://api.test/${id}`,
      params: '[]',
      headers: '[]',
      body: '',
      body_type: 'none',
      raw_content_type: 'text',
      auth_type: 'none',
      auth_config: '{}',
      collection_id: 'c',
      network_host_id: null,
      environment_id: null,
      sort_order: 0,
      timeout_seconds: null,
      follow_redirects: null,
      verify_tls: null,
      variables: '[]',
      cookie_jar: null,
      kind: 'http',
      assertions: '[]',
      captures: '[]',
      created_at: 0,
      updated_at: 0,
      last_executed_at: null,
      ...extra,
    }) as never;
  const requests = [
    row('login', {
      captures: JSON.stringify([{ id: '1', enabled: true, variable: 'token', path: 'auth.token' }]),
      assertions: JSON.stringify([check('status-equals', '', '200')]),
    }),
    row('socket', { kind: 'websocket' }),
    row('me', { assertions: JSON.stringify([check('json-equals', 'user', '"ada"')]) }),
    row('broken', { assertions: JSON.stringify([check('status-range', '', '200-299')]) }),
    row('after'),
  ];
  const seen: Array<[string, string | undefined]> = [];
  const send = async (config: { url: string }, runtime: Record<string, string>) => {
    seen.push([config.url, runtime.token]);
    const id = config.url.split('/').pop();
    const body = id === 'login' ? '{"auth":{"token":"t-1"}}' : id === 'me' ? '{"user":"ada"}' : '{}';
    return { status: id === 'broken' ? 500 : 200, statusText: '', headers: {}, body, time: 5, size: body.length };
  };

  const summary = await runRequests(requests, { stopOnFailure: true, signal: new AbortController().signal, send });
  assert.deepEqual(seen, [
    ['https://api.test/login', undefined],
    ['https://api.test/me', 't-1'],
    ['https://api.test/broken', 't-1'],
  ]);
  assert.deepEqual(
    summary.results.map((result) => [result.name, result.passed, result.skipped ?? null, result.captured]),
    [
      ['login', true, null, ['token']],
      ['socket', true, 'websocket', []],
      ['me', true, null, []],
      ['broken', false, null, []],
    ]
  );
  assert.equal(summary.cancelled, false);

  const all = await runRequests(requests, { stopOnFailure: false, signal: new AbortController().signal, send });
  assert.equal(all.results.length, 5);

  // A failed send (no response) fails the request without evaluating assertions.
  const failing = await runRequests([requests[0]], {
    stopOnFailure: false,
    signal: new AbortController().signal,
    send: async () => ({ status: 0, statusText: 'Error', headers: {}, body: '{"error":"refused"}', time: 1, size: 0, errorCode: 'TIMEOUT' }),
  });
  assert.equal(failing.results[0].passed, false);
  assert.equal(failing.results[0].errorMessage, 'refused');
  assert.deepEqual(failing.results[0].assertions, []);

  const controller = new AbortController();
  const cancelled = await runRequests(requests, {
    stopOnFailure: false,
    signal: controller.signal,
    send: async (config, runtime) => {
      controller.abort();
      return send(config, runtime);
    },
  });
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.results.length, 0);
});
