import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';

export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message, className }) => {
  return (
    <div className={cn("flex items-center justify-center h-full bg-background", className)}>
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
        {message && <p className="text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
};
