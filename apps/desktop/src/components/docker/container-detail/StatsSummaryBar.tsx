import React from 'react';
import type { DockerContainerStats } from '@ownshell/core';
import { Cpu, HardDrive, Hash, Network } from 'lucide-react';
import { formatBytes } from '@ownshell/ui';

interface StatsSummaryBarProps {
  stats: DockerContainerStats;
}

export const StatsSummaryBar: React.FC<StatsSummaryBarProps> = ({ stats }) => (
  <div className="flex items-center gap-6 px-4 py-2 bg-secondary border-b border-border">
    <div className="flex items-center gap-2">
      <Cpu className="w-4 h-4 text-primary" />
      <span className="text-xs text-muted-foreground">CPU</span>
      <span className="text-sm font-medium text-foreground">{stats.cpuPercent.toFixed(1)}%</span>
    </div>
    <div className="flex items-center gap-2">
      <HardDrive className="w-4 h-4 text-primary" />
      <span className="text-xs text-muted-foreground">Memory</span>
      <span className="text-sm font-medium text-foreground">
        {formatBytes(stats.memoryUsage)} / {formatBytes(stats.memoryLimit)}
      </span>
      <span className="text-xs text-muted-foreground">
        ({stats.memoryPercent.toFixed(1)}%)
      </span>
    </div>
    <div className="flex items-center gap-2">
      <Network className="w-4 h-4 text-primary" />
      <span className="text-xs text-muted-foreground">Network</span>
      <span className="text-sm font-medium text-foreground">
        {formatBytes(stats.networkRx)} / {formatBytes(stats.networkTx)}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <Hash className="w-4 h-4 text-primary" />
      <span className="text-xs text-muted-foreground">PIDs</span>
      <span className="text-sm font-medium text-foreground">{stats.pids}</span>
    </div>
  </div>
);
