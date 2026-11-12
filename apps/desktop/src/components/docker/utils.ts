/**
 * Docker UI Utilities
 *
 * Shared helper functions for Docker view components.
 */

import type { DockerContainerState } from '@ownshell/core';
import type { StatusDotVariant } from '@ownshell/ui';

/**
 * Get status indicator color based on container state
 * @deprecated Use getStateVariant with StatusDot component instead
 */
export function getStateColor(state: DockerContainerState | string): string {
  switch (state) {
    case 'running':
      return 'bg-success';
    case 'paused':
    case 'restarting':
      return 'bg-warning';
    case 'exited':
    case 'dead':
    case 'removing':
      return 'bg-destructive';
    case 'created':
      return 'bg-info';
    default:
      return 'bg-muted';
  }
}

/**
 * Get StatusDot variant based on container state
 */
export function getStateVariant(state: DockerContainerState | string): StatusDotVariant {
  switch (state) {
    case 'running':
      return 'success';
    case 'paused':
    case 'restarting':
      return 'warning';
    case 'exited':
    case 'dead':
    case 'removing':
      return 'error';
    case 'created':
      return 'info';
    default:
      return 'muted';
  }
}

/**
 * Format container name (remove leading slash, take first name)
 */
export function formatName(names: string): string {
  return names.replace(/^\//, '').split(',')[0] || names;
}
