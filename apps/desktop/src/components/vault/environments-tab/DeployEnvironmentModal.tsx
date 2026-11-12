import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { VaultEnvironmentsTable } from '@ownshell/core';
import { useTranslation } from 'react-i18next';

interface DeployEnvironmentModalProps {
  environment: VaultEnvironmentsTable;
  deployPath: string;
  isDeploying: boolean;
  onDeployPathChange: (deployPath: string) => void;
  onDeploy: () => void;
  onClose: () => void;
}

export const DeployEnvironmentModal: React.FC<DeployEnvironmentModalProps> = ({
  environment,
  deployPath,
  isDeploying,
  onDeployPathChange,
  onDeploy,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-semibold text-foreground">
          {t('vault.deployModalTitle')}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t('vault.deployModalSubtitle', { name: environment.name })}
        </p>
        <div className="mb-4">
          <label className="mb-1 block text-sm text-muted-foreground">
            {t('vault.remotePath')}
          </label>
          <input
            type="text"
            value={deployPath}
            onChange={(e) => onDeployPathChange(e.target.value)}
            className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-foreground transition-colors duration-200"
            placeholder={t('vault.remotePathPlaceholder')}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('vault.remotePathHint')}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('vault.cancel')}
          </Button>
          <Button onClick={onDeploy} disabled={isDeploying || !deployPath}>
            {isDeploying ? <Loader2 className="h-4 w-4 animate-spin" /> : t('vault.deploy')}
          </Button>
        </div>
      </div>
    </div>
  );
};
