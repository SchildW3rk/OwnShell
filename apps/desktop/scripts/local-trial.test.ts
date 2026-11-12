import assert from 'node:assert/strict';
import { safeStorage } from 'electron';
import { SETTINGS_KEYS } from '@ownshell/core';
import { LocalTrial } from '../electron/license/local-trial';

const DAY = 86_400_000;

async function runTests() {
  const values = new Map<string, string>();
  const settings = {
    get: async (key: string) => values.get(key),
    set: async (setting: { key: string; value: string }) => { values.set(setting.key, setting.value); },
  };
  let now = Date.UTC(2026, 10, 8, 12);
  const trial = new LocalTrial(settings, 'device-a', () => now);
  assert.equal((await trial.getStatus()).canStartTrial, true);
  const [first, repeated] = await Promise.all([trial.start(), trial.start()]);
  assert.equal(first.status, 'trial');
  assert.equal(first.trialDaysLeft, 14);
  assert.equal(first.trialExpiresAt, Date.UTC(2026, 10, 22, 12));
  assert.equal(repeated.trialExpiresAt, first.trialExpiresAt);
  assert.equal(values.get(SETTINGS_KEYS.LICENSE_EVER_ACTIVATED), 'true');
  const record = values.get(SETTINGS_KEYS.TRIAL_START)!;
  assert.ok(!record.includes('device-a'), 'device-bound trial data must be protected at rest');

  now += 7 * DAY;
  const restarted = new LocalTrial(settings, 'device-a', () => now);
  assert.equal((await restarted.getStatus()).trialDaysLeft, 7);
  assert.equal((await restarted.start()).trialExpiresAt, first.trialExpiresAt);
  assert.equal(values.get(SETTINGS_KEYS.TRIAL_START), record, 'restart/repeated start must preserve the original deadline');

  now = first.trialExpiresAt! - 1;
  assert.equal((await restarted.getStatus()).status, 'trial');
  assert.equal((await restarted.getStatus()).trialDaysLeft, 1);
  now += 1;
  assert.equal((await restarted.getStatus()).status, 'expired');
  assert.equal((await restarted.getStatus()).canStartTrial, false);
  assert.equal((await restarted.start()).status, 'expired');
  assert.equal(values.get(SETTINGS_KEYS.TRIAL_START), record);

  const isolatedSettings = () => {
    const copy = new Map(values);
    copy.set(SETTINGS_KEYS.TRIAL_START, record);
    copy.set(SETTINGS_KEYS.LICENSE_STATUS, 'trial');
    return {
      get: async (key: string) => copy.get(key),
      set: async (setting: { key: string; value: string }) => { copy.set(setting.key, setting.value); },
    };
  };
  const temporarilyLocked = new LocalTrial(isolatedSettings(), 'device-a', () => first.trialExpiresAt! - DAY);
  const decryptString = safeStorage.decryptString;
  try {
    safeStorage.decryptString = () => { throw new Error('Test keychain temporarily locked'); };
    assert.equal((await temporarilyLocked.getStatus()).canStartTrial, false);
  } finally {
    safeStorage.decryptString = decryptString;
  }
  assert.equal((await temporarilyLocked.getStatus()).status, 'trial', 'temporary OS storage failure must not consume or reset the trial');
  assert.equal((await temporarilyLocked.getStatus()).trialExpiresAt, first.trialExpiresAt);
  const otherDevice = new LocalTrial(isolatedSettings(), 'device-b', () => first.trialExpiresAt! - DAY);
  assert.equal((await otherDevice.getStatus()).status, 'expired');
  const beforeStart = new LocalTrial(isolatedSettings(), 'device-a', () => Date.UTC(2026, 10, 8, 11));
  assert.equal((await beforeStart.getStatus()).status, 'expired');
  values.set(SETTINGS_KEYS.LICENSE_STATUS, 'trial');
  values.set(SETTINGS_KEYS.TRIAL_START, 'corrupted-record');
  const corrupted = new LocalTrial(settings, 'device-a', () => first.trialExpiresAt! - DAY);
  assert.equal((await corrupted.getStatus()).status, 'expired');
  values.delete(SETTINGS_KEYS.TRIAL_START);
  values.set(SETTINGS_KEYS.LICENSE_STATUS, 'none');
  assert.equal((await restarted.getStatus()).canStartTrial, false, 'activation history must block another trial when its record is absent');
  assert.equal((await restarted.start()).status, 'expired');
  console.log('local-trial lifecycle tests passed');
}

runTests().catch(error => { console.error(error); process.exitCode = 1; });
