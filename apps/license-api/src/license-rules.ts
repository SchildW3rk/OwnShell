// Pure license rules, kept free of Worker APIs so `node --test` can run them directly.

export interface LemonLicenseKey {
  id: number;
  status: string;
  key: string;
  activation_limit?: number;
  activation_usage?: number;
  created_at?: string;
  expires_at?: string | null;
}

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Lemon Squeezy instance name for a device. The deviceId is already a salted SHA-256 hash,
 * so storing it binds the activation slot to exactly one device.
 */
export function instanceNameForDevice(deviceId: string): string {
  return `ownshell:${deviceId}`;
}

export function isInstanceBoundToDevice(instanceName: string | undefined, deviceId: string): boolean {
  return instanceName === instanceNameForDevice(deviceId);
}

/**
 * Unix seconds until which released builds are covered: the license key expiry (yearly
 * Individual license), else order date + 1 year. Null without a reliable date, so a refresh
 * never mints fresh coverage from "now".
 */
export function getUpdatesUntilSeconds(licenseKey: LemonLicenseKey | undefined): number | null {
  const expiresAt = licenseKey?.expires_at ? Date.parse(licenseKey.expires_at) : NaN;
  if (Number.isFinite(expiresAt)) return Math.floor(expiresAt / 1000);
  const createdAt = licenseKey?.created_at ? Date.parse(licenseKey.created_at) : NaN;
  if (Number.isFinite(createdAt)) return Math.floor(createdAt / 1000) + ONE_YEAR_SECONDS;
  return null;
}
