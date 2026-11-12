import React, { useState } from 'react';
import type { ApiCollectionsTable, RequestAuthType } from '@ownshell/core';
import { Button, Modal } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { useUpdateApiCollection } from '../../../hooks/api/useApiQueries';
import toast from 'react-hot-toast';
import { AuthEditor, hasInsecureOAuthUrl } from '../AuthEditor';

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
    if (hasInsecureOAuthUrl(authType, authConfig)) {
      toast.error(t('api.errors.OAUTH_INSECURE_URL'));
      return;
    }
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
      <div className="h-[480px] -mx-2">
        <AuthEditor
          authType={authType}
          authConfig={authConfig}
          onAuthTypeChange={setAuthType}
          onAuthConfigChange={setAuthConfig}
          isCollection
          oauthOwner={{ type: 'collection', id: collection.id }}
          // Resolves like a request in this folder (no environment: folders have none).
          buildOAuthConfig={() => ({
            method: 'GET',
            url: 'http://localhost',
            params: '[]',
            headers: '[]',
            body: '',
            bodyType: 'none',
            authType,
            authConfig,
            collectionId: collection.id,
            requestId: null,
            networkHostId: null,
            environmentId: null,
          })}
        />
      </div>
    </Modal>
  );
};
