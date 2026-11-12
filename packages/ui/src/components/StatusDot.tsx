/**
 * StatusDot Component
 *
 * Small colored circle to indicate status (running, stopped, error, etc.).
 * Replaces repeated `<div className="w-2 h-2 rounded-full bg-success" />` patterns.
 */

import React from 'react';
import { cn } from '../utils/cn';

export type StatusDotVariant = 'success' | 'error' | 'warning' | 'muted' | 'info';

export interface StatusDotProps {
  variant: StatusDotVariant;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}

const variantStyles: Record<StatusDotVariant, string> = {
  success: 'bg-success',
  error: 'bg-destructive',
  warning: 'bg-warning',
  muted: 'bg-secondary',
  info: 'bg-info',
};

const sizeStyles: Record<NonNullable<StatusDotProps['size']>, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-3 h-3',
};

export const StatusDot: React.FC<StatusDotProps> = ({
  variant,
  className,
  size = 'md',
  title,
}) => {
  return (
    <div
      className={cn('rounded-full flex-shrink-0', variantStyles[variant], sizeStyles[size], className)}
      title={title}
    />
  );
};
