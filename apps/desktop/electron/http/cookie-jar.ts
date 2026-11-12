/**
 * Minimal RFC 6265 cookie rules for the API client's cookie jar: parsing Set-Cookie,
 * and choosing the cookies for a request URL (domain, path, Secure, expiry).
 * SameSite and HttpOnly do not apply to a client like this one. Pure; storage is the caller's.
 */

import { isIP } from 'node:net';
import { getPublicSuffix } from 'tldts';

export interface JarCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** No Domain attribute: only sent to exactly `domain`. */
  hostOnly: boolean;
  secure: boolean;
  /** Unix ms; null = session cookie. `<= now` means "delete". */
  expiresAt: number | null;
}

/** Whole Set-Cookie (name, value and attributes); the RFC 6265 §6.1 minimum browsers use. */
export const MAX_COOKIE_BYTES = 4096;

/**
 * True when `domain` is itself a public suffix (Public Suffix List incl. wildcard/exception
 * rules and private suffixes like github.io): such a Domain attribute would share the cookie
 * between unrelated sites (`Domain=co.at` from evil.co.at sent to bank.co.at).
 */
export function isPublicSuffix(domain: string): boolean {
  return getPublicSuffix(domain, { allowPrivateDomains: true }) === domain;
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

/** The stored `domain` values that can match `url`: the host and its parent domains. */
export function candidateDomains(url: URL): string[] {
  const host = hostOf(url);
  if (isIP(host)) return [host];
  const labels = host.split('.');
  return labels.map((_, index) => labels.slice(index).join('.'));
}

export function domainMatch(host: string, domain: string): boolean {
  return host === domain || (!isIP(host) && host.endsWith(`.${domain}`));
}

export function pathMatch(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  return (
    requestPath.startsWith(cookiePath) &&
    (cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/')
  );
}

export function defaultPath(urlPath: string): string {
  if (!urlPath.startsWith('/')) return '/';
  const last = urlPath.lastIndexOf('/');
  return last <= 0 ? '/' : urlPath.slice(0, last);
}

/** One Set-Cookie header from a response to `url`; null when it must be ignored. */
export function parseSetCookie(header: string, url: URL, now: number): JarCookie | null {
  const [pair, ...attributes] = header.split(';');
  const separator = pair.indexOf('=');
  if (separator < 0) return null;
  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  if (!name || Buffer.byteLength(header) > MAX_COOKIE_BYTES) return null;

  const host = hostOf(url);
  let domain: string | undefined;
  let path: string | undefined;
  let secure = false;
  let expires: number | null = null;
  let maxAge: number | null = null;
  for (const attribute of attributes) {
    const eq = attribute.indexOf('=');
    const key = (eq < 0 ? attribute : attribute.slice(0, eq)).trim().toLowerCase();
    const val = eq < 0 ? '' : attribute.slice(eq + 1).trim();
    if (key === 'expires') {
      const time = Date.parse(val);
      if (!Number.isNaN(time)) expires = time;
    } else if (key === 'max-age') {
      if (/^-?\d+$/.test(val)) {
        const seconds = Number(val);
        maxAge = seconds <= 0 ? 0 : now + seconds * 1000;
      }
    } else if (key === 'domain') {
      const cleaned = val.replace(/^\./, '').toLowerCase();
      if (cleaned) domain = cleaned;
    } else if (key === 'path') {
      path = val.startsWith('/') ? val : undefined;
    } else if (key === 'secure') {
      secure = true;
    }
  }

  // RFC 6265bis: a Secure cookie can only be set over https.
  if (secure && url.protocol !== 'https:') return null;
  if (domain !== undefined) {
    if (!domainMatch(host, domain)) return null;
    // RFC 6265 §5.3 step 5: Domain=<public suffix> is only allowed as host-only for that exact host.
    if (isPublicSuffix(domain)) {
      if (domain !== host) return null;
      domain = undefined;
    }
  }

  return {
    name,
    value,
    domain: domain ?? host,
    path: path ?? defaultPath(url.pathname),
    hostOnly: domain === undefined,
    secure,
    // Max-Age wins over Expires.
    expiresAt: maxAge ?? expires,
  };
}

export function cookieMatches(cookie: JarCookie, url: URL, now: number): boolean {
  const host = hostOf(url);
  if (cookie.expiresAt !== null && cookie.expiresAt <= now) return false;
  if (cookie.secure && url.protocol !== 'https:') return false;
  if (cookie.hostOnly ? host !== cookie.domain : !domainMatch(host, cookie.domain)) return false;
  return pathMatch(url.pathname || '/', cookie.path);
}

/** The Cookie header value for `url`, longer paths first; undefined when nothing matches. */
export function cookieHeaderFor(cookies: JarCookie[], url: URL, now: number): string | undefined {
  const matching = cookies
    .filter((cookie) => cookieMatches(cookie, url, now))
    .sort((a, b) => b.path.length - a.path.length);
  return matching.length ? matching.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') : undefined;
}
