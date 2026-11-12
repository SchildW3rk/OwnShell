/**
 * Shared formatting utilities for OwnShell
 */

/**
 * Format a byte count into a human-readable string (e.g., "1.5 GB").
 *
 * Returns '0 B' for zero, '-' for undefined/null values.
 * Supports up to TB.
 */
export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || bytes === 0) return '0 B';

  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${parseFloat(value.toFixed(1))} ${units[i]}`;
}
