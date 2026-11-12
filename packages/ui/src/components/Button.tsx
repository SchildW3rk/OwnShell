/**
 * Button Component
 *
 * Theme-aware button with semantic color classes
 * Supports Dark/Light mode via CSS variables
 */

import React from 'react';
import { cn } from '../utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  glow?: boolean; // Enable cyan glow effect
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      glow = false,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';

    const variantStyles = {
      primary: cn(
        'text-primary-foreground',
        'bg-primary hover:brightness-110',
        'focus-visible:ring-primary',
        glow && 'glow-cyan-md hover:glow-cyan-lg'
      ),
      secondary: cn(
        'text-foreground',
        'bg-secondary hover:bg-secondary',
        'border border-border',
        'focus-visible:ring-border'
      ),
      danger: cn(
        'text-primary-foreground',
        'bg-destructive hover:brightness-90',
        'focus-visible:ring-destructive'
      ),
      ghost: cn('text-foreground', 'hover:bg-secondary', 'focus-visible:ring-border'),
    };

    const sizeStyles = {
      sm: 'h-8 px-3 text-sm rounded',
      md: 'h-10 px-4 text-base rounded',
      lg: 'h-12 px-6 text-lg rounded-md',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="mr-2 h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading...
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
