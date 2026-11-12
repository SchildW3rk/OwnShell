/**
 * Credentials Tab (v1.17.0 - Minimal Version)
 *
 * Simple list view for password management with:
 * - Add/Edit/Delete credentials
 * - Decrypt password on-demand
 * - Copy to clipboard
 * - URL auto-launch
 */

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmDialog, Modal, FormField, FormInput, Textarea } from '@ownshell/ui';
import { z } from 'zod';
import {
  useVaultCredentials,
  useCreateVaultCredential,
  useUpdateVaultCredential,
  useDeleteVaultCredential,
  useDecryptPassword,
  useToggleCredentialFavorite,
} from '../../hooks/vault';
import { VaultCredentialsTable } from '@ownshell/core';
import { CredentialsTable } from './CredentialsTable';

// Zod validation schema for Credential form with i18n support
const createCredentialSchema = (isEdit: boolean, t: (key: string) => string) =>
  z.object({
    title: z.string().min(1, t('vault.errors.titleRequired')),
    username: z.string().optional(),
    password: isEdit
      ? z.string().optional() // Optional when editing (keep current if empty)
      : z.string().min(1, t('vault.errors.passwordRequired')), // Required when creating
    url: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val || val.trim() === '') return true; // Empty is OK
          try {
            new URL(val);
            return true;
          } catch {
            return false;
          }
        },
        { message: t('vault.errors.urlInvalid') }
      ),
    notes: z.string().optional(),
  });

type CredentialFormData = {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
};

export const CredentialsTab: React.FC = () => {
  const { t } = useTranslation();
  const { data: credentials = [], isLoading } = useVaultCredentials();
  const createMutation = useCreateVaultCredential();
  const updateMutation = useUpdateVaultCredential();
  const deleteMutation = useDeleteVaultCredential();
  const decryptMutation = useDecryptPassword();
  const toggleFavoriteMutation = useToggleCredentialFavorite();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CredentialFormData>({
    title: '',
    username: '',
    password: '',
    url: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [credentialToDelete, setCredentialToDelete] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form data with Zod
    const schema = createCredentialSchema(!!editingId, t);
    const validation = schema.safeParse(formData);

    if (!validation.success) {
      // Convert Zod errors to field errors
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    // Clear errors on successful validation
    setErrors({});

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          data: {
            ...formData,
            username: formData.username || null,
            url: formData.url || null,
            notes: formData.notes || null,
            tags: null,
          },
        });
      } else {
        await createMutation.mutateAsync({
          ...formData,
          username: formData.username || null,
          url: formData.url || null,
          notes: formData.notes || null,
          tags: null,
        });
      }

      setShowForm(false);
      setEditingId(null);
      setFormData({ title: '', username: '', password: '', url: '', notes: '' });
      setErrors({});
    } catch (error) {
      console.error('Failed to save credential:', error);
    }
  };

  const handleEdit = (credential: VaultCredentialsTable) => {
    setEditingId(credential.id);
    setFormData({
      title: credential.title,
      username: credential.username || '',
      password: '', // Don't populate password for security
      url: credential.url || '',
      notes: credential.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setCredentialToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (credentialToDelete) {
      await deleteMutation.mutateAsync(credentialToDelete);
      setDeleteDialogOpen(false);
      setCredentialToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setCredentialToDelete(null);
  };

  const handleToggleFavorite = async (id: string, currentFavorite: number) => {
    await toggleFavoriteMutation.mutateAsync({ id, favorite: currentFavorite ? 0 : 1 });
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
      {/* Add/Edit Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        title={editingId ? t('vault.editCredential') : t('vault.addCredential')}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingId ? (
                t('common.update')
              ) : (
                t('common.create')
              )}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t('vault.title_field')} required error={errors.title}>
              <FormInput
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('vault.titlePlaceholder')}
                error={errors.title}
              />
            </FormField>

            <FormField label={t('vault.username')} error={errors.username}>
              <FormInput
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder={t('vault.usernamePlaceholder')}
                error={errors.username}
              />
            </FormField>

            <FormField
              label={`${t('vault.password')}${editingId ? ` (${t('vault.passwordKeepCurrent')})` : ''}`}
              required={!editingId}
              error={errors.password}
              hint={editingId ? t('vault.passwordKeepCurrent') : undefined}
            >
              <FormInput
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={t('vault.passwordPlaceholder')}
                error={errors.password}
              />
            </FormField>

            <FormField label={t('vault.url')} error={errors.url}>
              <FormInput
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder={t('vault.urlPlaceholder')}
                error={errors.url}
              />
            </FormField>
          </div>

          <FormField label={t('vault.notes')} error={errors.notes}>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder={t('vault.notesPlaceholder')}
              rows={3}
              error={errors.notes}
            />
          </FormField>
        </form>
      </Modal>

      {/* Table View */}
      <CredentialsTable
        credentials={credentials}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleFavorite={handleToggleFavorite}
        onDecrypt={(id) => decryptMutation.mutateAsync(id)}
        onAdd={() => {
          setShowForm(true);
          setEditingId(null);
          setFormData({ title: '', username: '', password: '', url: '', notes: '' });
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title={t('vault.deleteCredential')}
        message={t('vault.deleteCredentialConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
};
