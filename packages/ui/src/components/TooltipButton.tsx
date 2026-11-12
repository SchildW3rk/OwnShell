/**
 * TooltipButton Component
 *
 * Icon button with a hover tooltip overlay.
 * Used for compact action buttons (e.g., "Add" buttons in table toolbars).
 */

import React from 'react';
import { cn } from '../utils/cn';

export interface TooltipButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  tooltip: string;
  variant?: 'default' | 'primary';
}

const variantStyles: Record<NonNullable<TooltipButtonProps['variant']>, string> = {
  default:
    'border border-border bg-secondary hover:bg-primary hover:text-primary-foreground hover:border-primary',
  primary:
    'border border-primary bg-primary text-primary-foreground hover:brightness-110',
};

export const TooltipButton = React.forwardRef<HTMLButtonElement, TooltipButtonProps>(
  ({ icon, tooltip, variant = 'default', className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'relative group p-2 rounded transition-colors',
          variantStyles[variant],
          className
        )}
        title={tooltip}
        {...props}
      >
        {icon}
        <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-popover border border-border rounded text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
          {tooltip}
        </div>
      </button>
    );
  }
);

TooltipButton.displayName = 'TooltipButton';
