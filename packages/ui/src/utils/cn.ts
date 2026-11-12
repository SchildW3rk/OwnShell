/**
 * Utility function for merging Tailwind CSS classes
 * 
 * Combines clsx for conditional classes and tailwind-merge to resolve conflicts
 * 
 * Example:
 *   cn('px-2 py-1', { 'bg-blue-500': isActive }, 'px-4') 
 *   => 'px-4 py-1 bg-blue-500'
 *   (px-4 overrides px-2)
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
