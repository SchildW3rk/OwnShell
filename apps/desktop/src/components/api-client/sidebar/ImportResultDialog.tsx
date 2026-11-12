import React, { useState } from 'react';
import { Button, Modal } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCreateVaultEnvironment } from '../../../hooks/vault/useVaultQueries';

type ImportResult = NonNullable<Awaited<ReturnType<typeof window.electronAPI.apiClient.transfer.importPostman>>>;
export type ImportSuccess = Exclude<ImportResult, { errorCode: string }>;

interface ImportResultDialogProps {
  result: ImportSuccess;
  onClose: () => void;
}

/** After an import: what was imported and what was skipped; a Postman environment can become a vault environment. */
export const ImportResultDialog: React.FC<ImportResultDialogProps> = ({ result, onClose }) => {
  const { t } = useTranslation();
  const createEnvironment = useCreateVaultEnvironment();
  const [project, setProject] = useState('Postman');

  if (result.kind === 'environment') {
    const handleCreate = () =>
      createEnvironment.mutate(
        {
          name: result.name.slice(0, 255),
          project: project.trim(),
          description: null,
          // Encrypted by the vault like every environment value.
          variables: result.variables,
          host_id: null,
          default_remote_path: null,
        },
        {
          onSuccess: () => {
            toast.success(t('api.transfer.environmentCreated', { name: result.name }));
            onClose();
          },
          onError: (error) => toast.error(t('api.errors.changeFailed', { error: error.message })),
        }
      );
    return (
      <Modal
        isOpen
        onClose={onClose}
        title={t('api.transfer.environmentTitle')}
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!project.trim() || result.variables.length === 0 || createEnvironment.isPending}
            >
              {t('api.transfer.createEnvironment')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>{t('api.transfer.environmentSummary', { name: result.name, count: result.variables.length })}</p>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('api.transfer.environmentProject')}
            <input
              type="text"
              value={project}
              maxLength={255}
              onChange={(event) => setProject(event.target.value)}
              className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          {result.skipped.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('api.transfer.environmentSkipped', { names: result.skipped.join(', ') })}
            </p>
          )}
        </div>
      </Modal>
    );
  }

  const warnings = Object.entries(result.warnings).filter(([, count]) => (count ?? 0) > 0);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('api.transfer.summaryTitle')}
      size="md"
      footer={
        <Button type="button" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          {t('api.transfer.summaryCounts', {
            requests: result.requests,
            folders: result.folders,
            variables: result.variables,
          })}
        </p>
        {warnings.length > 0 && (
          <div>
            <p className="mb-1 font-medium">{t('api.transfer.skippedTitle')}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {warnings.map(([code, count]) => (
                <li key={code}>{t(`api.transfer.warnings.${code}`, { count })}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};
