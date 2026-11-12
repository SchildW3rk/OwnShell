import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EVALUATION_DAYS,
  licenseBadgeState,
  updateLicenseCoverage,
} from '../electron/license/types';

const DAY = 86_400_000;
const firstLaunch = Date.UTC(2026, 10, 1);
const built = Date.UTC(2026, 9, 15);
const license = (updatesUntil: number) => ({ updatesUntil });

test('evaluation shows days left', () => {
  assert.deepEqual(licenseBadgeState(firstLaunch, firstLaunch, undefined, null, built), {
    kind: 'evaluation',
    daysLeft: EVALUATION_DAYS,
  });
  assert.deepEqual(licenseBadgeState(firstLaunch + 7 * DAY + 1, firstLaunch, undefined, null, built), {
    kind: 'evaluation',
    daysLeft: 23,
  });
  assert.deepEqual(
    licenseBadgeState(firstLaunch + EVALUATION_DAYS * DAY - 1, firstLaunch, undefined, null, built),
    { kind: 'evaluation', daysLeft: 1 }
  );
});

test('after evaluation without confirmation shows personal-use badge', () => {
  assert.deepEqual(
    licenseBadgeState(firstLaunch + EVALUATION_DAYS * DAY, firstLaunch, undefined, null, built),
    { kind: 'personal' }
  );
});

test('personal-use confirmation hides the badge', () => {
  const now = firstLaunch + 90 * DAY;
  assert.equal(licenseBadgeState(now, firstLaunch, now - DAY, null, built), null);
  assert.equal(licenseBadgeState(firstLaunch + DAY, firstLaunch, firstLaunch, null, built), null);
});

test('valid license hides the badge, also during evaluation', () => {
  assert.equal(licenseBadgeState(firstLaunch + DAY, firstLaunch, undefined, license(built + 365 * DAY), built), null);
});

test('expired license still covers builds released before updatesUntil', () => {
  const now = built + 3 * 365 * DAY;
  assert.equal(licenseBadgeState(now, firstLaunch, undefined, license(built + DAY), built), null);
  assert.equal(licenseBadgeState(now, firstLaunch, undefined, license(built), built), null);
});

test('build newer than updatesUntil shows uncovered badge', () => {
  assert.deepEqual(
    licenseBadgeState(built + DAY, firstLaunch, undefined, license(built - 1), built),
    { kind: 'uncovered' }
  );
  // Unknown build date (dev/test builds) never nags
  assert.equal(licenseBadgeState(built + DAY, firstLaunch, undefined, license(built - 1), undefined), null);
});

test('clock set back before first launch clamps evaluation days', () => {
  assert.deepEqual(licenseBadgeState(firstLaunch - 10 * DAY, firstLaunch, undefined, null, built), {
    kind: 'evaluation',
    daysLeft: EVALUATION_DAYS,
  });
});

test('update coverage decision', () => {
  const updatesUntil = Date.parse('2027-03-01T00:00:00.000Z');
  assert.equal(updateLicenseCoverage('2027-02-28T12:00:00.000Z', license(updatesUntil)), 'covered');
  assert.equal(updateLicenseCoverage('2027-03-01T00:00:00.000Z', license(updatesUntil)), 'covered');
  assert.equal(updateLicenseCoverage('2027-03-02T00:00:00.000Z', license(updatesUntil)), 'uncovered');
  // No license: the personal-use badge covers the reminder, the updater stays silent
  assert.equal(updateLicenseCoverage('2030-01-01T00:00:00.000Z', null), 'covered');
  // Missing or malformed release date with a license: cannot verify, no silent install
  assert.equal(updateLicenseCoverage(undefined, license(updatesUntil)), 'unknown');
  assert.equal(updateLicenseCoverage('not-a-date', license(updatesUntil)), 'unknown');
});
