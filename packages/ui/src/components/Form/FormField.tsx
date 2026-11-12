import React from 'react';
import { Label } from './Label';

export interface FormFieldProps {
  label?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  hint,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1 ${className}`}>
      {label && <Label required={required}>{label}</Label>}
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};
