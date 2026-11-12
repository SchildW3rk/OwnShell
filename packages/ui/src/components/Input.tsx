/**
 * @deprecated Use `FormField` + `FormInput` from `@ownshell/ui` instead.
 * This legacy Input bundles label, error, and helperText into a single component.
 * The newer Form/Input + Form/FormField composition is preferred for consistency.
 *
 * Input Component
 *
 * Text and password inputs with error states and show/hide toggle
 * Design: Dark Mode First, Modern Professional
 */

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, type = 'text', className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1.5 transition-colors duration-200">
            {label}
          </label>
        )}

        <div className="relative">
          <input
            ref={ref}
            type={inputType}
            className={cn(
              'w-full h-10 px-3 py-2 bg-secondary border rounded text-foreground text-sm',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-offset-0',
              error
                ? 'border-destructive focus:ring-destructive'
                : 'border-border focus:ring-primary',
              'transition-colors duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              isPassword && 'pr-10',
              className
            )}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-200"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>

        {(error || helperText) && (
          <p
            className={cn(
              'mt-1.5 text-xs transition-colors duration-200',
              error ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
