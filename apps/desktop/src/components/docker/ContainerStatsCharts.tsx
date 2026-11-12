/**
 * Container Stats Charts
 *
 * Real-time charts for CPU, Memory, and Network I/O using recharts
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { Cpu, HardDrive, Network, Hash } from 'lucide-react';
import { DockerContainerStats } from '@ownshell/core';
import { formatBytes } from '@ownshell/ui';

interface ContainerStatsChartsProps {
  stats: DockerContainerStats | null | undefined;
  statsHistory: DockerContainerStats[];
  hostMemoryBytes?: number; // Total host memory for limit visualization
}

export const ContainerStatsCharts: React.FC<ContainerStatsChartsProps> = ({
  stats,
  statsHistory,
  hostMemoryBytes,
}) => {
  const { t } = useTranslation();

  // Format chart data with timestamps
  const chartData = statsHistory.map((s, index) => ({
    time: formatTime(s.timestamp),
    index,
    cpuPercent: s.cpuPercent,
    memoryPercent: s.memoryPercent,
    memoryUsage: s.memoryUsage / (1024 * 1024), // Convert to MB
    memoryLimit: s.memoryLimit / (1024 * 1024),
    networkRx: s.networkRx / 1024, // Convert to KB
    networkTx: s.networkTx / 1024,
    pids: s.pids,
  }));

  const chartTheme = {
    background: '#252526',
    gridColor: '#3E3E42',
    textColor: '#969696',
    cpuColor: '#0078D4',
    memoryColor: '#4EC9B0',
    networkRxColor: '#9CDCFE',
    networkTxColor: '#CE9178',
    pidsColor: '#DCDCAA',
    hostLimitColor: '#F48771',
  };

  // Convert host memory to MB for chart reference line
  const hostMemoryMB = hostMemoryBytes ? hostMemoryBytes / (1024 * 1024) : undefined;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface border border-border rounded px-3 py-2 text-xs">
          <p className="text-muted-foreground mb-1">{label}</p>
          {payload.map((entry: any) => (
            <p key={entry.dataKey || entry.name} style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
              {entry.unit || ''}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* CPU Usage Chart */}
      <div className="bg-surface rounded-lg p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">
            {t('docker.cpuUsage', 'CPU Usage')}
          </h3>
          {stats && (
            <span className="ml-auto text-sm font-medium text-primary">
              {stats.cpuPercent.toFixed(1)}%
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartTheme.cpuColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartTheme.cpuColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
            <XAxis
              dataKey="time"
              tick={{ fill: chartTheme.textColor, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: chartTheme.textColor, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="cpuPercent"
              name="CPU"
              unit="%"
              stroke={chartTheme.cpuColor}
              fill="url(#cpuGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Memory Usage Chart */}
      <div className="bg-surface rounded-lg p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-medium text-foreground">
            {t('docker.memoryUsage', 'Memory Usage')}
          </h3>
          {stats && (
            <span className="ml-auto text-sm font-medium text-accent">
              {formatBytes(stats.memoryUsage)} / {formatBytes(stats.memoryLimit)}
            </span>
          )}
          {hostMemoryBytes && (
            <span className="text-xs text-destructive ml-2">
              Host: {formatBytes(hostMemoryBytes)}
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartTheme.memoryColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartTheme.memoryColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
            <XAxis
              dataKey="time"
              tick={{ fill: chartTheme.textColor, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: chartTheme.textColor, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value.toFixed(0)} MB`}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Host memory limit reference line */}
            {hostMemoryMB && (
              <ReferenceLine
                y={hostMemoryMB}
                stroke={chartTheme.hostLimitColor}
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: 'Host Limit',
                  position: 'right',
                  fill: chartTheme.hostLimitColor,
                  fontSize: 10,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="memoryUsage"
              name="Memory"
              unit=" MB"
              stroke={chartTheme.memoryColor}
              fill="url(#memoryGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Network I/O Chart */}
      <div className="bg-surface rounded-lg p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Network className="w-4 h-4 text-info" />
          <h3 className="text-sm font-medium text-foreground">
            {t('docker.networkIO', 'Network I/O')}
          </h3>
          {stats && (
            <span className="ml-auto text-xs text-muted-foreground">
              RX: {formatBytes(stats.networkRx)} / TX: {formatBytes(stats.networkTx)}
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
            <XAxis
              dataKey="time"
              tick={{ fill: chartTheme.textColor, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: chartTheme.textColor, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value.toFixed(0)} KB`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="networkRx"
              name="RX"
              unit=" KB"
              stroke={chartTheme.networkRxColor}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="networkTx"
              name="TX"
              unit=" KB"
              stroke={chartTheme.networkTxColor}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Process Count Chart */}
      <div className="bg-surface rounded-lg p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Hash className="w-4 h-4 text-[#DCDCAA]" />
          <h3 className="text-sm font-medium text-foreground">
            {t('docker.processes', 'Processes')}
          </h3>
          {stats && (
            <span className="ml-auto text-sm font-medium text-[#DCDCAA]">{stats.pids}</span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="pidsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartTheme.pidsColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartTheme.pidsColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
            <XAxis
              dataKey="time"
              tick={{ fill: chartTheme.textColor, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: chartTheme.textColor, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="pids"
              name="PIDs"
              stroke={chartTheme.pidsColor}
              fill="url(#pidsGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/**
 * Format timestamp to time string (HH:MM:SS)
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format bytes to human-readable string
 */
export default ContainerStatsCharts;
