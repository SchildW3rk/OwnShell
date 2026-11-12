import React from 'react';
import { Container, Terminal } from 'lucide-react';
import { Input, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import type { DBConnectionFormData } from './types';

interface ExecutionModeFieldsProps {
  formData: DBConnectionFormData;
  connectionMode?: 'local' | 'ssh';
  onChange: (formData: DBConnectionFormData) => void;
}

export const ExecutionModeFields: React.FC<ExecutionModeFieldsProps> = ({
  formData,
  connectionMode = 'local',
  onChange,
}) => {
  const { t } = useTranslation();
  const isSshTarget = connectionMode === 'ssh';

  return (
    <div className="border-t border-border pt-4">
      <span className="block text-sm font-medium text-foreground mb-2">
        {isSshTarget
          ? t('database.connectionTarget', 'Connection Target')
          : t('database.executionMode', 'Export/Import Execution')}
      </span>
      <div className="flex gap-2 mb-3" role="radiogroup" aria-label="Execution Mode">
        <button
          type="button"
          role="radio"
          aria-checked={formData.executionMode === 'direct'}
          onClick={() => onChange({ ...formData, executionMode: 'direct' })}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded border text-sm font-medium transition-colors',
            formData.executionMode === 'direct'
              ? 'bg-success/20 border-success text-success'
              : 'bg-secondary border-border text-foreground hover:border-border'
          )}
        >
          <Terminal className="w-4 h-4" />
          {isSshTarget
            ? t('database.targetDirect', 'Host/IP')
            : t('database.executionDirect', 'Direct')}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={formData.executionMode === 'docker'}
          onClick={() => onChange({ ...formData, executionMode: 'docker' })}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded border text-sm font-medium transition-colors',
            formData.executionMode === 'docker'
              ? 'bg-primary/20 border-primary text-primary'
              : 'bg-secondary border-border text-foreground hover:border-border'
          )}
        >
          <Container className="w-4 h-4" />
          {t('database.executionDocker', 'Docker')}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {formData.executionMode === 'direct' &&
          (isSshTarget
            ? t(
                'database.targetDirectHint',
                'Tunnel to the host and port visible from the SSH host'
              )
            : t('database.executionDirectHint', 'Run pg_dump/mysqldump directly on your machine'))}
        {formData.executionMode === 'docker' &&
          (isSshTarget
            ? t(
                'database.targetDockerHint',
                'Resolve the Docker container IP on the SSH host and tunnel to its internal DB port'
              )
            : t(
                'database.executionDockerHint',
                'Run pg_dump/mysqldump inside a Docker container (useful for version matching)'
              ))}
      </p>

      {formData.executionMode === 'docker' && (
        <div>
          <label
            htmlFor="dockerContainer"
            className="block text-sm font-medium text-foreground mb-1"
          >
            {isSshTarget
              ? t('database.dockerTargetContainer', 'Database Container Name')
              : t('database.dockerContainer', 'Docker Container Name')}{' '}
            *
          </label>
          <Input
            id="dockerContainer"
            value={formData.dockerContainer}
            onChange={(e) => onChange({ ...formData, dockerContainer: e.target.value })}
            placeholder="postgres-container"
            required={formData.executionMode === 'docker'}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {isSshTarget
              ? t(
                  'database.dockerTargetContainerHint',
                  'The container must be reachable by Docker on the selected SSH host'
                )
              : t(
                  'database.dockerContainerHint',
                  'The name or ID of the Docker container running your database'
                )}
          </p>
        </div>
      )}
    </div>
  );
};
