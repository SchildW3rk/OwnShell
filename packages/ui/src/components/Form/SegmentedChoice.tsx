import React from 'react';
import { cn } from '../../utils/cn';

export interface SegmentedChoiceOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedChoiceProps<T extends string = string> {
  name: string;
  value: T;
  options: SegmentedChoiceOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  itemClassName?: string;
  fullWidth?: boolean;
}

export const SegmentedChoice = <T extends string,>({
  name,
  value,
  options,
  onChange,
  className,
  itemClassName,
  fullWidth = false,
}: SegmentedChoiceProps<T>) => (
  <div
    className={cn('inline-flex flex-wrap gap-2', fullWidth && 'flex w-full', className)}
    role="radiogroup"
    aria-label={name}
  >
    {options.map((option) => {
      const isActive = value === option.value;

      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={isActive}
          aria-label={option.label}
          onClick={() => onChange(option.value)}
          className={cn(
            'no-drag inline-flex h-9 items-center justify-center gap-2 rounded border px-3 text-sm font-medium transition-colors',
            fullWidth && 'flex-1',
            isActive
              ? 'border-primary/60 bg-primary/10 text-foreground shadow-sm'
              : 'border-border bg-secondary text-muted-foreground hover:border-primary/40 hover:text-foreground',
            itemClassName
          )}
        >
          {option.icon ? (
            <span className="flex h-4 w-4 items-center justify-center text-current">
              {option.icon}
            </span>
          ) : (
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full border transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/40 bg-background'
              )}
            >
              {isActive && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
          )}
          <span className="truncate">{option.label}</span>
        </button>
      );
    })}
  </div>
);
