import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ENTITLEMENT_REFRESH_WINDOW_MS,
  REFRESH_FAILURE_BACKOFF_MS,
  RefreshGate,
  shouldRefreshEntitlement,
  type EntitlementPayload,
} from '../electron/license/entitlement';

const now = Date.UTC(2026, 10, 12);
const payload = (expiresInMs: number) => ({ exp: (now + expiresInMs) / 1000 }) as EntitlementPayload;

test('refresh decision', () => {
  const base = { hasLicenseKey: true, now };
  // Missing/invalid token or one close to exp: refresh so a renewal extends updatesUntil
  assert.equal(shouldRefreshEntitlement({ ...base, payload: undefined }), true);
  assert.equal(shouldRefreshEntitlement({ ...base, payload: payload(1000) }), true);
  assert.equal(shouldRefreshEntitlement({ ...base, payload: payload(-1000) }), true);
  assert.equal(
    shouldRefreshEntitlement({ ...base, payload: payload(ENTITLEMENT_REFRESH_WINDOW_MS + 1) }),
    false
  );
  // No key (deactivated, recovery reset, locked app): never call the API
  assert.equal(shouldRefreshEntitlement({ ...base, hasLicenseKey: false }), false);
});

test('refresh gate shares one request and backs off after failure', async () => {
  let clock = now;
  let calls = 0;
  const gate = new RefreshGate<string>(() => clock);
  let fail = true;
  const task = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (fail) throw new Error('offline');
    return 'ok';
  };

  const first = gate.run(task);
  const second = gate.run(task);
  assert.equal(first, second);
  await assert.rejects(first!, /offline/);
  assert.equal(calls, 1);

  assert.equal(gate.run(task), null, 'backing off');
  clock += REFRESH_FAILURE_BACKOFF_MS;
  fail = false;
  assert.equal(await gate.run(task), 'ok');
  assert.equal(await gate.run(task), 'ok', 'success clears the back-off');
  assert.equal(calls, 3);
});
