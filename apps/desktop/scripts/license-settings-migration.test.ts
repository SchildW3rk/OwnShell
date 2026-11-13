import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';

test('migration 021 drops the removed license settings and keeps all other settings', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  const insert = sqlite.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, 1)');
  const removed = [
    'license_key_encrypted',
    'license_instance_id',
    'license_entitlement_token',
    'evaluation_started_at',
    'personal_use_confirmed_at',
    // keys of the older subscription model, found in real profiles
    'license_status',
    'license_type',
    'license_ever_activated',
    'license_entitlement_expires_at',
  ];
  for (const key of [...removed, 'master_password_hash', 'language', 'licensexyz']) insert.run(key, 'x');

  runIncrementalMigrations(sqlite as never);
  runIncrementalMigrations(sqlite as never);

  const keys = (sqlite.prepare('SELECT key FROM app_settings ORDER BY key').all() as Array<{ key: string }>).map(
    (row) => row.key
  );
  assert.deepEqual(keys, ['language', 'licensexyz', 'master_password_hash']);
});
