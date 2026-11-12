/**
 * Container Detail View
 *
 * Shows container usage, logs, console and network management.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Cable, FileText, Plug, Terminal } from 'lucide-react';
import { Tabs } from '@ownshell/ui';
import type { DockerContainerStats } from '@ownshell/core';
import { useDockerLogs, useDockerStats } from '../../hooks/docker';

import { ContainerDetailHeader } from './container-detail/ContainerDetailHeader';
import { StatsSummaryBar } from './container-detail/StatsSummaryBar';
import type { ContainerDetailViewProps, TabType } from './container-detail/types';

const UsageTab = React.lazy(() =>
  import('./container-detail/UsageTab').then((module) => ({ default: module.UsageTab }))
);
const LogsTab = React.lazy(() =>
  import('./container-detail/LogsTab').then((module) => ({ default: module.LogsTab }))
);
const ConsoleTab = React.lazy(() =>
  import('./container-detail/ConsoleTab').then((module) => ({ default: module.ConsoleTab }))
);
const PortsTab = React.lazy(() =>
  import('./container-detail/PortsTab').then((module) => ({ default: module.PortsTab }))
);
const NetworksTab = React.lazy(() =>
  import('./container-detail/NetworksTab').then((module) => ({ default: module.NetworksTab }))
);

const ContainerDetailTabLoading: React.FC = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
  </div>
);

export const ContainerDetailView: React.FC<ContainerDetailViewProps> = ({
  sessionId,
  isVisible,
  hostId,
  isLocal = false,
  container,
  onClose,
  onStart,
  onStop,
  onRestart,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('usage');
  const [statsHistory, setStatsHistory] = useState<DockerContainerStats[]>([]);
  const [logTail, setLogTail] = useState(500);

  const isRunning = container.state === 'running';
  const statsQuery = useDockerStats(sessionId, container.id, {
    enabled: isVisible && activeTab === 'usage' && isRunning,
    refetchInterval: 2000,
  });
  const logsQuery = useDockerLogs(sessionId, container.id, {
    tail: logTail,
    enabled: isVisible && activeTab === 'logs',
  });

  useEffect(() => {
    if (statsQuery.data) {
      setStatsHistory((prev) => {
        const newHistory = [...prev, statsQuery.data!];
        return newHistory.length > 30 ? newHistory.slice(-30) : newHistory;
      });
    }
  }, [statsQuery.data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on container change
  useEffect(() => {
    setStatsHistory([]);
  }, [container.id]);

  const tabs = [
    {
      id: 'usage' as const,
      label: t('docker.tabs.usage', 'Usage'),
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: 'logs' as const,
      label: t('docker.tabs.logs', 'Logs'),
      icon: <FileText className="w-4 h-4" />,
    },
    ...(!isLocal
      ? [
          {
            id: 'console' as const,
            label: t('docker.tabs.console', 'Console'),
            icon: <Terminal className="w-4 h-4" />,
          },
          {
            id: 'ports' as const,
            label: t('docker.tabs.ports', 'Ports'),
            icon: <Cable className="w-4 h-4" />,
          },
        ]
      : []),
    {
      id: 'networks' as const,
      label: t('docker.tabs.networks', 'Networks'),
      icon: <Plug className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      <ContainerDetailHeader
        container={container}
        isRunning={isRunning}
        onClose={onClose}
        onStart={onStart}
        onStop={onStop}
        onRestart={onRestart}
      />

      {isRunning && statsQuery.data && <StatsSummaryBar stats={statsQuery.data} />}

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as TabType)}
        variant="pills"
        className="px-4 py-2 bg-surface border-b border-border"
      />

      <div className="flex-1 overflow-hidden">
        {activeTab === 'usage' && (
          <React.Suspense fallback={<ContainerDetailTabLoading />}>
            <UsageTab
              container={container}
              stats={statsQuery.data}
              statsHistory={statsHistory}
              isLoading={statsQuery.isLoading}
            />
          </React.Suspense>
        )}
        {activeTab === 'logs' && (
          <React.Suspense fallback={<ContainerDetailTabLoading />}>
            <LogsTab
              sessionId={sessionId}
              containerId={container.id}
              logs={logsQuery.data || ''}
              isLoading={logsQuery.isLoading}
              tail={logTail}
              onTailChange={setLogTail}
              onRefresh={() => logsQuery.refetch()}
              allowStreaming={!isLocal}
              isVisible={isVisible}
            />
          </React.Suspense>
        )}
        {activeTab === 'console' && (
          <React.Suspense fallback={<ContainerDetailTabLoading />}>
            <ConsoleTab sessionId={sessionId} containerId={container.id} isRunning={isRunning} />
          </React.Suspense>
        )}
        {activeTab === 'ports' && (
          <React.Suspense fallback={<ContainerDetailTabLoading />}>
            <PortsTab sessionId={sessionId} hostId={hostId} container={container} />
          </React.Suspense>
        )}
        {activeTab === 'networks' && (
          <React.Suspense fallback={<ContainerDetailTabLoading />}>
            <NetworksTab sessionId={sessionId} containerId={container.id} />
          </React.Suspense>
        )}
      </div>
    </div>
  );
};

export default ContainerDetailView;
