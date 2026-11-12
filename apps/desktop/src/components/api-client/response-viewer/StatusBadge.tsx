import React from 'react';
import { cn } from '@ownshell/ui';

export const StatusBadge: React.FC<{ status: number; statusText: string }> = ({
  status,
  statusText,
}) => {
  const getStatusColor = (code: number) => {
    if (code === 0) return 'bg-red-500/20 text-red-500';
    if (code >= 200 && code < 300) return 'bg-green-500/20 text-green-500';
    if (code >= 300 && code < 400) return 'bg-blue-500/20 text-blue-500';
    if (code >= 400 && code < 500) return 'bg-amber-500/20 text-amber-500';
    if (code >= 500) return 'bg-red-500/20 text-red-500';
    return 'bg-muted/20 text-muted-foreground';
  };

  const label = status === 0 ? 'Error' : `${status} ${statusText}`;

  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-bold', getStatusColor(status))}>
      {label}
    </span>
  );
};
