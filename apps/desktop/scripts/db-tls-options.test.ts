import assert from 'node:assert/strict';
import { test } from 'node:test';
import { X509Certificate } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { PeerCertificate } from 'node:tls';
import {
  buildTlsOptions,
  caCertificateFingerprint,
  resolveSslMode,
} from '../electron/db-explorer/connection/tls-options';
import { runIncrementalMigrations } from '../electron/db/incremental-migrations';

// Public self-signed test certificate for CN=db.example.test (no key needed here).
const CA_PEM = `-----BEGIN CERTIFICATE-----
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
const peer = new X509Certificate(CA_PEM).toLegacyObject() as PeerCertificate;

test('SSL modes: off, verify by default, explicit no-verify', () => {
  assert.equal(buildTlsOptions('disabled'), undefined);
  assert.equal(buildTlsOptions(undefined), undefined);
  assert.deepEqual(buildTlsOptions('require'), { rejectUnauthorized: true });
  assert.deepEqual(buildTlsOptions('require-no-verify', { ca: CA_PEM }), {
    ca: CA_PEM,
    rejectUnauthorized: false,
  });
});

test('through a tunnel, SNI and the name check use the original host, not 127.0.0.1', () => {
  const options = buildTlsOptions('require', { ca: CA_PEM, verifyHost: 'db.example.test' });
  assert.equal(options?.servername, 'db.example.test');
  assert.equal(options?.rejectUnauthorized, true);
  assert.equal(options?.checkServerIdentity?.('127.0.0.1', peer), undefined);

  const wrongHost = buildTlsOptions('require', { verifyHost: 'other.example.test' });
  assert.ok(wrongHost?.checkServerIdentity?.('127.0.0.1', peer) instanceof Error);

  // IP hosts get no SNI (not allowed) but are still checked.
  const ipHost = buildTlsOptions('require', { verifyHost: '10.0.0.5' });
  assert.equal(ipHost?.servername, undefined);
  assert.ok(ipHost?.checkServerIdentity?.('127.0.0.1', peer) instanceof Error);
});

test('CA certificates are validated and fingerprinted', () => {
  assert.equal(
    caCertificateFingerprint(CA_PEM),
    'DA:70:13:F9:22:51:3D:91:C6:C8:09:BE:B4:16:1E:CE:67:D1:48:92:F5:20:A4:21:4D:8A:26:36:0E:21:9E:2A'
  );
  assert.throws(() => caCertificateFingerprint('not a cert'));
  assert.throws(() => caCertificateFingerprint('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----'));
});

test('legacy rows: PostgreSQL/MySQL keep working unverified, Redis/MongoDB keep verifying', () => {
  assert.equal(resolveSslMode({ type: 'postgres', ssl_enabled: 1 }), 'require-no-verify');
  assert.equal(resolveSslMode({ type: 'mysql', ssl_enabled: 1, ssl_mode: null }), 'require-no-verify');
  assert.equal(resolveSslMode({ type: 'redis', ssl_enabled: 1 }), 'require');
  assert.equal(resolveSslMode({ type: 'mongodb', ssl_enabled: 0 }), 'disabled');
  assert.equal(resolveSslMode({ type: 'postgres', ssl_enabled: 1, ssl_mode: 'require' }), 'require');
  assert.equal(resolveSslMode({ type: 'postgres', ssl_enabled: 1, ssl_mode: 'bogus' }), 'require-no-verify');
});

test('migration maps existing SSL connections and flags the unverified ones once', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE db_connections (id TEXT PRIMARY KEY, type TEXT, ssl_enabled INTEGER);
    INSERT INTO db_connections VALUES ('pg', 'postgres', 1), ('my', 'mysql', 0),
      ('mongo', 'mongodb', 1), ('redis', 'redis', 0);
  `);
  runIncrementalMigrations(sqlite as never);
  runIncrementalMigrations(sqlite as never);
  const rows = sqlite
    .prepare('SELECT id, ssl_mode, ssl_legacy_hint, ssl_ca_encrypted FROM db_connections ORDER BY id')
    .all()
    .map((row) => ({ ...row }));
  assert.deepEqual(rows, [
    { id: 'mongo', ssl_mode: 'require', ssl_legacy_hint: 0, ssl_ca_encrypted: null },
    { id: 'my', ssl_mode: 'disabled', ssl_legacy_hint: 0, ssl_ca_encrypted: null },
    { id: 'pg', ssl_mode: 'require-no-verify', ssl_legacy_hint: 1, ssl_ca_encrypted: null },
    { id: 'redis', ssl_mode: 'disabled', ssl_legacy_hint: 0, ssl_ca_encrypted: null },
  ]);
});
