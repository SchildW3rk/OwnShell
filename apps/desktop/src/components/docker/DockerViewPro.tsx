/**
 * Docker View Pro (v1.11.0)
 *
 * Enhanced Docker container management UI with containers, images, networks
 * and Compose project management.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useShallow } from 'zustand/react/shallow';
import {
  useComposeAction,
  useDockerCheck,
  useDockerContainersExtended,
  useRemoveContainer,
  useRestartContainer,
  useStartContainer,
  useStopContainer,
} from '../../hooks/docker';
import type { DockerContainerExtended } from '@ownshell/core';
import { AlertTriangle, Container, FileCode, Loader2, Network, Package, RefreshCw } from 'lucide-react';
import { Button, EmptyState, LoadingState, Tabs } from '@ownshell/ui';
import { LOCAL_DOCKER_TARGET_ID } from '../../lib/docker-target';
import { ContainersTab } from './view-pro/ContainersTab';
import type { ContainerFilter, DockerViewProProps, MainTab } from './view-pro/types';

const ContainerDetailView = React.lazy(() =>
  import('./ContainerDetailView').then((module) => ({ default: module.ContainerDetailView }))
);
const DockerImagesView = React.lazy(() =>
  import('./DockerImagesView').then((module) => ({ default: module.DockerImagesView }))
);
const DockerNetworksView = React.lazy(() =>
  import('./DockerNetworksView').then((module) => ({ default: module.DockerNetworksView }))
);
const ComposeProjectsTab = React.lazy(() =>
  import('./ComposeProjectsTab').then((module) => ({ default: module.ComposeProjectsTab }))
);
const ComposeEditorModal = React.lazy(() =>
  import('./ComposeEditorModal').then((module) => ({ default: module.ComposeEditorModal }))
);

const DockerTabLoading: React.FC = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
  </div>
);

export const DockerViewPro: React.FC<DockerViewProProps> = ({ sessionId, isVisible }) => {
  const { t } = useTranslation();
  const sessions = useTerminalStore(useShallow((state) => state.sessions));
  const terminalSession = sessions.find((session) => session.id === sessionId);
  const isLocal = terminalSession?.kind === 'local';
  const dockerTargetId = isLocal ? LOCAL_DOCKER_TARGET_ID : terminalSession?.sessionId ?? null;

  const [mainTab, setMainTab] = useState<MainTab>('containers');
  const [filter, setFilter] = useState<ContainerFilter>('all');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [selectedContainer, setSelectedContainer] = useState<DockerContainerExtended | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'compose'>('list');
  const [editingComposeProject, setEditingComposeProject] = useState<string | null>(null);

  const dockerCheck = useDockerCheck(dockerTargetId);
  const containersQuery = useDockerContainersExtended(dockerTargetId, {
    showAll: filter !== 'running',
    enabled: dockerCheck.data?.installed && !dockerCheck.data?.permissionDenied,
  });
  const startMutation = useStartContainer(dockerTargetId);
  const stopMutation = useStopContainer(dockerTargetId);
  const restartMutation = useRestartContainer(dockerTargetId);
  const removeMutation = useRemoveContainer(dockerTargetId);
  const composeActionMutation = useComposeAction(dockerTargetId);

  const filterContainers = (containers: DockerContainerExtended[]) => {
    switch (filter) {
      case 'running':
        return containers.filter((container) => container.state === 'running');
      case 'stopped':
        return containers.filter(
          (container) => container.state === 'exited' || container.state === 'dead'
        );
      case 'paused':
        return containers.filter((container) => container.state === 'paused');
      default:
        return containers;
    }
  };

  const toggleProject = (projectName: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectName)) {
      newExpanded.delete(projectName);
    } else {
      newExpanded.add(projectName);
    }
    setExpandedProjects(newExpanded);
  };

  const handleRemove = (containerId: string, containerName: string) => {
    if (confirm(t('docker.removeConfirm', { name: containerName }))) {
      removeMutation.mutate(containerId);
    }
  };

  const { containers, projects, runningCount, totalCount } = useMemo(() => {
    const allContainers = containersQuery.data?.containers || [];
    return {
      containers: filterContainers(allContainers),
      projects: containersQuery.data?.projects || [],
      runningCount: allContainers.filter((container) => container.state === 'running').length,
      totalCount: allContainers.length,
    };
  }, [containersQuery.data, filter]);

  const isLoading = containersQuery.isFetching;
  const isMutating =
    startMutation.isPending ||
    stopMutation.isPending ||
    restartMutation.isPending ||
    removeMutation.isPending ||
    composeActionMutation.isPending;

  if (!dockerTargetId) {
    return <LoadingState message={t('docker.waitingForSSH')} />;
  }

  if (dockerCheck.isLoading) {
    return <LoadingState message={t('docker.checkingDocker')} />;
  }

  if (dockerCheck.data && !dockerCheck.data.installed) {
    return (
      <EmptyState
        icon={Container}
        title={t('docker.dockerNotFound')}
        subtitle={t(isLocal ? 'docker.localDockerNotFoundHint' : 'docker.dockerNotFoundHint')}
        className="bg-background"
        action={
          <Button type="button" variant="secondary" size="sm" onClick={() => dockerCheck.refetch()}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            {t('docker.retry')}
          </Button>
        }
      />
    );
  }

  if (dockerCheck.data?.permissionDenied || containersQuery.data?.permissionDenied) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-destructive" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {t('docker.permissionDenied')}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t(isLocal ? 'docker.localPermissionDeniedHint' : 'docker.permissionDeniedHint')}
          </p>
          {!isLocal && (
            <div className="bg-surface border border-border rounded-lg p-3 text-left mb-4">
              <p className="text-xs text-muted-foreground mb-1">
                {t('docker.permissionDeniedCommand')}
              </p>
              <code className="text-xs text-foreground font-mono">sudo usermod -aG docker $USER</code>
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              dockerCheck.refetch();
              containersQuery.refetch();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            {t('docker.retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (containersQuery.data?.error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('docker.connectionFailed')}
        subtitle={containersQuery.data.error}
        className="bg-background"
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => containersQuery.refetch()}
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            {t('docker.retry')}
          </Button>
        }
      />
    );
  }

  if (selectedContainer && dockerTargetId) {
    return (
      <React.Suspense fallback={<DockerTabLoading />}>
        <ContainerDetailView
          sessionId={dockerTargetId}
          isVisible={isVisible}
          hostId={terminalSession?.host?.id}
          isLocal={isLocal}
          container={selectedContainer}
          onClose={() => setSelectedContainer(null)}
          onStart={
            selectedContainer.state !== 'running'
              ? () => startMutation.mutate(selectedContainer.id)
              : undefined
          }
          onStop={
            selectedContainer.state === 'running'
              ? () => stopMutation.mutate(selectedContainer.id)
              : undefined
          }
          onRestart={
            selectedContainer.state === 'running'
              ? () => restartMutation.mutate(selectedContainer.id)
              : undefined
          }
        />
      </React.Suspense>
    );
  }

  const mainTabs = [
    {
      id: 'containers' as const,
      label: t('docker.containers', 'Containers'),
      icon: <Container className="w-4 h-4" />,
      count: totalCount,
    },
    { id: 'images' as const, label: t('docker.images', 'Images'), icon: <Package className="w-4 h-4" /> },
    {
      id: 'networks' as const,
      label: t('docker.networks', 'Networks'),
      icon: <Network className="w-4 h-4" />,
    },
    {
      id: 'projects' as const,
      label: t('docker.compose.projects', 'Projects'),
      icon: <FileCode className="w-4 h-4" />,
    },
  ].filter((tab) => !isLocal || tab.id !== 'projects');

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <Container className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">Docker</span>
          {dockerCheck.data?.version && (
            <span className="text-xs text-muted-foreground">v{dockerCheck.data.version}</span>
          )}
          {isLocal && (
            <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t('docker.local')}
            </span>
          )}
          {isMutating && <Loader2 className="w-4 h-4 animate-spin text-primary ml-2" />}
        </div>
      </div>

      <Tabs
        tabs={mainTabs}
        activeTab={mainTab}
        onChange={(id) => setMainTab(id as MainTab)}
        variant="pills"
        className="px-4 py-2 bg-surface border-b border-border"
      />

      {mainTab === 'containers' && (
        <ContainersTab
          containers={containers}
          projects={projects}
          filter={filter}
          setFilter={setFilter}
          viewMode={viewMode}
          setViewMode={setViewMode}
          expandedProjects={expandedProjects}
          toggleProject={toggleProject}
          isLoading={isLoading}
          runningCount={runningCount}
          totalCount={totalCount}
          onRefresh={() => containersQuery.refetch()}
          onSelectContainer={setSelectedContainer}
          onStart={(id) => startMutation.mutate(id)}
          onStop={(id) => stopMutation.mutate(id)}
          onRestart={(id) => restartMutation.mutate(id)}
          onRemove={handleRemove}
          onComposeStart={(projectName) =>
            composeActionMutation.mutate({ projectName, action: 'start' })
          }
          onComposeStop={(projectName) =>
            composeActionMutation.mutate({ projectName, action: 'stop' })
          }
          onEditCompose={isLocal ? undefined : setEditingComposeProject}
          isMutating={isMutating}
        />
      )}
      {mainTab === 'images' && dockerTargetId && (
        <React.Suspense fallback={<DockerTabLoading />}>
          <DockerImagesView sessionId={dockerTargetId} />
        </React.Suspense>
      )}
      {mainTab === 'networks' && dockerTargetId && (
        <React.Suspense fallback={<DockerTabLoading />}>
          <DockerNetworksView sessionId={dockerTargetId} />
        </React.Suspense>
      )}
      {mainTab === 'projects' && dockerTargetId && !isLocal && (
        <React.Suspense fallback={<DockerTabLoading />}>
          <ComposeProjectsTab sessionId={dockerTargetId} />
        </React.Suspense>
      )}

      {editingComposeProject && dockerTargetId && !isLocal && (
        <React.Suspense fallback={null}>
          <ComposeEditorModal
            sessionId={dockerTargetId}
            projectName={editingComposeProject}
            onClose={() => setEditingComposeProject(null)}
            onStackUpdated={() => containersQuery.refetch()}
          />
        </React.Suspense>
      )}
    </div>
  );
};

export default DockerViewPro;
