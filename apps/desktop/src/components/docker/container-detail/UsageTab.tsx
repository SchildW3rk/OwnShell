import React from 'react';
import type { DockerContainerExtended, DockerContainerStats } from '@ownshell/core';
import { Activity, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ContainerStatsCharts } from '../ContainerStatsCharts';

interface UsageTabProps {
  container: DockerContainerExtended;
  stats: DockerContainerStats | null | undefined;
  statsHistory: DockerContainerStats[];
  isLoading: boolean;
}

export const UsageTab: React.FC<UsageTabProps> = ({
  container,
  stats,
  statsHistory,
  isLoading,
}) => {
  const { t } = useTranslation();

  if (container.state !== 'running') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            {t('docker.containerNotRunning', 'Container is not running')}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading && statsHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 overflow-auto h-full">
      <ContainerStatsCharts stats={stats} statsHistory={statsHistory} />
    </div>
  );
};
