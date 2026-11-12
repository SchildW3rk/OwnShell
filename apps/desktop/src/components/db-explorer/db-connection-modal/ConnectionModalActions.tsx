import React from 'react';
import { CheckCircle2, Database, Loader2 } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

interface ConnectionModalActionsProps {
  isFormValid: boolean;
  isTesting: boolean;
  isSQLite: boolean;
  isSaving: boolean;
  isEditMode: boolean;
  onClose: () => void;
  onTestConnection: () => void;
}

export const ConnectionModalActions: React.FC<ConnectionModalActionsProps> = ({
  isFormValid,
  isTesting,
  isSQLite,
  isSaving,
  isEditMode,
  onClose,
  onTestConnection,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex justify-between items-center gap-2 pt-4 mt-2 border-t border-border">
      <Button
        type="button"
        variant="secondary"
        onClick={onTestConnection}
        disabled={!isFormValid || isTesting || isSQLite}
        title={
          isSQLite
            ? t('db.testNotAvailable', 'Test not available for SQLite')
            : t('db.testConnection', 'Test connection')
        }
      >
        {isTesting ? (
          <Loader2 className="w-4 h-4 animate-spin mr-1" />
        ) : (
          <CheckCircle2 className="w-4 h-4 mr-1" />
        )}
        {t('db.testConnection', 'Test Connection')}
      </Button>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={!isFormValid || isSaving}>
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1" />
          ) : (
            <Database className="w-4 h-4 mr-1" />
          )}
          {isEditMode ? t('common.save', 'Save') : t('common.create', 'Create')}
        </Button>
      </div>
    </div>
  );
};
