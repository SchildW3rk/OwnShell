import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { checkServerIdentity, type ConnectionOptions } from 'node:tls';
import type { DbSslMode } from './ssl-mode';

export { DB_SSL_MODES, resolveSslMode, type DbSslMode } from './ssl-mode';

export const MAX_CA_PEM_LENGTH = 64 * 1024;

/**
 * Node TLS options for a database driver, or undefined when SSL is off.
 * `verifyHost` is the original database host when the socket goes through a local tunnel
 * (127.0.0.1): SNI and the certificate name check must use it, not the tunnel address.
 */
export function buildTlsOptions(
  mode: DbSslMode | undefined,
  options: { ca?: string; verifyHost?: string } = {}
): ConnectionOptions | undefined {
  if (!mode || mode === 'disabled') return undefined;
  const base: ConnectionOptions = options.ca ? { ca: options.ca } : {};
  if (mode === 'require-no-verify') return { ...base, rejectUnauthorized: false };

  const verifyHost = options.verifyHost;
  if (!verifyHost) return { ...base, rejectUnauthorized: true };
  return {
    ...base,
    rejectUnauthorized: true,
    ...(isIP(verifyHost) ? {} : { servername: verifyHost }),
    checkServerIdentity: (_tunnelHost, cert) => checkServerIdentity(verifyHost, cert),
  };
}

/** SHA-256 fingerprint of the first certificate in a PEM; throws when it is not a certificate. */
export function caCertificateFingerprint(pem: string): string {
  if (pem.length > MAX_CA_PEM_LENGTH || !pem.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error('CA certificate must be a PEM certificate');
  }
  return new X509Certificate(pem).fingerprint256;
}
