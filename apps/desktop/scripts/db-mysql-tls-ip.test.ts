import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MySQLAdapter } from '../electron/db-explorer/adapters/mysql-adapter';

// Port 1 on loopback is refused at once, so nothing here waits on a network timeout.
const adapter = (host: string, tlsHost?: string, ssl: { rejectUnauthorized?: boolean } = {}) =>
  new MySQLAdapter({ host, port: 1, username: 'u', password: 'p', ssl, tlsHost });

test('MySQL refuses certificate verification against an IP host (mysql2 would check "localhost")', async () => {
  for (const a of [
    adapter('127.0.0.1'),
    adapter('::1'),
    adapter('127.0.0.1', '10.0.0.5'),
    adapter('127.0.0.1', 'fd00::5'),
    adapter('127.0.0.1', undefined, { rejectUnauthorized: true }),
  ]) {
    await assert.rejects(a.connect(), { code: 'MYSQL_TLS_IP_HOST' });
  }
});

test('MySQL with a host name or without verification reaches the driver', async () => {
  for (const a of [adapter('127.0.0.1', 'db.internal'), adapter('127.0.0.1', undefined, { rejectUnauthorized: false })]) {
    await assert.rejects(a.connect(), { code: 'ECONNREFUSED' });
    await a.disconnect();
  }
});
