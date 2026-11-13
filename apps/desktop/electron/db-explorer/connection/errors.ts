import { DBConnectionError } from '@ownshell/core';

/** Known connection failures: stable code (translated in the renderer as db.connectionErrors.<code>) + English log text. */
const KNOWN: Array<[(message: string) => boolean, string, string]> = [
  [(m) => m.includes('ECONNREFUSED'), 'CONNECTION_REFUSED', 'Connection refused. Please check if the database server is running and accessible.'],
  [(m) => m.includes('ETIMEDOUT') || m.includes('timeout'), 'TIMEOUT', 'Connection timed out. Please check the host and port, and ensure the database is reachable.'],
  [(m) => m.includes('authentication failed') || m.includes('password'), 'AUTH_FAILED', 'Authentication failed. Please check your username and password.'],
  [(m) => m.includes('database') && m.includes('does not exist'), 'DATABASE_NOT_FOUND', 'Database not found. Please verify the database name exists.'],
  [(m) => m.includes('SSL'), 'SSL_ERROR', 'SSL connection error. Try toggling the SSL option.'],
  [(m) => m.includes('ENOTFOUND'), 'HOST_NOT_FOUND', 'Host not found. Please check the hostname or IP address.'],
  [(m) => m.includes('ER_ACCESS_DENIED_ERROR'), 'ACCESS_DENIED', 'Access denied. Please check your username and password.'],
  [(m) => m.includes('ER_BAD_DB_ERROR'), 'DATABASE_NOT_FOUND', 'Database not found. Please verify the database name.'],
];
/** DBConnectionError codes the renderer has a translation for. */
const TRANSLATED_CODES = new Set(['MYSQL_TLS_IP_HOST']);

/** Message for logs/fallback display and, when known, a code the renderer translates. */
export function describeConnectionError(error: unknown): { message: string; code?: string } {
  if (!(error instanceof Error)) {
    return { message: 'An unknown error occurred while connecting to the database.' };
  }
  const code = (error as { code?: unknown }).code;
  if (error instanceof DBConnectionError && typeof code === 'string' && TRANSLATED_CODES.has(code)) {
    return { message: error.message, code };
  }
  // `localhost` tried on ::1 and 127.0.0.1 fails as an AggregateError with an empty message.
  const nested = (error as { errors?: unknown }).errors;
  const inner = Array.isArray(nested)
    ? nested.map((e) => String((e as { message?: unknown })?.message ?? e))
    : [];
  const text = [error.message, typeof code === 'string' ? code : '', ...inner].join(' ');
  const known = KNOWN.find(([test]) => test(text));
  return known ? { message: known[2], code: known[1] } : { message: error.message || inner[0] || text.trim() };
}

/**
 * Format connection error messages for user display.
 */
export function formatConnectionError(error: unknown): string {
  return describeConnectionError(error).message;
}
