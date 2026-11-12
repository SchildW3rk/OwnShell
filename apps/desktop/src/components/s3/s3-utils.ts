/**
 * S3 utility functions
 */

/**
 * Check if a file is an image based on its extension
 */
export function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext || '');
}

/**
 * Format a date for display in S3 views
 */
export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
