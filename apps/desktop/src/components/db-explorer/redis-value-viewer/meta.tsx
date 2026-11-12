import React from 'react';
import type { RedisDataType } from '@ownshell/core';
import { BarChart3, Hash, Key, Layers, List } from 'lucide-react';

export const TYPE_ICONS: Record<RedisDataType, React.ReactNode> = {
  string: <Key className="w-4 h-4 text-success" />,
  hash: <Hash className="w-4 h-4 text-primary" />,
  list: <List className="w-4 h-4 text-purple-400" />,
  set: <Layers className="w-4 h-4 text-accent" />,
  zset: <BarChart3 className="w-4 h-4 text-accent" />,
  stream: <Key className="w-4 h-4 text-cyan-400" />,
  none: <Key className="w-4 h-4 text-muted-foreground" />,
};

export const TYPE_LABELS: Record<RedisDataType, string> = {
  string: 'String',
  hash: 'Hash',
  list: 'List',
  set: 'Set',
  zset: 'Sorted Set',
  stream: 'Stream',
  none: 'None',
};

export function formatTTL(ttl: number): string {
  if (ttl === -1) return 'No expiry';
  if (ttl === -2) return 'Expired';
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`;
  if (ttl < 86400) return `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;
  return `${Math.floor(ttl / 86400)}d ${Math.floor((ttl % 86400) / 3600)}h`;
}
