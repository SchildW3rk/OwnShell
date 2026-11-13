import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@ownshell/core';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';
import { BackupManager, parseVaultJson } from '../electron/backup/backup-manager';
import { cryptoManager } from '../electron/security/crypto';
import { VAULT_MAGIC } from '../electron/backup/types';

// better-sqlite3 is built for Electron's ABI, so the tests run Kysely on node:sqlite.
function createTestDb(): Kysely<Database> {
  const sqlite = new DatabaseSync(':memory:');
  // Same schema as the app: init.ts inline migration + incremental migrations.
  const initSource = readFileSync(path.join(__dirname, '../electron/db/init.ts'), 'utf8');
  const inline = /function getInlineMigration\(\): string \{\s*return `([\s\S]*?)`;/.exec(initSource);
  assert.ok(inline, 'inline migration not found in init.ts');
  sqlite.exec(inline[1].replace(/\$\{Date\.now\(\)\}/g, String(Date.now())));
  runIncrementalMigrations(sqlite as never);
  runIncrementalMigrations(sqlite as never);
  sqlite.exec('PRAGMA foreign_keys = ON');

  return new Kysely<Database>({
    dialect: new SqliteDialect({
      database: {
        close: () => sqlite.close(),
        prepare(sql: string) {
          const statement = sqlite.prepare(sql);
          return {
            reader: statement.columns().length > 0,
            all: (params: ReadonlyArray<unknown>) => statement.all(...(params as never[])),
            run: (params: ReadonlyArray<unknown>) => statement.run(...(params as never[])),
            iterate: (params: ReadonlyArray<unknown>) => statement.iterate(...(params as never[])),
          };
        },
      },
    }),
  });
}

const db = createTestDb();
cryptoManager.init(db);
const enc = (value: string) => cryptoManager.encryptData(value);
const t = 1_700_000_000_000;
let recoveryKey = '';

async function seed() {
  // Jump host sorts before its target and references a key inserted later: restore must not
  // depend on insert order.
  await db.insertInto('keys').values({
    id: 'key-1', label: 'Key', type: 'ed25519', public_key: 'ssh-ed25519 AAA',
    private_key_encrypted: enc('PRIVATE'), passphrase_encrypted: enc('pass'),
    created_at: t, updated_at: t,
  }).execute();
  for (const [id, label, jump] of [['host-b', 'Bastion', null], ['host-a', 'App', 'host-b']] as const) {
    await db.insertInto('hosts').values({
      id, label, hostname: `${id}.example`, port: 22, username: 'root', auth_type: 'key',
      password_encrypted: enc(`pw-${id}`), key_id: 'key-1', jump_host_id: jump,
      connection_type: 'ssh', favorite: 0, folder_id: null, sort_order: 0,
      host_key_fingerprint: 'SHA256:abc', created_at: t, updated_at: t,
    }).execute();
  }
  await db.insertInto('db_connections').values({
    id: 'db-1', name: 'PG', type: 'postgres', host: 'localhost', port: 5432, database: 'app',
    username: 'u', password_encrypted: enc('db-secret'), connection_mode: 'ssh', ssh_host_id: 'host-a',
    ssh_tunnel_enabled: 1, ssl_enabled: 0, read_only: 1, color: null, created_at: t, updated_at: t,
  }).execute();
  await db.insertInto('vault_credentials').values({
    id: 'cred-1', title: 'GitHub', username: 'me', password_encrypted: enc('gh-pass'), url: null,
    notes: null, tags: '["work"]', favorite: 1, created_at: t, updated_at: t, last_used_at: null,
  }).execute();
  await db.insertInto('vault_environments').values({
    id: 'env-1', name: 'Prod', project: 'API', description: null,
    variables: JSON.stringify([{ key: 'API_KEY', value_encrypted: enc('sëcret-€') }]),
    host_id: 'host-a', default_remote_path: '/srv/.env', favorite: 0,
    created_at: t, updated_at: t, last_deployed_at: null,
  }).execute();
  await db.insertInto('projects').values({
    id: 'proj-1', name: 'Shop', host_id: 'host-a', repository_path: '/srv/shop',
    compose_project: 'shop', created_at: t, updated_at: t,
  }).execute();
  await db.insertInto('api_collections').values([
    { id: 'col-root', parent_id: null, name: 'Root', description: null, sort_order: 0, created_at: t, updated_at: t },
    { id: 'col-child', parent_id: 'col-root', name: 'Child', description: null, sort_order: 1, created_at: t, updated_at: t },
  ]).execute();
  await db.insertInto('api_requests').values({
    id: 'req-1', collection_id: 'col-child', name: 'List', method: 'GET', url: '{{BASE}}/x',
    params: '[]', headers: '[]', body: '', body_type: 'none', auth_type: 'bearer',
    auth_config: '{"token":"t"}', network_host_id: 'host-a', environment_id: 'env-1',
    sort_order: 0, created_at: t, updated_at: t, last_executed_at: null,
  }).execute();
}

function withoutTimestamp(data: unknown) {
  const { exportedAt: _ignored, ...rest } = data as { exportedAt: number };
  return rest;
}

test('backup round-trip restores every table and its secrets', async () => {
  ({ recoveryKey } = await cryptoManager.initialize('master-password'));
  await seed();
  const manager = new BackupManager(db);

  // Public self-signed test certificate (same as scripts/db-tls-options.test.ts).
  const caPem = `-----BEGIN CERTIFICATE-----
MIIBizCCATGgAwIBAgIUMOWDyufnLsLhh/7Pb6Et3xGbJEQwCgYIKoZIzj0EAwIw
GjEYMBYGA1UEAwwPZGIuZXhhbXBsZS50ZXN0MCAXDTI2MTExMjIxMjY0MloYDzIx
MjYxMDE5MjEyNjQyWjAaMRgwFgYDVQQDDA9kYi5leGFtcGxlLnRlc3QwWTATBgcq
hkjOPQIBBggqhkjOPQMBBwNCAAQWXTw/9ih0IMAHCuTXy02NF1acaA8/j7y25WGA
8a74cuVRI7Gmvvi8mVRTptS93gJnxO9SwDIjkAYB1obLa3e1o1MwUTAdBgNVHQ4E
FgQU6qKH24vppvG1PLyh7HIQKf4QXJUwHwYDVR0jBBgwFoAU6qKH24vppvG1PLyh
7HIQKf4QXJUwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiAi3dBM
Xiw0z70Xgspbr8miFLtqvrxegVhsO/JhzXeAWAIhAK9nHsj4oLdLRv2vsUTaMLmT
/H0JtX2esHR1bO8jhM6B
-----END CERTIFICATE-----
`;
  await db.updateTable('db_connections').set({ ssl_ca_encrypted: enc(caPem), ssl_ca_fingerprint: 'stale' }).execute();
  const vault = await manager.exportVault('backup-pw');
  const exported = await manager.decryptVault(vault, 'backup-pw');
  assert.equal(exported.dbConnections?.[0]?.ssl_ca, caPem, 'CA travels decrypted inside the encrypted backup');
  assert.equal(JSON.stringify(exported).includes('ssl_ca_encrypted'), false);
  assert.equal(exported.vaultEnvironments?.[0]?.variables[0]?.value, 'sëcret-€');
  assert.equal(exported.dbConnections?.[0]?.password, 'db-secret');
  assert.equal(exported.vaultCredentials?.[0]?.password, 'gh-pass');
  assert.equal(exported.projects?.length, 1);
  assert.equal(exported.apiRequests?.length, 1);

  // Mutate, then restore: everything must come back exactly.
  await db.deleteFrom('vault_credentials').execute();
  await db.updateTable('db_connections').set({ password_encrypted: enc('changed') }).execute();
  await db.insertInto('projects').values({
    id: 'proj-extra', name: 'Extra', host_id: null, repository_path: '/x', compose_project: null,
    created_at: t, updated_at: t,
  }).execute();

  await manager.restoreVault(exported);
  const restoredConn = await db.selectFrom('db_connections').select(['ssl_ca_encrypted', 'ssl_ca_fingerprint']).executeTakeFirstOrThrow();
  assert.equal(cryptoManager.decryptData(restoredConn.ssl_ca_encrypted!), caPem);
  assert.notEqual(restoredConn.ssl_ca_fingerprint, 'stale', 'fingerprint recomputed on restore');
  const reExported = await manager.decryptVault(await manager.exportVault('backup-pw'), 'backup-pw');
  assert.deepEqual(withoutTimestamp(reExported), withoutTimestamp(exported));

  await assert.rejects(manager.decryptVault(vault, 'wrong'), /Wrong password/);
});

test('old backups without the new sections leave those tables untouched', async () => {
  const manager = new BackupManager(db);
  const current = await manager.decryptVault(await manager.exportVault('pw'), 'pw');
  const legacy = parseVaultJson(
    JSON.stringify({
      version: 1, exportedAt: t, appVersion: '1.5.0',
      hosts: current.hosts, keys: current.keys, tunnels: [], snippets: [], s3Connections: [],
    })
  );
  assert.equal(legacy.vaultCredentials, undefined);
  assert.deepEqual(legacy.sidebarFolders, []);

  await manager.restoreVault(legacy);
  assert.equal((await db.selectFrom('vault_credentials').selectAll().execute()).length, 1);
  assert.equal((await db.selectFrom('vault_environments').selectAll().execute()).length, 1);
});

test('restore keeps links to restored hosts and drops history of removed hosts', async () => {
  const manager = new BackupManager(db);
  const current = await manager.decryptVault(await manager.exportVault('pw'), 'pw');
  const legacy = parseVaultJson(
    JSON.stringify({
      version: 1, exportedAt: t, appVersion: '1.5.0',
      hosts: current.hosts, keys: current.keys, tunnels: [], snippets: [], s3Connections: [],
    })
  );
  await db.insertInto('hosts').values({
    id: 'host-x', label: 'Gone', hostname: 'x.example', port: 22, username: 'root', auth_type: 'password',
    password_encrypted: null, key_id: null, jump_host_id: null, connection_type: 'ssh', favorite: 0,
    folder_id: null, sort_order: 0, host_key_fingerprint: null, created_at: t, updated_at: t,
  }).execute();
  const history = (id: string, hostId: string) => ({
    id, host_id: hostId, host_label: hostId, type: 'download' as const, status: 'completed' as const,
    local_path: '/tmp/a', remote_path: '/a', file_name: 'a', file_size: 1, transferred: 1, error: null,
    started_at: t, completed_at: t,
  });
  await db.insertInto('transfer_history').values([history('th-a', 'host-a'), history('th-x', 'host-x')]).execute();

  await manager.restoreVault(legacy);

  const historyIds = (await db.selectFrom('transfer_history').select('id').execute()).map((r) => r.id);
  assert.deepEqual(historyIds, ['th-a']);
  assert.equal((await db.selectFrom('hosts').where('id', '=', 'host-x').selectAll().execute()).length, 0);
  // Tables the legacy backup does not contain must still point at their hosts.
  const dbConn = await db.selectFrom('db_connections').select('ssh_host_id').executeTakeFirstOrThrow();
  assert.equal(dbConn.ssh_host_id, 'host-a');
  const env = await db.selectFrom('vault_environments').select('host_id').executeTakeFirstOrThrow();
  assert.equal(env.host_id, 'host-a');
});

test('vault JSON with an unexpected shape is rejected', async () => {
  assert.throws(() => parseVaultJson('{"version":1}'), /Invalid vault file/);
  assert.throws(
    () => parseVaultJson(JSON.stringify({
      version: 1, exportedAt: t, appVersion: 'x', hosts: [{ id: 1 }], keys: [], tunnels: [],
      snippets: [], s3Connections: [],
    })),
    /Invalid vault file/
  );

  // Correct password, foreign payload: must not reach the restore.
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const key = scryptSync('pw', salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(gzipSync('{"hosts":"nope"}')), cipher.final()]);
  const file = Buffer.concat([VAULT_MAGIC, Buffer.from([1]), salt, iv, cipher.getAuthTag(), body]);
  await assert.rejects(new BackupManager(db).decryptVault(file, 'pw'), /Invalid vault file/);
});

test('recovery-key reset clears every secret in one go and keeps metadata', async () => {
  cryptoManager.lock();

  const result = await cryptoManager.resetWithRecoveryKey(recoveryKey, 'new-master');
  assert.equal(result.success, true);
  assert.equal(await cryptoManager.unlock('new-master'), true);

  const hosts = await db.selectFrom('hosts').selectAll().execute();
  assert.equal(hosts.length, 2);
  assert.ok(hosts.every((host) => host.password_encrypted === null));
  const keyRow = await db.selectFrom('keys').selectAll().executeTakeFirstOrThrow();
  assert.equal(keyRow.private_key_encrypted, '');
  assert.equal(keyRow.passphrase_encrypted, null);
  const dbConn = await db.selectFrom('db_connections').selectAll().executeTakeFirstOrThrow();
  assert.equal(dbConn.password_encrypted, null);
  assert.equal(dbConn.name, 'PG');
  const cred = await db.selectFrom('vault_credentials').selectAll().executeTakeFirstOrThrow();
  assert.equal(cryptoManager.decryptData(cred.password_encrypted), '');
  const env = await db.selectFrom('vault_environments').selectAll().executeTakeFirstOrThrow();
  const variables = JSON.parse(env.variables) as Array<{ key: string; value_encrypted: string }>;
  assert.equal(variables[0]?.key, 'API_KEY');
  assert.equal(cryptoManager.decryptData(variables[0]!.value_encrypted), '');

  // Old recovery key is single-use.
  assert.equal((await cryptoManager.resetWithRecoveryKey(recoveryKey, 'x')).success, false);
});
