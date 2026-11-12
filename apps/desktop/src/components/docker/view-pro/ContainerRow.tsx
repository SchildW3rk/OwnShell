import React from 'react';
import type { DockerContainerExtended } from '@ownshell/core';
import { Activity, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import { Button, StatusDot } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { formatName, getStateVariant } from '../utils';

interface ContainerRowProps {
  container: DockerContainerExtended;
  compact?: boolean;
  onSelect: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onRemove: () => void;
  isMutating: boolean;
}

export const ContainerRow = React.memo<ContainerRowProps>(function ContainerRow({
  container,
  compact = false,
  onSelect,
  onStart,
  onStop,
  onRestart,
  onRemove,
  isMutating,
}) {
  const { t } = useTranslation();
  const isRunning = container.state === 'running';

  return (
    <div
      className={`flex items-center justify-between ${compact ? 'px-2 py-1.5' : 'px-3 py-2'} rounded hover:bg-secondary cursor-pointer group`}
    >
      <button
        type="button"
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
        onClick={onSelect}
      >
        <StatusDot variant={getStateVariant(container.state)} />
        <span
          className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-foreground truncate`}
          title={formatName(container.names)}
        >
          {formatName(container.names)}
        </span>
        {container.composeService && !compact && (
          <span className="text-xs text-muted-foreground truncate">
            [{container.composeService}]
          </span>
        )}
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-muted-foreground truncate`}>
          {container.image}
        </span>
      </button>

      <div className="flex items-center gap-2">
        <span
          className={`px-1.5 py-0.5 text-[10px] rounded ${
            isRunning ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
          }`}
        >
          {container.state}
        </span>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isRunning && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onStart();
              }}
              disabled={isMutating}
              className="!p-1"
            >
              <Play className="w-3.5 h-3.5 text-success" />
            </Button>
          )}
          {isRunning && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onStop();
                }}
                disabled={isMutating}
                className="!p-1"
              >
                <Square className="w-3.5 h-3.5 text-destructive" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestart();
                }}
                disabled={isMutating}
                className="!p-1"
              >
                <RotateCcw className="w-3.5 h-3.5 text-warning" />
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="!p-1"
            title={t('docker.viewDetails', 'View details')}
          >
            <Activity className="w-3.5 h-3.5 text-primary" />
          </Button>
          {!isRunning && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              disabled={isMutating}
              className="!p-1"
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
