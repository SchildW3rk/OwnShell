/**
 * OAuth 2.0 for the API client: Client Credentials, and Authorization Code with PKCE
 * (S256) through a one-shot loopback redirect (http://127.0.0.1:<random port>/callback).
 *
 * Token endpoint requests always go direct (never through a request's SSH host) with
 * TLS verification on. Tokens are cached per auth owner by the injected store; they are
 * never logged, never returned to the renderer and never part of history or backups.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { readResponseBytes } from './fetch-timeout';
import { ApiRequestError } from './prepare-request';

export type OAuthGrant = 'client_credentials' | 'authorization_code';
export type OAuthClientAuth = 'basic' | 'body';

/** OAuth fields after {{variable}} resolution; `clientSecret` already decrypted. */
export interface ResolvedOAuth {
  grantType: OAuthGrant;
  tokenUrl: string;
  authUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  audience: string;
  clientAuth: OAuthClientAuth;
}

export interface CachedToken {
  fingerprint: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export interface TokenStore {
  get(ownerKey: string): Promise<CachedToken | undefined>;
  save(ownerKey: string, token: CachedToken): Promise<void>;
}

export const LOOPBACK_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_TIMEOUT_MS = 30000;
const MAX_TOKEN_RESPONSE_BYTES = 1024 * 1024;
/** Renew a little early so a token does not expire on the way. */
const EXPIRY_SKEW_MS = 30000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1).max(64 * 1024),
  token_type: z.string().max(64).optional(),
  expires_in: z.coerce.number().finite().positive().optional(),
  refresh_token: z.string().min(1).max(64 * 1024).optional(),
});

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

export function createPkce(): { verifier: string; challenge: string } {
  // 32 random bytes → 43 characters, the RFC 7636 minimum length.
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

/** Identifies the config a cached token was issued for; secrets are not part of it. */
export function tokenFingerprint(config: ResolvedOAuth): string {
  const parts = [config.grantType, config.tokenUrl, config.authUrl, config.clientId, config.scopes, config.audience];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function oauthError(detail: string): ApiRequestError {
  return new ApiRequestError('OAUTH_FAILED', `OAuth token request failed: ${detail}`, detail);
}

const cancelled = () => new ApiRequestError('CANCELLED', 'Request cancelled');

const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/i;

/** Plain http would carry the client secret, code or refresh token in clear; only loopback may. */
export function isInsecureOAuthUrl(url: URL): boolean {
  return url.protocol === 'http:' && !LOOPBACK_HOST.test(url.hostname);
}

function httpUrl(text: string, field: string): URL {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw oauthError(field);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw oauthError(field);
  if (isInsecureOAuthUrl(url)) throw new ApiRequestError('OAUTH_INSECURE_URL', `OAuth ${field} must use https`, field);
  return url;
}

// RFC 6749 §2.3.1: id and secret are form-encoded before Basic encoding.
const formEncode = (value: string) => encodeURIComponent(value).replace(/%20/g, '+');

/** One POST to the token endpoint; returns the validated token response. */
export async function requestToken(
  config: ResolvedOAuth,
  params: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<z.infer<typeof tokenResponseSchema>> {
  const url = httpUrl(config.tokenUrl, 'tokenUrl');
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  if (config.clientSecret && config.clientAuth === 'basic') {
    const credentials = `${formEncode(config.clientId)}:${formEncode(config.clientSecret)}`;
    headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
  } else {
    // Public clients (no secret) always identify themselves in the body.
    body.set('client_id', config.clientId);
    if (config.clientSecret) body.set('client_secret', config.clientSecret);
  }

  const timeout = AbortSignal.timeout(TOKEN_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: body.toString(),
      // A token endpoint that redirects would carry the client secret elsewhere.
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw cancelled();
    throw oauthError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network');
  }
  let json: unknown;
  try {
    json = JSON.parse((await readResponseBytes(response, MAX_TOKEN_RESPONSE_BYTES)).toString('utf8'));
  } catch {
    json = undefined;
  }
  if (signal?.aborted) throw cancelled();
  if (!response.ok) {
    // Only the RFC 6749 error code is shown; error_description is server text.
    const code = (json as { error?: unknown } | undefined)?.error;
    throw oauthError(typeof code === 'string' && /^[\w.-]{1,64}$/.test(code) ? code : `HTTP ${response.status}`);
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) throw oauthError('invalid_response');
  return parsed.data;
}

/** Constant-time comparison for the `state` value. */
function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * One-shot loopback redirect target: binds 127.0.0.1 on a random port, accepts exactly
 * one request (then closes), checks `state`, and gives up after `timeoutMs`.
 */
export async function startLoopbackServer(
  state: string,
  timeoutMs = LOOPBACK_TIMEOUT_MS
): Promise<{ redirectUri: string; code: Promise<string>; port: number; close: () => void }> {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  let timer: NodeJS.Timeout | undefined;
  const close = () => {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  };

  const code = new Promise<string>((resolve, reject) => {
    timer = setTimeout(() => {
      close();
      reject(oauthError('timeout'));
    }, timeoutMs);
    server.once('request', (req, res) => {
      clearTimeout(timer);
      server.close();
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      const finish = (ok: boolean) => {
        // Language-neutral page; the app shows the result.
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
        res.end(`<!doctype html><title>OwnShell</title><p style="font:24px sans-serif">${ok ? '&#10003;' : '&#10007;'}</p>`, close);
      };
      const error = url.searchParams.get('error');
      const received = url.searchParams.get('code');
      if (url.pathname !== '/callback') {
        finish(false);
        reject(oauthError('callback'));
      } else if (!sameSecret(url.searchParams.get('state') ?? '', state)) {
        finish(false);
        reject(oauthError('state_mismatch'));
      } else if (error) {
        finish(false);
        reject(oauthError(/^[\w.-]{1,64}$/.test(error) ? error : 'access_denied'));
      } else if (!received) {
        finish(false);
        reject(oauthError('missing_code'));
      } else {
        finish(true);
        resolve(received);
      }
    });
  });
  code.catch(() => undefined);
  return { redirectUri: `http://127.0.0.1:${port}/callback`, code, port, close };
}

/** Authorization Code + PKCE: opens the system browser and waits for the loopback redirect. */
export async function authorizationCodeFlow(
  config: ResolvedOAuth,
  openUrl: (url: string) => Promise<void>,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = LOOPBACK_TIMEOUT_MS
): Promise<z.infer<typeof tokenResponseSchema>> {
  const authUrl = httpUrl(config.authUrl, 'authUrl');
  httpUrl(config.tokenUrl, 'tokenUrl');
  const { verifier, challenge } = createPkce();
  const state = base64url(randomBytes(16));
  const loopback = await startLoopbackServer(state, timeoutMs);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', loopback.redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  if (config.scopes) authUrl.searchParams.set('scope', config.scopes);
  if (config.audience) authUrl.searchParams.set('audience', config.audience);
  try {
    await openUrl(authUrl.href);
  } catch (error) {
    loopback.close();
    throw error;
  }
  const code = await loopback.code;
  return requestToken(
    config,
    { grant_type: 'authorization_code', code, redirect_uri: loopback.redirectUri, code_verifier: verifier },
    fetchImpl
  );
}

export interface ObtainOptions {
  store: TokenStore;
  /** Cache key ('request:<id>' / 'collection:<id>'); without one nothing is cached. */
  ownerKey?: string;
  /** Skip the cache ("Get new token"). */
  force?: boolean;
  /** Allowed to open the browser (manual "Get new token" only, never on send). */
  openUrl?: (url: string) => Promise<void>;
  fetch?: typeof fetch;
  now?: () => number;
  /** The send's Cancel; on a token request shared with other sends it only detaches this caller. */
  signal?: AbortSignal;
}

interface Flight {
  promise: Promise<string>;
  controller: AbortController;
  waiters: number;
}

/** Token acquisitions in progress by owner + config, so parallel sends refresh only once. */
const inFlight = new Map<string, Flight>();

/** A valid access token: cached, refreshed, or newly requested. */
export async function obtainAccessToken(config: ResolvedOAuth, options: ObtainOptions): Promise<string> {
  // "Get new token" may open the browser and is never shared with sends.
  if (!options.ownerKey || options.force) return acquireToken(config, options, options.signal);
  const key = `${options.ownerKey}\n${tokenFingerprint(config)}`;
  let flight = inFlight.get(key);
  if (!flight) {
    const controller = new AbortController();
    const created: Flight = {
      controller,
      waiters: 0,
      promise: acquireToken(config, options, controller.signal).finally(() => {
        if (inFlight.get(key) === created) inFlight.delete(key);
      }),
    };
    created.promise.catch(() => undefined);
    inFlight.set(key, created);
    flight = created;
  }
  return joinFlight(key, flight, options.signal);
}

function joinFlight(key: string, flight: Flight, signal: AbortSignal | undefined): Promise<string> {
  flight.waiters++;
  return new Promise<string>((resolve, reject) => {
    const detach = () => {
      flight.waiters--;
      // Nobody waits any more: stop the token request.
      if (flight.waiters === 0) {
        if (inFlight.get(key) === flight) inFlight.delete(key);
        flight.controller.abort();
      }
      reject(cancelled());
    };
    if (signal?.aborted) return detach();
    signal?.addEventListener('abort', detach, { once: true });
    flight.promise.then(resolve, reject).finally(() => signal?.removeEventListener('abort', detach));
  });
}

async function acquireToken(config: ResolvedOAuth, options: ObtainOptions, signal?: AbortSignal): Promise<string> {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetch ?? fetch;
  const fingerprint = tokenFingerprint(config);
  const cached = options.ownerKey && !options.force ? await options.store.get(options.ownerKey) : undefined;
  const current = cached?.fingerprint === fingerprint ? cached : undefined;

  const save = async (
    token: z.infer<typeof tokenResponseSchema>,
    previousRefresh: string | null = null
  ): Promise<string> => {
    if (options.ownerKey) {
      await options.store.save(options.ownerKey, {
        fingerprint,
        accessToken: token.access_token,
        // RFC 6749 §6: the server may keep the old refresh token valid without returning it.
        refreshToken: token.refresh_token ?? previousRefresh,
        expiresAt: token.expires_in ? now() + token.expires_in * 1000 : null,
      });
    }
    return token.access_token;
  };

  if (current) {
    if (current.expiresAt === null || current.expiresAt - EXPIRY_SKEW_MS > now()) return current.accessToken;
    if (current.refreshToken) {
      try {
        const refreshed = await requestToken(
          config,
          { grant_type: 'refresh_token', refresh_token: current.refreshToken },
          fetchImpl,
          signal
        );
        return await save(refreshed, current.refreshToken);
      } catch {
        if (signal?.aborted) throw cancelled();
        // Refresh token expired or revoked: fall back to a new grant below.
      }
    }
  }

  if (config.grantType === 'client_credentials') {
    const params: Record<string, string> = { grant_type: 'client_credentials' };
    if (config.scopes) params.scope = config.scopes;
    if (config.audience) params.audience = config.audience;
    return save(await requestToken(config, params, fetchImpl, signal));
  }
  if (!options.openUrl) {
    throw new ApiRequestError('OAUTH_TOKEN_REQUIRED', 'Get a new OAuth token in the Auth tab first');
  }
  return save(await authorizationCodeFlow(config, options.openUrl, fetchImpl));
}

// ---------------------------------------------------------------------------
// Stored auth config: the client secret only ever lives encrypted in the DB.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function parseObject(json: string | null | undefined): Json {
  try {
    const value = JSON.parse(json || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
  } catch {
    return {};
  }
}

/** What the renderer sees: never the (encrypted) client secret, only whether one is set. */
export function publicAuthConfig(authType: string, json: string): string {
  if (authType !== 'oauth2') return json;
  const config = parseObject(json);
  const hasClientSecret = typeof config.clientSecretEncrypted === 'string';
  delete config.clientSecret;
  delete config.clientSecretEncrypted;
  return JSON.stringify({ ...config, hasClientSecret });
}

/**
 * Save-time check for renderer input: a literal (variable-free) http token or auth URL for a
 * remote host is refused. Backup restore skips this so one bad URL can't fail a whole restore;
 * every URL is checked again at use.
 */
export function assertSecureOAuthUrls(authType: string, json: string): void {
  if (authType !== 'oauth2') return;
  const config = parseObject(json);
  for (const field of ['tokenUrl', 'authUrl'] as const) {
    const value = config[field];
    if (typeof value !== 'string' || !value || value.includes('{{')) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      continue; // malformed URLs are reported when used
    }
    if (isInsecureOAuthUrl(url)) {
      throw new ApiRequestError('OAUTH_INSECURE_URL', `OAuth ${field} must use https`, field);
    }
  }
}

/**
 * Config to store from renderer input. `clientSecret` set: encrypt it; '' clears it;
 * absent: keep the stored one. Other auth types are stored as given.
 */
export function storedAuthConfig(
  authType: string,
  json: string,
  existingJson: string | null | undefined,
  encrypt: (value: string) => string
): string {
  if (authType !== 'oauth2') return json;
  const rest = parseObject(json);
  const { clientSecret } = rest;
  delete rest.clientSecret;
  delete rest.hasClientSecret;
  delete rest.clientSecretEncrypted;
  const existing = parseObject(existingJson).clientSecretEncrypted;
  const encrypted =
    typeof clientSecret === 'string'
      ? clientSecret
        ? encrypt(clientSecret)
        : undefined
      : typeof existing === 'string'
        ? existing
        : undefined;
  return JSON.stringify({ ...rest, ...(encrypted && { clientSecretEncrypted: encrypted }) });
}

/**
 * Config for preparation: `clientSecret` in plain text (from the input, else decrypted
 * from the stored config). Never returned to the renderer.
 */
export function revealClientSecret(
  json: string,
  storedJson: string | null | undefined,
  decrypt: (value: string) => string
): string {
  const config = parseObject(json);
  if (typeof config.clientSecret === 'string') return json;
  const encrypted = parseObject(storedJson).clientSecretEncrypted;
  delete config.clientSecretEncrypted;
  delete config.hasClientSecret;
  return JSON.stringify({ ...config, clientSecret: typeof encrypted === 'string' ? decrypt(encrypted) : '' });
}
