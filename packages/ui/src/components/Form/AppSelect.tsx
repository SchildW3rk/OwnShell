import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface AppSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface AppSelectProps {
  id?: string;
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean | string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  listClassName?: string;
}

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 224;
const MENU_MIN_HEIGHT = 120;

export const AppSelect: React.FC<AppSelectProps> = ({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  error,
  disabled,
  className,
  triggerClassName,
  listClassName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [opensUpward, setOpensUpward] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = id ? `${id}-listbox` : undefined;
  const selectedOption = options.find((option) => option.value === value);
  const hasError = !!error;

  const updateMenuPosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const optionHeight = 40;
    const desiredHeight = Math.min(MENU_MAX_HEIGHT, options.length * optionHeight + 8);
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
    const spaceAbove = rect.top - MENU_GAP;
    const shouldOpenUpward = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const availableHeight = shouldOpenUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(
      Math.min(desiredHeight, MENU_MAX_HEIGHT),
      Math.min(MENU_MIN_HEIGHT, availableHeight)
    );
    const usableHeight = Math.min(Math.max(MENU_MIN_HEIGHT, availableHeight), maxHeight);
    const top = shouldOpenUpward
      ? Math.max(MENU_GAP, rect.top - MENU_GAP - usableHeight)
      : Math.min(rect.bottom + MENU_GAP, window.innerHeight - MENU_GAP - usableHeight);
    const left = Math.min(
      Math.max(MENU_GAP, rect.left),
      Math.max(MENU_GAP, window.innerWidth - rect.width - MENU_GAP)
    );

    setOpensUpward(shouldOpenUpward);
    setMenuStyle({
      position: 'fixed',
      top,
      left,
      width: rect.width,
      maxHeight: usableHeight,
      zIndex: 1000,
    });
  }, [options.length]);

  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleViewportChange = () => {
      window.requestAnimationFrame(updateMenuPosition);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, updateMenuPosition]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'no-drag flex h-10 w-full items-center justify-between rounded border bg-secondary px-3 text-left text-sm text-foreground transition-colors',
          'cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
          hasError ? 'border-destructive' : 'border-border hover:border-primary/40',
          triggerClassName
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-muted-foreground')}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && !disabled && createPortal(
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          style={menuStyle}
          className={cn(
            'no-drag overflow-y-auto rounded border border-border bg-popover p-1 shadow-xl',
            opensUpward ? 'origin-bottom' : 'origin-top',
            listClassName
          )}
        >
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'no-drag flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors',
                  isSelected
                    ? 'cursor-pointer bg-primary/10 text-foreground'
                    : 'cursor-pointer text-muted-foreground hover:bg-secondary hover:text-foreground',
                  option.disabled && 'cursor-not-allowed opacity-50'
                )}
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};
