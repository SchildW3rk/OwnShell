/**
 * SSH host key trust-on-first-use (TOFU).
 *
 * Kept free of Electron/logger imports: the terminal worker thread uses it too.
 */

import { createHash } from 'crypto';

export interface HostKeyCheck {
  hostId: string;
  /** Fingerprint stored on the host record; null until the first successful connect. */
  expected: string | null;
  /** Fingerprint the server presented during the last handshake. */
  seen?: string;
  /**
   * Atomically stores the fingerprint if none is stored yet and resolves to the fingerprint on
   * record. Runs inside the handshake, before credentials are sent, so of two concurrent first
   * connections only the first key is trusted. Not cloneable: stripped before postMessage.
   */
  claim?: (fingerprint: string) => Promise<string | null>;
}

export type HostKeyDecision = 'trust-new' | 'match' | 'mismatch';

/** OpenSSH-style fingerprint of the raw public key blob ("SHA256:<base64>"). */
export function hostKeyFingerprint(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

export function decideHostKey(expected: string | null, seen: string): HostKeyDecision {
  if (!expected) return 'trust-new';
  return expected === seen ? 'match' : 'mismatch';
}

/**
 * ssh2 `hostVerifier` (async form): refuses a changed key; an unknown key is only accepted once
 * `claim` has stored it, and refused when there is no `claim` or storing fails.
 */
export function createHostVerifier(check: HostKeyCheck) {
  return (key: Buffer, verify: (valid: boolean) => void): void => {
    const seen = hostKeyFingerprint(key);
    check.seen = seen;
    if (check.expected || !check.claim) {
      verify(check.expected !== null && check.expected === seen);
      return;
    }
    check.claim(seen).then(
      (stored) => {
        check.expected = stored;
        verify(stored === seen);
      },
      () => verify(false)
    );
  };
}

/** Readable error for a refused handshake, or null if the key was not the cause. */
export function hostKeyMismatchMessage(
  check: HostKeyCheck | undefined,
  label: string
): string | null {
  if (!check?.seen || decideHostKey(check.expected, check.seen) !== 'mismatch') return null;
  return (
    `Host key for ${label} has changed (possible man-in-the-middle attack). ` +
    `Stored: ${check.expected}, received: ${check.seen}. ` +
    'If the server key was rotated on purpose, reset the stored host key in the host settings.'
  );
}
