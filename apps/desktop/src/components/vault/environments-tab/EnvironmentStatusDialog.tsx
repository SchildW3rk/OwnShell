import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

interface EnvironmentStatusDialogProps {
  message: string;
  onClose: () => void;
}

export const EnvironmentStatusDialog: React.FC<EnvironmentStatusDialogProps> = ({
  message,
  onClose,
}) => {
  const { t } = useTranslation();
  const isSuccess = message.includes(t('vault.deploySuccess'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-96 max-w-[90vw] rounded-lg border border-border bg-card shadow-2xl transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 transition-colors duration-200">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              isSuccess ? 'bg-green-500/20' : 'bg-destructive/20'
            }`}
          >
            {isSuccess ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            {isSuccess ? t('common.success') : t('common.error')}
          </h3>
        </div>

        <div className="px-5 py-4">
          <p className="whitespace-pre-line text-sm text-muted-foreground">{message}</p>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-5 py-4 transition-colors duration-200">
          <Button variant="primary" size="sm" onClick={onClose} className="no-drag">
            {t('common.ok')}
          </Button>
        </div>
      </div>
    </div>
  );
};
