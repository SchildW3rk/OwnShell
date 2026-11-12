import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface AppCheckboxProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const AppCheckbox: React.FC<AppCheckboxProps> = ({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}) => (
  <button
    id={id}
    type="button"
    role="checkbox"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      'no-drag inline-flex items-start gap-3 rounded border border-transparent text-left transition-colors',
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:text-foreground',
      className
    )}
  >
    <span
      className={cn(
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/40 bg-secondary text-transparent'
      )}
    >
      <Check className="h-3 w-3" />
    </span>
    {(label || description) && (
      <span className="grid gap-0.5">
        {label && <span className="text-sm font-medium text-foreground">{label}</span>}
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </span>
    )}
  </button>
);
