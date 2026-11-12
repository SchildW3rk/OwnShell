import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import {
  createHostVerifier,
  decideHostKey,
  hostKeyFingerprint,
  hostKeyMismatchMessage,
  type HostKeyCheck,
} from '../electron/ssh/host-key';
import { collectRemoteFiles, isSafeRemoteName } from '../electron/sftp/bulk-transfer/collector';

test('decideHostKey: trust on first use, then require the same key', () => {
  assert.equal(decideHostKey(null, 'SHA256:a'), 'trust-new');
  assert.equal(decideHostKey('SHA256:a', 'SHA256:a'), 'match');
  assert.equal(decideHostKey('SHA256:a', 'SHA256:b'), 'mismatch');
});

test('hostKeyFingerprint is OpenSSH-style SHA256 base64 without padding', () => {
  const key = Buffer.from('server-key');
  const expected = createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
  assert.equal(hostKeyFingerprint(key), `SHA256:${expected}`);
});

const verifyWith = (check: HostKeyCheck, key: string) =>
  new Promise<boolean>((resolve) => createHostVerifier(check)(Buffer.from(key), resolve));

/** In-memory stand-in for HostQueries.claimHostKey: store only if nothing is stored yet. */
function fakeStore() {
  let stored: string | null = null;
  return (fingerprint: string) => {
    stored ??= fingerprint;
    return Promise.resolve(stored);
  };
}

test('host verifier accepts a new key, refuses a changed one and explains why', async () => {
  const first: HostKeyCheck = { hostId: 'h1', expected: null, claim: fakeStore() };
  assert.equal(await verifyWith(first, 'k1'), true);
  assert.equal(first.seen, hostKeyFingerprint(Buffer.from('k1')));
  assert.equal(hostKeyMismatchMessage(first, 'srv'), null);

  const changed: HostKeyCheck = { hostId: 'h1', expected: first.seen! };
  assert.equal(await verifyWith(changed, 'k2'), false);
  const message = hostKeyMismatchMessage(changed, 'srv');
  assert.ok(message?.includes(first.seen!));
  assert.ok(message?.includes(hostKeyFingerprint(Buffer.from('k2'))));
  assert.ok(message?.includes('changed'));
});

test('concurrent first connections: only the first key is trusted', async () => {
  const claim = fakeStore();
  const legit: HostKeyCheck = { hostId: 'h1', expected: null, claim };
  const attacker: HostKeyCheck = { hostId: 'h1', expected: null, claim };
  const [legitOk, attackerOk] = await Promise.all([verifyWith(legit, 'real'), verifyWith(attacker, 'evil')]);
  assert.equal(legitOk, true);
  assert.equal(attackerOk, false);
  assert.ok(hostKeyMismatchMessage(attacker, 'srv')?.includes('changed'));
});

test('unknown key is refused when it cannot be stored', async () => {
  assert.equal(await verifyWith({ hostId: 'h1', expected: null }, 'k1'), false);
  const failing: HostKeyCheck = { hostId: 'h1', expected: null, claim: () => Promise.reject(new Error('db')) };
  assert.equal(await verifyWith(failing, 'k1'), false);
});

test('isSafeRemoteName rejects names that could escape the target folder', () => {
  assert.equal(isSafeRemoteName('file.txt'), true);
  assert.equal(isSafeRemoteName('.zshrc'), true);
  for (const bad of ['', '.', '..', '../../.zshrc', 'a/b', 'a\\b', 'x\0y']) {
    assert.equal(isSafeRemoteName(bad), false, bad);
  }
});

test('collectRemoteFiles refuses traversal names and propagates listing errors', async () => {
  const listing = (entries: Array<{ name: string; type: string; size: number }>) =>
    ({ list: async () => entries }) as never;

  await assert.rejects(
    collectRemoteFiles(
      listing([{ name: '../../.zshrc', type: 'file', size: 1 }]),
      '/r',
      '/l',
      'h',
      []
    ),
    /unsafe remote file name/
  );

  const failing = { list: async () => Promise.reject(new Error('permission denied')) } as never;
  await assert.rejects(collectRemoteFiles(failing, '/r', '/l', 'h', []), /permission denied/);

  const items: never[] = [];
  await collectRemoteFiles(
    listing([{ name: 'ok.txt', type: 'file', size: 3 }]),
    '/r',
    '/l',
    'h',
    items
  );
  assert.equal(items.length, 1);
});
