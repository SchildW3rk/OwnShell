import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmDialog, Input, Modal } from '@ownshell/ui';

import { HostForm } from '../../components/HostForm';
import { S3ConnectionModal } from '../../components/S3ConnectionModal';
import { DBConnectionModal } from '../../components/db-explorer';
import type {
  ApiCollectionsTable,
  ApiRequestsTable,
  DBConnectionsTable,
  EditingS3Connection,
  HostsTable,
} from './types';

interface MainDialogsProps {
  isHostFormOpen: boolean;
  editingHost?: HostsTable;
  defaultConnectionType: 'ssh' | 'sftp_only';
  onHostFormClose: () => void;
  isS3ModalOpen: boolean;
  editingS3Connection?: EditingS3Connection;
  onS3ModalClose: () => void;
  isDBModalOpen: boolean;
  editingDBConnection: DBConnectionsTable | null;
  onDBModalClose: () => void;
  onDBCreated: (connectionId: string) => void;
  deleteHostConfirm: HostsTable | null;
  deleteS3Confirm: string | null;
  deleteDBConfirm: string | null;
  isDeleting: boolean;
  onConfirmDeleteHost: () => void;
  onCancelDeleteHost: () => void;
  onConfirmDeleteS3: () => void;
  onCancelDeleteS3: () => void;
  onConfirmDeleteDB: () => void;
  onCancelDeleteDB: () => void;
  deleteApiCollectionConfirm: string | null;
  deleteApiRequestConfirm: string | null;
  onConfirmDeleteApiCollection: () => void;
  onCancelDeleteApiCollection: () => void;
  onConfirmDeleteApiRequest: () => void;
  onCancelDeleteApiRequest: () => void;
  editingApiCollection: ApiCollectionsTable | null;
  editingApiRequest: ApiRequestsTable | null;
  editApiName: string;
  onEditApiNameChange: (name: string) => void;
  onCancelEditApiCollection: () => void;
  onSaveApiCollection: () => void;
  isSavingApiCollection: boolean;
  onCancelEditApiRequest: () => void;
  onSaveApiRequest: () => void;
  isSavingApiRequest: boolean;
}

export const MainDialogs: React.FC<MainDialogsProps> = ({
  isHostFormOpen,
  editingHost,
  defaultConnectionType,
  onHostFormClose,
  isS3ModalOpen,
  editingS3Connection,
  onS3ModalClose,
  isDBModalOpen,
  editingDBConnection,
  onDBModalClose,
  onDBCreated,
  deleteHostConfirm,
  deleteS3Confirm,
  deleteDBConfirm,
  isDeleting,
  onConfirmDeleteHost,
  onCancelDeleteHost,
  onConfirmDeleteS3,
  onCancelDeleteS3,
  onConfirmDeleteDB,
  onCancelDeleteDB,
  deleteApiCollectionConfirm,
  deleteApiRequestConfirm,
  onConfirmDeleteApiCollection,
  onCancelDeleteApiCollection,
  onConfirmDeleteApiRequest,
  onCancelDeleteApiRequest,
  editingApiCollection,
  editingApiRequest,
  editApiName,
  onEditApiNameChange,
  onCancelEditApiCollection,
  onSaveApiCollection,
  isSavingApiCollection,
  onCancelEditApiRequest,
  onSaveApiRequest,
  isSavingApiRequest,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <HostForm
        isOpen={isHostFormOpen}
        onClose={onHostFormClose}
        host={editingHost}
        defaultConnectionType={defaultConnectionType}
      />

      <S3ConnectionModal
        isOpen={isS3ModalOpen}
        onClose={onS3ModalClose}
        editConnection={editingS3Connection}
      />

      {isDBModalOpen && (
        <DBConnectionModal
          onClose={onDBModalClose}
          onCreated={onDBCreated}
          editConnection={editingDBConnection ?? undefined}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteHostConfirm}
        title={t('hosts.deleteTitle')}
        message={t('hosts.deleteConfirm', { name: deleteHostConfirm?.label })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isLoading={isDeleting}
        onConfirm={onConfirmDeleteHost}
        onCancel={onCancelDeleteHost}
      />
      <ConfirmDialog
        isOpen={!!deleteS3Confirm}
        title={t('s3.deleteTitle')}
        message={t('s3.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isLoading={isDeleting}
        onConfirm={onConfirmDeleteS3}
        onCancel={onCancelDeleteS3}
      />
      <ConfirmDialog
        isOpen={!!deleteDBConfirm}
        title={t('database.deleteTitle', 'Delete Database Connection')}
        message={t(
          'database.deleteConfirm',
          'Are you sure you want to delete this database connection?'
        )}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isLoading={isDeleting}
        onConfirm={onConfirmDeleteDB}
        onCancel={onCancelDeleteDB}
      />

      <ConfirmDialog
        isOpen={!!deleteApiCollectionConfirm}
        title={t('api.deleteCollectionTitle', 'Delete Collection')}
        message={t(
          'api.deleteCollectionConfirm',
          'Are you sure you want to delete this collection and all its contents?'
        )}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={onConfirmDeleteApiCollection}
        onCancel={onCancelDeleteApiCollection}
      />
      <ConfirmDialog
        isOpen={!!deleteApiRequestConfirm}
        title={t('api.deleteRequestTitle', 'Delete Request')}
        message={t('api.deleteRequestConfirm', 'Are you sure you want to delete this request?')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={onConfirmDeleteApiRequest}
        onCancel={onCancelDeleteApiRequest}
      />

      <RenameApiDialog
        isOpen={!!editingApiCollection}
        title={t('api.renameCollection', 'Rename Collection')}
        label={t('api.collectionName', 'Collection Name')}
        inputId="collection-name"
        value={editApiName}
        isSaving={isSavingApiCollection}
        onChange={onEditApiNameChange}
        onCancel={onCancelEditApiCollection}
        onSave={onSaveApiCollection}
      />

      <RenameApiDialog
        isOpen={!!editingApiRequest}
        title={t('api.renameRequest', 'Rename Request')}
        label={t('api.requestName', 'Request Name')}
        inputId="request-name"
        value={editApiName}
        isSaving={isSavingApiRequest}
        onChange={onEditApiNameChange}
        onCancel={onCancelEditApiRequest}
        onSave={onSaveApiRequest}
      />
    </>
  );
};

interface RenameApiDialogProps {
  isOpen: boolean;
  title: string;
  label: string;
  inputId: string;
  value: string;
  isSaving: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

const RenameApiDialog: React.FC<RenameApiDialogProps> = ({
  isOpen,
  title,
  label,
  inputId,
  value,
  isSaving,
  onChange,
  onCancel,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={onSave} disabled={!value.trim() || isSaving}>
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={inputId} className="block text-sm font-medium text-foreground mb-1.5">
            {label}
          </label>
          <Input
            id={inputId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={label}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) {
                onSave();
              }
            }}
          />
        </div>
      </div>
    </Modal>
  );
};
