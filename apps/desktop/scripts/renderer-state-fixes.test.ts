import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertIpcSuccess } from '../src/lib/ipcResult';
import {
  appendTerminalHistory,
  clearTerminalHistory,
  getTerminalHistory,
} from '../src/components/terminal-view/runtime';
import { parseAutoLockMinutes } from '../electron/ipc/crypto';

test('assertIpcSuccess throws the returned IPC error and passes other results through', () => {
  assert.throws(
    () => assertIpcSuccess({ success: false, error: 'Invalid IPC payload' }),
    /Invalid IPC payload/
  );
  assert.throws(() => assertIpcSuccess({ success: false }, 'Failed to create host'), /Failed to create host/);
  assert.deepEqual(assertIpcSuccess({ success: true }), { success: true });
  const snippet = { id: 's1' };
  assert.equal(assertIpcSuccess(snippet), snippet);
  assert.equal(assertIpcSuccess(undefined), undefined);
});

test('terminal history is bounded and keeps the newest output', () => {
  const id = 'term-1';
  appendTerminalHistory(id, 'hello ');
  appendTerminalHistory(id, 'world');
  assert.equal(getTerminalHistory(id), 'hello world');

  appendTerminalHistory(id, 'x'.repeat(300 * 1024));
  const history = getTerminalHistory(id);
  assert.equal(history.length, 256 * 1024);
  assert.ok(!history.startsWith('hello'));

  appendTerminalHistory(id, 'tail');
  assert.ok(getTerminalHistory(id).endsWith('tail'));
  assert.ok(getTerminalHistory(id).length <= 256 * 1024);

  clearTerminalHistory(id);
  assert.equal(getTerminalHistory(id), '');
});

test('stored auto-lock timeout falls back to 5 minutes when invalid', () => {
  assert.equal(parseAutoLockMinutes('15'), 15);
  assert.equal(parseAutoLockMinutes('60'), 60);
  assert.equal(parseAutoLockMinutes(null), 5);
  assert.equal(parseAutoLockMinutes('0'), 5);
  assert.equal(parseAutoLockMinutes('61'), 5);
  assert.equal(parseAutoLockMinutes('2.5'), 5);
  assert.equal(parseAutoLockMinutes('abc'), 5);
});
