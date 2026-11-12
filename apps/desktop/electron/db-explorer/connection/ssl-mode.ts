// Pure (no Node imports) so the renderer can share it.
export const DB_SSL_MODES = ['disabled', 'require', 'require-no-verify'] as const;
export type DbSslMode = (typeof DB_SSL_MODES)[number];

/**
 * Effective SSL mode of a stored connection. Rows without ssl_mode (restored from older
 * backups) keep their old behavior: PostgreSQL/MySQL never verified, Redis/MongoDB did.
 */
export function resolveSslMode(row: {
  type: string;
  ssl_mode?: string | null;
  ssl_enabled?: number | null;
}): DbSslMode {
  if (DB_SSL_MODES.includes(row.ssl_mode as DbSslMode)) return row.ssl_mode as DbSslMode;
  if (row.ssl_enabled !== 1) return 'disabled';
  return row.type === 'postgres' || row.type === 'mysql' ? 'require-no-verify' : 'require';
}
