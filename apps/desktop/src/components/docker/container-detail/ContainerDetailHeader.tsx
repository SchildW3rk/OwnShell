import React from 'react';
import type { DockerContainerExtended } from '@ownshell/core';
import { Play, RotateCcw, Square, X } from 'lucide-react';
import { Button, StatusDot } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { formatName } from '../utils';

interface ContainerDetailHeaderProps {
  container: DockerContainerExtended;
  isRunning: boolean;
  onClose: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
}

export const ContainerDetailHeader: React.FC<ContainerDetailHeaderProps> = ({
  container,
  isRunning,
  onClose,
  onStart,
  onStop,
  onRestart,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
      <div className="flex items-center gap-3">
        <StatusDot variant={isRunning ? 'success' : 'error'} size="lg" title={container.state} />
        <div>
          <h2 className="text-sm font-semibold text-foreground">{formatName(container.names)}</h2>
          <p className="text-xs text-muted-foreground font-mono">{container.image}</p>
        </div>
        <span
          className={`px-2 py-0.5 text-xs rounded ${
            isRunning ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
          }`}
        >
          {container.state}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {!isRunning && onStart && (
          <Button variant="ghost" size="sm" onClick={onStart} title={t('docker.start')}>
            <Play className="w-4 h-4 text-success" />
          </Button>
        )}
        {isRunning && onStop && (
          <Button variant="ghost" size="sm" onClick={onStop} title={t('docker.stop')}>
            <Square className="w-4 h-4 text-destructive" />
          </Button>
        )}
        {isRunning && onRestart && (
          <Button variant="ghost" size="sm" onClick={onRestart} title={t('docker.restart')}>
            <RotateCcw className="w-4 h-4 text-warning" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
