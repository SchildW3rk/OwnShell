import assert from 'node:assert/strict';
import { test } from 'node:test';
import en from '../src/i18n/locales/en/common.json';
import de from '../src/i18n/locales/de/common.json';

function flatKeys(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === 'object' ? flatKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  );
}

test('en and de locales define the same keys', () => {
  const enKeys = new Set(flatKeys(en));
  const deKeys = new Set(flatKeys(de));
  assert.deepEqual([...enKeys].filter((key) => !deKeys.has(key)), [], 'missing in de');
  assert.deepEqual([...deKeys].filter((key) => !enKeys.has(key)), [], 'missing in en');
});
