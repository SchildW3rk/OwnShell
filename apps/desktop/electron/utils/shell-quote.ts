/**
 * POSIX shell quoting helpers for commands executed on remote SSH hosts.
 *
 * These helpers are for shell command strings only. Prefer argv/native APIs
 * where available.
 */

export function shellQuote(value: string | number | boolean): string {
  const text = String(value);
  if (text.length === 0) return "''";
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export function shellJoin(values: Array<string | number | boolean>): string {
  return values.map(shellQuote).join(' ');
}

export function shellQuotePath(value: string): string {
  if (value === '~') return '$HOME';
  if (value.startsWith('~/')) {
    const relativePath = value.slice(2);
    return relativePath.length > 0 ? `$HOME/${shellQuote(relativePath)}` : '$HOME';
  }

  return shellQuote(value);
}
