import React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '../utils/cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, subtitle, action, className }) => {
  return (
    <div className={cn("flex items-center justify-center h-full", className)}>
      <div className="text-center max-w-md">
        <Icon className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        {subtitle && <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>}
        {action}
      </div>
    </div>
  );
};
