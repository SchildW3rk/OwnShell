import {
  getUpdatesUntilSeconds,
  instanceNameForDevice,
  isInstanceBoundToDevice,
  type LemonLicenseKey,
} from './license-rules';

type LicenseStatus = 'active';

interface Env {
  ENTITLEMENT_PRIVATE_KEY_JWK: string;
  ENTITLEMENT_ISSUER?: string;
  ENTITLEMENT_AUDIENCE?: string;
  ENTITLEMENT_KEY_ID?: string;
  ENTITLEMENT_TTL_SECONDS?: string;
  LEMON_SQUEEZY_API_BASE_URL?: string;
  // Workers Rate Limiting bindings (see wrangler.toml), one per limit/period.
  ACTION_DEVICE_RATE_LIMITER: RateLimit;
  ACTION_IP_RATE_LIMITER: RateLimit;
  REFRESH_DEVICE_RATE_LIMITER: RateLimit;
  REFRESH_IP_RATE_LIMITER: RateLimit;
}

type RateLimiterBinding =
  | 'ACTION_DEVICE_RATE_LIMITER'
  | 'ACTION_IP_RATE_LIMITER'
  | 'REFRESH_DEVICE_RATE_LIMITER'
  | 'REFRESH_IP_RATE_LIMITER';

interface EntitlementPayload {
  iss: string;
  aud: string;
  sub: string;
  status: LicenseStatus;
  deviceId: string;
  licenseType?: string;
  licenseKeyId?: number;
  instanceId?: string;
  /** Unix seconds: desktop builds released up to this moment are covered forever. */
  updatesUntil: number;
  features: string[];
  iat: number;
  nbf: number;
  exp: number;
}

interface LemonActivateResponse {
  activated: boolean;
  error?: string;
  license_key?: LemonLicenseKey;
  instance?: {
    id: string;
    name?: string;
    created_at?: string;
  };
  meta?: {
    product_name?: string;
    variant_name?: string;
  };
}

interface LemonValidateResponse {
  valid: boolean;
  error?: string;
  license_key?: LemonLicenseKey;
  instance?: {
    id: string;
    name?: string;
  } | null;
  meta?: {
    product_name?: string;
    variant_name?: string;
  };
}

interface LemonDeactivateResponse {
  deactivated: boolean;
  error?: string;
}

const DEFAULT_LEMON_API_BASE_URL = 'https://api.lemonsqueezy.com/v1';
const DEFAULT_ISSUER = 'ownshell-license-api';
const DEFAULT_AUDIENCE = 'ownshell-desktop';
const DEFAULT_KEY_ID = 'ownshell-license-2026-06';
const DEFAULT_ENTITLEMENT_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_ENTITLEMENT_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_JSON_BYTES = 8192;

// Desktop builds from 2026-11 on ignore this; older, feature-gated builds still require it.
const ENTITLEMENT_FEATURES = [
  'ssh',
  'sftp',
  's3',
  'database',
  'docker',
  'tunnel',
  'snippets',
];

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...init.headers,
    },
  });
}

function errorResponse(status: number, error: string): Response {
  return jsonResponse({ success: false, error }, { status });
}

function getBoundedNumberEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function assertDeviceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('Invalid device id');
  }
  return value.toLowerCase();
}

function assertLicenseKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid license key');
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 1024) {
    throw new Error('Invalid license key');
  }
  return trimmed;
}

function assertOptionalString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error('Invalid string field');
  }
  return value;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength > MAX_JSON_BYTES) {
      throw new Error('Request body too large');
    }
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('Expected application/json');
  }

  const bodyText = await readBoundedBody(request);
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error('Invalid JSON body');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected JSON object');
  }
  return body as Record<string, unknown>;
}

async function readBoundedBody(request: Request): Promise<string> {
  if (!request.body) {
    throw new Error('Expected JSON object');
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += value.byteLength;
      if (received > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new Error('Request body too large');
      }

      body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

async function importPrivateKey(env: Env): Promise<CryptoKey> {
  if (!env.ENTITLEMENT_PRIVATE_KEY_JWK) {
    throw new Error('Missing entitlement private key');
  }

  const jwk = JSON.parse(env.ENTITLEMENT_PRIVATE_KEY_JWK);
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign']
  );
}

async function signEntitlement(env: Env, payload: EntitlementPayload): Promise<string> {
  const header = {
    alg: 'ES256',
    typ: 'JWT',
    kid: env.ENTITLEMENT_KEY_ID || DEFAULT_KEY_ID,
  };
  const encodedHeader = encodeJson(header);
  const encodedPayload = encodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const privateKey = await importPrivateKey(env);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function isLicenseKeyUsable(licenseKey: LemonLicenseKey | undefined): boolean {
  if (!licenseKey || licenseKey.status !== 'active') {
    return false;
  }

  if (!licenseKey.expires_at) {
    return true;
  }

  return new Date(licenseKey.expires_at).getTime() > Date.now();
}

function getLicenseType(meta: LemonActivateResponse['meta'] | LemonValidateResponse['meta']): string {
  return meta?.variant_name || meta?.product_name || 'OwnShell License';
}

function getLemonBaseUrl(env: Env): string {
  return (env.LEMON_SQUEEZY_API_BASE_URL || DEFAULT_LEMON_API_BASE_URL).replace(/\/+$/, '');
}

async function postToLemon<TResponse>(
  env: Env,
  path: string,
  body: Record<string, unknown>
): Promise<TResponse> {
  const formBody = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) {
      formBody.set(key, String(value));
    }
  }

  const response = await fetch(`${getLemonBaseUrl(env)}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  });

  try {
    return (await response.json()) as TResponse;
  } catch {
    throw new Error('Lemon Squeezy returned an invalid response');
  }
}

function maskLicenseKey(licenseKey: string): string {
  if (licenseKey.length <= 12) return licenseKey;
  return `${licenseKey.slice(0, 8)}...${licenseKey.slice(-4)}`;
}

function getClientAddress(request: Request): string {
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || 'unknown';

  return 'unknown';
}

async function enforceRateLimit(params: {
  request: Request;
  env: Env;
  action: string;
  limiter: RateLimiterBinding;
  deviceId?: string;
}): Promise<Response | undefined> {
  const limiter = params.env[params.limiter];
  if (!limiter) {
    // Fail closed: a missing binding must not silently disable rate limiting.
    throw new Error(`Missing rate limit binding ${params.limiter}`);
  }

  const { success } = await limiter.limit({
    key: `${params.action}:${getClientAddress(params.request)}:${params.deviceId || 'none'}`,
  });
  return success ? undefined : errorResponse(429, 'Too many requests');
}

async function enforceActionRateLimit(params: {
  request: Request;
  env: Env;
  action: string;
  deviceId?: string;
  ipLimiter: RateLimiterBinding;
  deviceLimiter: RateLimiterBinding;
}): Promise<Response | undefined> {
  const ipLimited = await enforceRateLimit({
    request: params.request,
    env: params.env,
    action: `${params.action}:ip`,
    limiter: params.ipLimiter,
  });
  if (ipLimited) return ipLimited;

  return enforceRateLimit({
    request: params.request,
    env: params.env,
    action: `${params.action}:device`,
    limiter: params.deviceLimiter,
    deviceId: params.deviceId,
  });
}

function buildPayload(params: {
  env: Env;
  subject: string;
  status: LicenseStatus;
  deviceId: string;
  expiresAtSeconds: number;
  updatesUntil: number;
  licenseType?: string;
  licenseKeyId?: number;
  instanceId?: string;
}): EntitlementPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: params.env.ENTITLEMENT_ISSUER || DEFAULT_ISSUER,
    aud: params.env.ENTITLEMENT_AUDIENCE || DEFAULT_AUDIENCE,
    sub: params.subject,
    status: params.status,
    deviceId: params.deviceId,
    licenseType: params.licenseType,
    licenseKeyId: params.licenseKeyId,
    instanceId: params.instanceId,
    updatesUntil: params.updatesUntil,
    features: ENTITLEMENT_FEATURES,
    iat: now,
    nbf: now - 60,
    exp: params.expiresAtSeconds,
  };
}

async function respondWithEntitlement(
  env: Env,
  payload: EntitlementPayload,
  extra: Record<string, unknown> = {}
): Promise<Response> {
  const entitlement = await signEntitlement(env, payload);
  return jsonResponse({
    success: true,
    status: payload.status,
    entitlement,
    expiresAt: payload.exp * 1000,
    updatesUntil: payload.updatesUntil * 1000,
    licenseType: payload.licenseType,
    instanceId: payload.instanceId,
    ...extra,
  });
}

async function handleActivate(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  const licenseKey = assertLicenseKey(body.licenseKey);
  const deviceId = assertDeviceId(body.deviceId);
  const rateLimited = await enforceActionRateLimit({
    request,
    env,
    action: 'activate',
    deviceId,
    ipLimiter: 'ACTION_IP_RATE_LIMITER',
    deviceLimiter: 'ACTION_DEVICE_RATE_LIMITER',
  });
  if (rateLimited) return rateLimited;

  const lemon = await postToLemon<LemonActivateResponse>(env, '/licenses/activate', {
    license_key: licenseKey,
    instance_name: instanceNameForDevice(deviceId),
  });

  if (!lemon.activated || !isLicenseKeyUsable(lemon.license_key)) {
    return errorResponse(403, lemon.error || 'License activation failed');
  }
  // Same binding as refresh: only sign for an instance that belongs to this device.
  if (!lemon.instance?.id || !isInstanceBoundToDevice(lemon.instance.name, deviceId)) {
    return errorResponse(403, 'License activation belongs to another device');
  }
  const updatesUntil = getUpdatesUntilSeconds(lemon.license_key);
  if (updatesUntil === null) {
    return errorResponse(502, 'License dates unavailable');
  }

  const ttlSeconds = getBoundedNumberEnv(
    env.ENTITLEMENT_TTL_SECONDS,
    DEFAULT_ENTITLEMENT_TTL_SECONDS,
    60,
    MAX_ENTITLEMENT_TTL_SECONDS
  );
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = buildPayload({
    env,
    subject: `license:${lemon.license_key?.id ?? 'unknown'}`,
    status: 'active',
    deviceId,
    expiresAtSeconds,
    updatesUntil,
    licenseType: getLicenseType(lemon.meta),
    licenseKeyId: lemon.license_key?.id,
    instanceId: lemon.instance?.id,
  });

  return respondWithEntitlement(env, payload, {
    maskedKey: maskLicenseKey(licenseKey),
  });
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  const licenseKey = assertLicenseKey(body.licenseKey);
  const deviceId = assertDeviceId(body.deviceId);
  const instanceId = assertOptionalString(body.instanceId, 256);
  const rateLimited = await enforceActionRateLimit({
    request,
    env,
    action: 'refresh',
    deviceId,
    ipLimiter: 'REFRESH_IP_RATE_LIMITER',
    deviceLimiter: 'REFRESH_DEVICE_RATE_LIMITER',
  });
  if (rateLimited) return rateLimited;

  // The instance proves this device holds an activation slot. Without it, one key
  // could mint entitlements for unlimited devices.
  if (!instanceId) {
    return errorResponse(400, 'Missing license instance id');
  }

  const lemon = await postToLemon<LemonValidateResponse>(env, '/licenses/validate', {
    license_key: licenseKey,
    instance_id: instanceId,
  });

  if (!lemon.valid || !isLicenseKeyUsable(lemon.license_key) || lemon.instance?.id !== instanceId) {
    return errorResponse(403, lemon.error || 'License is no longer valid');
  }
  // The instance must belong to the requesting device, or one activation would cover any device.
  if (!isInstanceBoundToDevice(lemon.instance?.name, deviceId)) {
    return errorResponse(403, 'License activation belongs to another device');
  }
  // Without a reliable base date, issue no new coverage; the desktop keeps its last signed license.
  const updatesUntil = getUpdatesUntilSeconds(lemon.license_key);
  if (updatesUntil === null) {
    return errorResponse(502, 'License dates unavailable');
  }

  const ttlSeconds = getBoundedNumberEnv(
    env.ENTITLEMENT_TTL_SECONDS,
    DEFAULT_ENTITLEMENT_TTL_SECONDS,
    60,
    MAX_ENTITLEMENT_TTL_SECONDS
  );
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = buildPayload({
    env,
    subject: `license:${lemon.license_key?.id ?? 'unknown'}`,
    status: 'active',
    deviceId,
    expiresAtSeconds,
    updatesUntil,
    licenseType: getLicenseType(lemon.meta),
    licenseKeyId: lemon.license_key?.id,
    instanceId,
  });

  return respondWithEntitlement(env, payload, {
    maskedKey: maskLicenseKey(licenseKey),
  });
}

async function handleDeactivate(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  const licenseKey = assertLicenseKey(body.licenseKey);
  const instanceId = assertOptionalString(body.instanceId, 256);
  const rateLimited = await enforceActionRateLimit({
    request,
    env,
    action: 'deactivate',
    ipLimiter: 'ACTION_IP_RATE_LIMITER',
    deviceLimiter: 'ACTION_DEVICE_RATE_LIMITER',
  });
  if (rateLimited) return rateLimited;

  if (!instanceId) {
    return errorResponse(400, 'Missing license instance id');
  }

  const lemon = await postToLemon<LemonDeactivateResponse>(env, '/licenses/deactivate', {
    license_key: licenseKey,
    instance_id: instanceId,
  });

  if (!lemon.deactivated) {
    return errorResponse(403, lemon.error || 'License deactivation failed');
  }

  return jsonResponse({ success: true });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/health') {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse(405, 'Method not allowed');
  }

  switch (url.pathname) {
    case '/v1/license/activate':
      return handleActivate(request, env);
    case '/v1/license/refresh':
      return handleRefresh(request, env);
    case '/v1/license/deactivate':
      return handleDeactivate(request, env);
    default:
      return errorResponse(404, 'Not found');
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request';
      if (message === 'Request body too large') {
        return errorResponse(413, message);
      }
      if (message.startsWith('Invalid') || message.startsWith('Expected')) {
        return errorResponse(400, message);
      }
      console.error('License API request failed', error);
      return errorResponse(500, 'License service unavailable');
    }
  },
};
