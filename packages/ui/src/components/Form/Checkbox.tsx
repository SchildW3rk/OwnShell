import React from 'react';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="checkbox"
          className={`
            h-4 w-4 rounded border
            bg-input border-input
            text-accent
            focus:outline-none focus:ring-1 focus:ring-input-focus
            disabled:opacity-50 disabled:cursor-not-allowed
            cursor-pointer
            ${className}
          `}
          {...props}
        />
        {label && <label className="text-sm text-muted-foreground cursor-pointer">{label}</label>}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
