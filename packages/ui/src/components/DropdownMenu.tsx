/**
 * DropdownMenu Component
 *
 * Reusable dropdown menu with trigger button
 * - Auto-closes on item click
 * - Backdrop to close
 * - Dark-theme defaults
 * - i18n-agnostic (labels passed as props)
 */

import React, { useState, useRef, useEffect } from 'react';

export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'danger';
  onClick: () => void;
}

export interface DropdownMenuProps {
  /** Trigger button (default: MoreVertical icon) */
  trigger?: React.ReactNode;
  /** Menu items */
  items: DropdownMenuItem[];
  /** Menu alignment */
  align?: 'left' | 'right';
  /** Custom trigger button class */
  triggerClassName?: string;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  align = 'right',
  triggerClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleItemClick = (event: React.MouseEvent, item: DropdownMenuItem) => {
    event.stopPropagation();
    item.onClick();
    setIsOpen(false); // Auto-close
  };

  // Default trigger: MoreVertical icon
  const defaultTrigger = (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
      />
    </svg>
  );

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={
          triggerClassName ||
          'rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground transition-colors duration-200 cursor-pointer'
        }
        type="button"
      >
        {trigger || defaultTrigger}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute top-8 z-20 w-56 rounded-lg border border-border bg-card py-1 shadow-xl transition-colors duration-200 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => (
            <button
              key={item.id}
              onClick={(event) => handleItemClick(event, item)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors duration-200 cursor-pointer ${
                item.variant === 'danger'
                  ? 'text-destructive hover:bg-secondary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
              type="button"
            >
              {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
