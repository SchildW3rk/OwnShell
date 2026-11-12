/**
 * SectionHeader Component
 *
 * Consistent uppercase section heading used in sidebar panels and list views.
 * Replaces repeated `<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">` patterns.
 */

import React from 'react';
import { cn } from '../utils/cn';

export interface SectionHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ children, className }) => {
  return (
    <h3
      className={cn(
        'text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3',
        className
      )}
    >
      {children}
    </h3>
  );
};
