import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getUpdatesUntilSeconds,
  instanceNameForDevice,
  isInstanceBoundToDevice,
} from '../src/license-rules.ts';

const deviceA = 'a'.repeat(64);
const deviceB = 'b'.repeat(64);
const key = (fields) => ({ id: 1, status: 'active', key: 'k', ...fields });

test('instance is bound to the device that activated it', () => {
  assert.equal(isInstanceBoundToDevice(instanceNameForDevice(deviceA), deviceA), true);
  assert.equal(isInstanceBoundToDevice(instanceNameForDevice(deviceA), deviceB), false);
  assert.equal(isInstanceBoundToDevice(`OwnShell darwin ${deviceA.slice(0, 10)}`, deviceA), false);
  assert.equal(isInstanceBoundToDevice(undefined, deviceA), false);
});

test('updatesUntil uses expiry, then order date + 1 year', () => {
  assert.equal(
    getUpdatesUntilSeconds(key({ expires_at: '2027-03-01T00:00:00.000Z', created_at: '2020-01-01' })),
    Date.parse('2027-03-01T00:00:00.000Z') / 1000
  );
  assert.equal(
    getUpdatesUntilSeconds(key({ expires_at: null, created_at: '2026-03-01T00:00:00.000Z' })),
    Date.parse('2026-03-01T00:00:00.000Z') / 1000 + 365 * 24 * 60 * 60
  );
});

test('updatesUntil without a reliable date issues no coverage', () => {
  assert.equal(getUpdatesUntilSeconds(key({ expires_at: 'garbage', created_at: 'garbage' })), null);
  assert.equal(getUpdatesUntilSeconds(key({})), null);
  assert.equal(getUpdatesUntilSeconds(undefined), null);
});
