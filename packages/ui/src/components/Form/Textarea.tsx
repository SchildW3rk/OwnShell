import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  variant?: 'default' | 'error';
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, variant = 'default', className = '', ...props }, ref) => {
    const hasError = !!error || variant === 'error';

    return (
      <textarea
        ref={ref}
        className={`
          w-full rounded border px-3 py-2 text-sm
          bg-secondary text-foreground
          placeholder:text-muted-foreground
          focus:outline-none focus:ring-1
          transition-colors duration-200
          ${hasError ? 'border-destructive focus:ring-destructive' : 'border-border focus:ring-primary'}
          disabled:opacity-50 disabled:cursor-not-allowed
          resize-y
          ${className}
        `}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
