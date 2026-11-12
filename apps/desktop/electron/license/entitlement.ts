import { createPublicKey, verify as verifySignature } from 'crypto';

export type EntitlementStatus = 'active' | 'trial';

export interface EntitlementPayload {
  iss: string;
  aud: string;
  sub: string;
  status: EntitlementStatus;
  deviceId: string;
  licenseType?: string;
  licenseKeyId?: number;
  instanceId?: string;
  features: string[];
  iat: number;
  nbf: number;
  exp: number;
}

export interface EntitlementVerification {
  valid: boolean;
  reason?: string;
  payload?: EntitlementPayload;
}

const ENTITLEMENT_ISSUER = 'ownshell-license-api';
const ENTITLEMENT_AUDIENCE = 'ownshell-desktop';
const CLOCK_TOLERANCE_SECONDS = 60;

const ENTITLEMENT_PUBLIC_KEYS = [
  {
    kid: 'ownshell-license-2026-06',
    jwk: {
      kty: 'EC',
      x: '7NAfubTkGbHg4eTPbY-FiMHIOKoh3ZVneBiRy84mc8w',
      y: 'GrpFolJ_2XFY8cVZXPYT_gnPNZE_2Tvwufb6OvHGtrk',
      crv: 'P-256',
    },
  },
] as const;

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function parseJsonPart<T>(input: string): T {
  return JSON.parse(base64UrlDecode(input).toString('utf8')) as T;
}

function isEntitlementPayload(value: unknown): value is EntitlementPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.iss === 'string' &&
    typeof payload.aud === 'string' &&
    typeof payload.sub === 'string' &&
    (payload.status === 'active' || payload.status === 'trial') &&
    typeof payload.deviceId === 'string' &&
    /^[a-f0-9]{64}$/i.test(payload.deviceId) &&
    Array.isArray(payload.features) &&
    payload.features.every((feature) => typeof feature === 'string' && feature.length > 0) &&
    typeof payload.iat === 'number' &&
    typeof payload.nbf === 'number' &&
    typeof payload.exp === 'number'
  );
}

function getPublicKey(kid: unknown) {
  if (typeof kid !== 'string') {
    return null;
  }

  const key = ENTITLEMENT_PUBLIC_KEYS.find((candidate) => candidate.kid === kid);
  if (!key) {
    return null;
  }

  return createPublicKey({ key: key.jwk, format: 'jwk' });
}

export function verifyEntitlementToken(
  token: string,
  expectedDeviceId: string,
  nowMs = Date.now()
): EntitlementVerification {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, reason: 'Malformed entitlement token' };
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return { valid: false, reason: 'Malformed entitlement token' };
    }

    const header = parseJsonPart<{ alg?: string; typ?: string; kid?: string }>(encodedHeader);
    if (header.typ !== 'JWT' || header.alg !== 'ES256') {
      return { valid: false, reason: 'Unsupported entitlement token header' };
    }

    const publicKey = getPublicKey(header.kid);
    if (!publicKey) {
      return { valid: false, reason: 'Unknown entitlement signing key' };
    }

    const signature = base64UrlDecode(encodedSignature);
    const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8');
    const signatureValid = verifySignature(
      'sha256',
      signingInput,
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      signature
    );

    if (!signatureValid) {
      return { valid: false, reason: 'Invalid entitlement signature' };
    }

    const payload = parseJsonPart<unknown>(encodedPayload);
    if (!isEntitlementPayload(payload)) {
      return { valid: false, reason: 'Invalid entitlement payload' };
    }

    if (payload.iss !== ENTITLEMENT_ISSUER || payload.aud !== ENTITLEMENT_AUDIENCE) {
      return { valid: false, reason: 'Invalid entitlement issuer or audience' };
    }

    if (payload.deviceId !== expectedDeviceId) {
      return { valid: false, reason: 'Entitlement belongs to another device' };
    }

    const now = Math.floor(nowMs / 1000);
    if (payload.nbf > now + CLOCK_TOLERANCE_SECONDS) {
      return { valid: false, reason: 'Entitlement is not active yet' };
    }

    if (payload.exp <= now - CLOCK_TOLERANCE_SECONDS) {
      return { valid: false, reason: 'Entitlement expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : 'Could not verify entitlement token',
    };
  }
}

export function getEntitlementExpiresAt(payload: EntitlementPayload): number {
  return payload.exp * 1000;
}

export const ENTITLEMENT_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REFRESH_FAILURE_BACKOFF_MS = 10 * 60 * 1000;

/**
 * Whether getStatus should ask the license API for a new entitlement.
 * A stored key with a missing/expired/invalid token is always retried, so a license that
 * expired while offline recovers on its own instead of needing a new activation.
 */
export function shouldRefreshEntitlement(input: {
  storedStatus: string | undefined;
  hasLicenseKey: boolean;
  payload?: EntitlementPayload;
  now: number;
}): boolean {
  if (!input.hasLicenseKey || !input.storedStatus || input.storedStatus === 'none') return false;
  if (!input.payload) return true;
  return (
    input.payload.status === 'active' &&
    getEntitlementExpiresAt(input.payload) - input.now <= ENTITLEMENT_REFRESH_WINDOW_MS
  );
}

/** Runs one shared refresh at a time and skips new attempts for a while after a failure. */
export class RefreshGate<T> {
  private inFlight: Promise<T> | null = null;
  private retryAt = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly backoffMs = REFRESH_FAILURE_BACKOFF_MS
  ) {}

  /** Returns null while backing off. */
  run(task: () => Promise<T>): Promise<T> | null {
    if (this.inFlight) return this.inFlight;
    if (this.now() < this.retryAt) return null;
    this.inFlight = task()
      .then(
        (value) => {
          this.retryAt = 0;
          return value;
        },
        (error: unknown) => {
          this.retryAt = this.now() + this.backoffMs;
          throw error;
        }
      )
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
}
