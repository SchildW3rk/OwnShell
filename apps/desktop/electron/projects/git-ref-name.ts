/**
 * Client- and server-side mirror of `git check-ref-format --branch` rules.
 * Pure (no Node APIs) so the renderer can import it too. The server still runs
 * `git check-ref-format --branch` as the authoritative check.
 */
export function isValidGitBranchName(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (name === '@' || name === 'HEAD' || name.startsWith('-')) return false;
  if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.')) return false;
  if (name.includes('..') || name.includes('//') || name.includes('@{')) return false;
  if (/[\0-\x20\x7f~^:?*[\\]/.test(name)) return false;
  return name
    .split('/')
    .every((component) => !component.startsWith('.') && !component.endsWith('.lock'));
}
