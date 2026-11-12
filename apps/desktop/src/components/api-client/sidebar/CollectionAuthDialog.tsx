import React, { useState } from 'react';
import type { ApiCollectionsTable, RequestAuthType } from '@ownshell/core';
import { Button, Modal } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { useUpdateApiCollection } from '../../../hooks/api/useApiQueries';
import { AuthEditor } from '../AuthEditor';

interface CollectionAuthDialogProps {
  collection: ApiCollectionsTable;
  onClose: () => void;
}

/** Auth for a folder; requests (and subfolders) set to "inherit" use it. */
export const CollectionAuthDialog: React.FC<CollectionAuthDialogProps> = ({
  collection,
  onClose,
}) => {
  const { t } = useTranslation();
  const updateCollection = useUpdateApiCollection();
  const [authType, setAuthType] = useState<RequestAuthType>(collection.auth_type ?? 'inherit');
  const [authConfig, setAuthConfig] = useState(collection.auth_config ?? '{}');

  const handleSave = () => {
    updateCollection.mutate(
      { id: collection.id, data: { auth_type: authType, auth_config: authConfig } },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('api.collectionAuth.title', { name: collection.name })}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={updateCollection.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="h-[360px] -mx-2">
        <AuthEditor
          authType={authType}
          authConfig={authConfig}
          onAuthTypeChange={setAuthType}
          onAuthConfigChange={setAuthConfig}
          isCollection
        />
      </div>
    </Modal>
  );
};
