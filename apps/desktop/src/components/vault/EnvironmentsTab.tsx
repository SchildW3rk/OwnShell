/**
 * Environments Tab (v1.17.0 - Enhanced with Bulk Editor)
 *
 * ENV variable management with simple key-value editing, bulk .env editing,
 * project grouping and SFTP deployment.
 */

import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import {
  useCreateVaultEnvironment,
  useDecryptVariables,
  useDeleteVaultEnvironment,
  useDeployToSFTP,
  useToggleEnvironmentFavorite,
  useUpdateVaultEnvironment,
  useVaultEnvironments,
  useVaultProjects,
} from '../../hooks/vault';
import { useHostStore } from '../../stores/useHostStore';
import type { VaultEnvironmentsTable } from '@ownshell/core';

import { EnvironmentsTable } from './EnvironmentsTable';
import { generateEnvContent, parseEnvContent } from './BulkEnvEditor';
import type { BulkEnvEditorHandle } from './BulkEnvEditor';
import { DeployEnvironmentModal } from './environments-tab/DeployEnvironmentModal';
import { EnvironmentFormModal } from './environments-tab/EnvironmentFormModal';
import { EnvironmentStatusDialog } from './environments-tab/EnvironmentStatusDialog';
import { createEnvironmentSchema } from './environments-tab/schema';
import type { EditorMode, EnvironmentFormData } from './environments-tab/types';

const createEmptyFormData = (): EnvironmentFormData => ({
  name: '',
  project: '',
  description: '',
  variables: [{ key: '', value: '' }],
  host_id: '',
  default_remote_path: '',
});

export const EnvironmentsTab: React.FC = () => {
  const { t } = useTranslation();
  const { data: environments = [], isLoading } = useVaultEnvironments();
  const { data: projects = [] } = useVaultProjects();
  const { hosts } = useHostStore();
  const createMutation = useCreateVaultEnvironment();
  const updateMutation = useUpdateVaultEnvironment();
  const deleteMutation = useDeleteVaultEnvironment();
  const decryptMutation = useDecryptVariables();
  const deployMutation = useDeployToSFTP();
  const toggleFavoriteMutation = useToggleEnvironmentFavorite();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('simple');
  const [formData, setFormData] = useState<EnvironmentFormData>(createEmptyFormData);
  const [bulkContent, setBulkContent] = useState('');
  const bulkEditorRef = useRef<BulkEnvEditorHandle>(null);
  const [showDeployModal, setShowDeployModal] = useState<VaultEnvironmentsTable | null>(null);
  const [deployPath, setDeployPath] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [environmentToDelete, setEnvironmentToDelete] = useState<string | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sftpHosts = hosts.filter(
    (host) => host.connection_type === 'ssh' || host.connection_type === 'sftp_only'
  );

  const resetForm = () => {
    setFormData(createEmptyFormData());
    setBulkContent('');
    setEditorMode('simple');
    setErrors({});
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const openAddForm = () => {
    setShowForm(true);
    setEditingId(null);
    resetForm();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const variables = editorMode === 'bulk'
      ? parseEnvContent(bulkEditorRef.current?.getContent() ?? bulkContent)
      : formData.variables;
    const validVariables = variables.filter((variable) => variable.key);
    const dataToValidate = {
      name: formData.name,
      project: formData.project,
      description: formData.description,
      host_id: formData.host_id,
      default_remote_path: formData.default_remote_path,
      variables: validVariables,
    };

    const result = createEnvironmentSchema(t).safeParse(dataToValidate);

    if (!result.success) {
      const validationErrors: Record<string, string> = {};
      result.error.errors.forEach((err: { path: (string | number)[]; message: string }) => {
        validationErrors[err.path.join('.')] = err.message;
      });
      setErrors(validationErrors);
      return;
    }

    setErrors({});

    try {
      const payload = {
        name: formData.name,
        project: formData.project,
        description: formData.description || null,
        variables: validVariables,
        host_id: formData.host_id || null,
        default_remote_path: formData.default_remote_path || null,
      };

      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }

      setShowForm(false);
      setEditingId(null);
      resetForm();
    } catch (error) {
      console.error('Failed to save environment:', error);
    }
  };

  const handleEdit = async (env: VaultEnvironmentsTable) => {
    setEditingId(env.id);

    try {
      const decrypted = await decryptMutation.mutateAsync(env.id);
      setFormData({
        name: env.name,
        project: env.project,
        description: env.description || '',
        variables: decrypted.length > 0 ? decrypted : [{ key: '', value: '' }],
        host_id: env.host_id || '',
        default_remote_path: env.default_remote_path || '',
      });
      setBulkContent(generateEnvContent(decrypted));
      setShowForm(true);
    } catch (error) {
      console.error('Failed to decrypt variables:', error);
    }
  };

  const handleEditorModeChange = (newMode: EditorMode) => {
    if (newMode === editorMode) return;
    if (newMode === 'simple') {
      const content = bulkEditorRef.current?.getContent() ?? bulkContent;
      const parsedVars = parseEnvContent(content);
      setBulkContent(content);
      setFormData((current) => ({
        ...current,
        variables: parsedVars.length > 0 ? parsedVars : [{ key: '', value: '' }],
      }));
    } else if (newMode === 'bulk' && formData.variables.length > 0) {
      setBulkContent(generateEnvContent(formData.variables));
    }
    setEditorMode(newMode);
  };

  const addVariable = () => {
    setFormData({
      ...formData,
      variables: [...formData.variables, { key: '', value: '' }],
    });
  };

  const updateVariable = (index: number, field: 'key' | 'value', value: string) => {
    const newVariables = [...formData.variables];
    newVariables[index][field] = value;
    setFormData({ ...formData, variables: newVariables });
  };

  const removeVariable = (index: number) => {
    setFormData({
      ...formData,
      variables: formData.variables.filter((_, currentIndex) => currentIndex !== index),
    });
  };


  const handleDelete = (id: string) => {
    setEnvironmentToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (environmentToDelete) {
      await deleteMutation.mutateAsync(environmentToDelete);
      setDeleteDialogOpen(false);
      setEnvironmentToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setEnvironmentToDelete(null);
  };

  const handleDeploy = async () => {
    if (!showDeployModal || !deployPath) return;

    try {
      const host = hosts.find((candidate) => candidate.id === showDeployModal.host_id);
      if (!host) {
        setErrorMessage(t('vault.hostNotFound'));
        setErrorDialogOpen(true);
        return;
      }

      await deployMutation.mutateAsync({
        envId: showDeployModal.id,
        params: {
          connectionId: showDeployModal.host_id!,
          remotePath: deployPath,
        },
      });

      setShowDeployModal(null);
      setDeployPath('');
      setErrorMessage(t('vault.deploySuccess'));
      setErrorDialogOpen(true);
    } catch (error) {
      console.error('Deployment failed:', error);
      const errorMsg = (error as Error).message;
      setErrorMessage(
        errorMsg.includes('not found or not connected')
          ? t('vault.deployConnectionError') + '\n\n' + t('vault.deployConnectionHint')
          : t('vault.deployFailed') + ':\n\n' + errorMsg
      );
      setErrorDialogOpen(true);
    }
  };

  const handleToggleFavorite = async (id: string, currentFavorite: number) => {
    await toggleFavoriteMutation.mutateAsync({ id, favorite: currentFavorite ? 0 : 1 });
  };

  const closeStatusDialog = () => {
    setErrorDialogOpen(false);
    setErrorMessage('');
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center transition-colors duration-200">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EnvironmentFormModal
        isOpen={showForm}
        editingId={editingId}
        formData={formData}
        errors={errors}
        projects={projects}
        sftpHosts={sftpHosts}
        editorMode={editorMode}
        bulkContent={bulkContent}
        isSaving={createMutation.isPending || updateMutation.isPending}
        onClose={closeForm}
        onSubmit={handleSubmit}
        onFormDataChange={setFormData}
        onEditorModeChange={handleEditorModeChange}
        onAddVariable={addVariable}
        onUpdateVariable={updateVariable}
        onRemoveVariable={removeVariable}
        bulkEditorRef={bulkEditorRef}
      />

      <EnvironmentsTable
        environments={environments}
        hosts={hosts}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDeploy={(env) => {
          setShowDeployModal(env);
          setDeployPath(env.default_remote_path || '');
        }}
        onToggleFavorite={handleToggleFavorite}
        onAdd={openAddForm}
      />

      {showDeployModal && (
        <DeployEnvironmentModal
          environment={showDeployModal}
          deployPath={deployPath}
          isDeploying={deployMutation.isPending}
          onDeployPathChange={setDeployPath}
          onDeploy={handleDeploy}
          onClose={() => setShowDeployModal(null)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title={t('vault.deleteEnvironment')}
        message={t('vault.deleteEnvironmentConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {errorDialogOpen && (
        <EnvironmentStatusDialog message={errorMessage} onClose={closeStatusDialog} />
      )}
    </div>
  );
};
