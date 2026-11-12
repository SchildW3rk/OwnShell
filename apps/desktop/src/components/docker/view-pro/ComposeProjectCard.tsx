import React from 'react';
import type { DockerComposeProject, DockerContainerExtended } from '@ownshell/core';
import { ChevronDown, ChevronRight, FileCode, Layers, Play, Square } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { formatName } from '../utils';
import { ContainerRow } from './ContainerRow';

interface ComposeProjectCardProps {
  project: DockerComposeProject;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectContainer: (container: DockerContainerExtended) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onRemove: (id: string, name: string) => void;
  onComposeStart: () => void;
  onComposeStop: () => void;
  onEditCompose?: () => void;
  isMutating: boolean;
}

export const ComposeProjectCard = React.memo<ComposeProjectCardProps>(
  function ComposeProjectCard({
    project,
    isExpanded,
    onToggle,
    onSelectContainer,
    onStart,
    onStop,
    onRestart,
    onRemove,
    onComposeStart,
    onComposeStop,
    onEditCompose,
    isMutating,
  }) {
    const { t } = useTranslation();
    const allRunning = project.runningCount === project.totalCount;
    const allStopped = project.runningCount === 0;

    return (
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <button
          type="button"
          className="flex items-center justify-between w-full px-3 py-2 cursor-pointer hover:bg-secondary text-left"
          onClick={onToggle}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Layers className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">{project.name}</span>
            <span className="text-xs text-muted-foreground">
              ({project.runningCount}/{project.totalCount})
            </span>
          </div>

          {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: keyboard handled by child buttons */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {onEditCompose && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onEditCompose}
                title={t('docker.editCompose', 'Edit Compose')}
              >
                <FileCode className="w-3.5 h-3.5 text-primary" />
              </Button>
            )}
            {!allRunning && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onComposeStart}
                disabled={isMutating}
                title={t('docker.startAll', 'Start all')}
              >
                <Play className="w-3.5 h-3.5 text-success" />
              </Button>
            )}
            {!allStopped && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onComposeStop}
                disabled={isMutating}
                title={t('docker.stopAll', 'Stop all')}
              >
                <Square className="w-3.5 h-3.5 text-destructive" />
              </Button>
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="border-t border-border p-2 space-y-1">
            {project.containers.map((container) => (
              <ContainerRow
                key={container.id}
                container={container}
                compact
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
    );
  }
);
