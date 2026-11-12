import { app } from 'electron';

const DEFAULT_LICENSE_API_BASE_URL = 'https://license.ownshell.app';
const REQUEST_TIMEOUT_MS = 15000;

export interface LicenseApiEntitlementResponse {
  success: true;
  status: 'active';
  entitlement: string;
  expiresAt: number;
  licenseType?: string;
  instanceId?: string;
  maskedKey?: string;
}

interface LicenseApiErrorResponse {
  success: false;
  error?: string;
}

/** The license service answered and refused the request (4xx), as opposed to being unreachable. */
export class LicenseApiRejectedError extends Error {}

function getLicenseApiBaseUrl(): string {
  const devUrl = !app.isPackaged ? process.env.OWNSHELL_LICENSE_API_URL : undefined;
  return (devUrl || DEFAULT_LICENSE_API_BASE_URL).replace(/\/+$/, '');
}

function isSuccessResponse(value: unknown): value is LicenseApiEntitlementResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  return (
    response.success === true &&
    response.status === 'active' &&
    typeof response.entitlement === 'string' &&
    typeof response.expiresAt === 'number'
  );
}

async function postJson<TResponse>(
  path: string,
  payload: Record<string, unknown>
): Promise<TResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getLicenseApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const json = (await response.json()) as TResponse | LicenseApiErrorResponse;
    if (!response.ok || (json as LicenseApiErrorResponse).success === false) {
      const message = (json as LicenseApiErrorResponse).error || 'License service rejected request';
      const rejected = response.status >= 400 && response.status < 500 && response.status !== 429;
      throw rejected ? new LicenseApiRejectedError(message) : new Error(message);
    }

    return json as TResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function requireEntitlementResponse(value: unknown): LicenseApiEntitlementResponse {
  if (!isSuccessResponse(value)) {
    throw new Error('License service returned an invalid entitlement response');
  }
  return value;
}

export async function activateLicenseEntitlement(params: {
  licenseKey: string;
  deviceId: string;
  appVersion: string;
  platform: NodeJS.Platform;
}): Promise<LicenseApiEntitlementResponse> {
  const response = await postJson<unknown>('/v1/license/activate', params);
  return requireEntitlementResponse(response);
}

export async function refreshLicenseEntitlement(params: {
  licenseKey: string;
  deviceId: string;
  instanceId?: string;
  appVersion: string;
  platform: NodeJS.Platform;
}): Promise<LicenseApiEntitlementResponse> {
  const response = await postJson<unknown>('/v1/license/refresh', params);
  return requireEntitlementResponse(response);
}

export async function deactivateLicenseEntitlement(params: {
  licenseKey: string;
  instanceId: string;
}): Promise<{ success: true }> {
  return postJson<{ success: true }>('/v1/license/deactivate', params);
}
