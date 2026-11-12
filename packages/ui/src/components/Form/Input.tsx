import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  variant?: 'default' | 'error';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, variant = 'default', type = 'text', className = '', ...props }, ref) => {
    const hasError = !!error || variant === 'error';
    const isPassword = type === 'password';
    const [showPassword, setShowPassword] = useState(false);
    const inputType = isPassword && showPassword ? 'text' : type;

    return (
      <div className="relative">
        <input
          ref={ref}
          type={inputType}
          className={`
            w-full rounded border px-3 py-2 text-sm
            bg-secondary text-foreground
            placeholder:text-muted-foreground
            focus:outline-none focus:ring-1
            transition-colors duration-200
            ${hasError ? 'border-destructive focus:ring-destructive' : 'border-border focus:ring-primary'}
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isPassword ? 'pr-10' : ''}
            ${className}
          `}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
