import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  error?: string;
  variant?: 'default' | 'error';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, error, variant = 'default', className = '', ...props }, ref) => {
    const hasError = !!error || variant === 'error';

    return (
      <div className="relative">
        <select
          ref={ref}
          className={`
            w-full rounded border px-3 py-2 pr-10 text-sm
            bg-secondary text-foreground
            focus:outline-none focus:ring-1
            appearance-none cursor-pointer
            transition-colors duration-200
            ${hasError ? 'border-destructive focus:ring-destructive' : 'border-border focus:ring-primary'}
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
    );
  }
);

Select.displayName = 'Select';
