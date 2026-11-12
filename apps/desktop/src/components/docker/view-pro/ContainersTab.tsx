import React from 'react';
import type { DockerComposeProject, DockerContainerExtended } from '@ownshell/core';
import { Container, Layers, RefreshCw } from 'lucide-react';
import { Button, EmptyState, LoadingState } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { formatName } from '../utils';
import { ComposeProjectCard } from './ComposeProjectCard';
import { ContainerRow } from './ContainerRow';
import type { ContainerFilter } from './types';

interface ContainersTabProps {
  containers: DockerContainerExtended[];
  projects: DockerComposeProject[];
  filter: ContainerFilter;
  setFilter: (filter: ContainerFilter) => void;
  viewMode: 'list' | 'compose';
  setViewMode: (mode: 'list' | 'compose') => void;
  expandedProjects: Set<string>;
  toggleProject: (name: string) => void;
  isLoading: boolean;
  runningCount: number;
  totalCount: number;
  onRefresh: () => void;
  onSelectContainer: (container: DockerContainerExtended) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onRemove: (id: string, name: string) => void;
  onComposeStart: (projectName: string) => void;
  onComposeStop: (projectName: string) => void;
  onEditCompose?: (projectName: string) => void;
  isMutating: boolean;
}

export const ContainersTab: React.FC<ContainersTabProps> = ({
  containers,
  projects,
  filter,
  setFilter,
  viewMode,
  setViewMode,
  expandedProjects,
  toggleProject,
  isLoading,
  runningCount,
  totalCount,
  onRefresh,
  onSelectContainer,
  onStart,
  onStop,
  onRestart,
  onRemove,
  onComposeStart,
  onComposeStop,
  onEditCompose,
  isMutating,
}) => {
  const { t } = useTranslation();
  const filters: { id: ContainerFilter; label: string }[] = [
    { id: 'all', label: t('docker.filterAll', 'All') },
    { id: 'running', label: t('docker.filterRunning', 'Running') },
    { id: 'stopped', label: t('docker.filterStopped', 'Stopped') },
    { id: 'paused', label: t('docker.filterPaused', 'Paused') },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-background border-b border-border">
        <div className="flex items-center gap-2">
          {filters.map((option) => (
            <button
              type="button"
              key={option.id}
              onClick={() => setFilter(option.id)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filter === option.id
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              {option.label}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-2">
            {runningCount}/{totalCount}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {projects.length > 0 && (
            <div className="flex items-center bg-background rounded border border-border">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2 py-1 text-xs rounded-l ${
                  viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                }`}
                title="List view"
              >
                <Container className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compose')}
                className={`px-2 py-1 text-xs rounded-r ${
                  viewMode === 'compose' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                }`}
                title="Compose view"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && containers.length === 0 ? (
          <LoadingState />
        ) : containers.length === 0 ? (
          <EmptyState icon={Container} title={t('docker.noContainers')} />
        ) : viewMode === 'compose' && projects.length > 0 ? (
          <div className="p-2 space-y-2">
            {projects.map((project) => (
              <ComposeProjectCard
                key={project.name}
                project={project}
                isExpanded={expandedProjects.has(project.name)}
                onToggle={() => toggleProject(project.name)}
                onSelectContainer={onSelectContainer}
                onStart={onStart}
                onStop={onStop}
                onRestart={onRestart}
                onRemove={onRemove}
                onComposeStart={() => onComposeStart(project.name)}
                onComposeStop={() => onComposeStop(project.name)}
                onEditCompose={onEditCompose ? () => onEditCompose(project.name) : undefined}
                isMutating={isMutating}
              />
            ))}
            {containers.filter((container) => !container.composeProject).length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs text-muted-foreground uppercase tracking-wider px-2 mb-2">
                  {t('docker.standaloneContainers', 'Standalone Containers')}
                </h3>
                {containers
                  .filter((container) => !container.composeProject)
                  .map((container) => (
                    <ContainerRow
                      key={container.id}
                      container={container}
                      onSelect={() => onSelectContainer(container)}
                      onStart={() => onStart(container.id)}
                      onStop={() => onStop(container.id)}
                      onRestart={() => onRestart(container.id)}
                      onRemove={() => onRemove(container.id, formatName(container.names))}
                      isMutating={isMutating}
                    />
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {containers.map((container) => (
              <ContainerRow
                key={container.id}
                container={container}
                onSelect={() => onSelectContainer(container)}
                onStart={() => onStart(container.id)}
                onStop={() => onStop(container.id)}
                onRestart={() => onRestart(container.id)}
                onRemove={() => onRemove(container.id, formatName(container.names))}
                isMutating={isMutating}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
