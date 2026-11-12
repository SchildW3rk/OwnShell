import React from 'react';
import { Code, List, Loader2, Trash2 } from 'lucide-react';
import {
  Button,
  FormField,
  FormInput,
  Modal,
  Select,
  Tabs,
  Textarea,
} from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { BulkEnvEditor } from '../BulkEnvEditor';
import type { BulkEnvEditorHandle } from '../BulkEnvEditor';
import type {
  EditorMode,
  EnvironmentFormData,
  EnvironmentFormErrors,
  SftpHostOption,
} from './types';

interface EnvironmentFormModalProps {
  isOpen: boolean;
  editingId: string | null;
  formData: EnvironmentFormData;
  errors: EnvironmentFormErrors;
  projects: string[];
  sftpHosts: SftpHostOption[];
  editorMode: EditorMode;
  bulkContent: string;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onFormDataChange: (formData: EnvironmentFormData) => void;
  onEditorModeChange: (mode: EditorMode) => void;
  onAddVariable: () => void;
  onUpdateVariable: (index: number, field: 'key' | 'value', value: string) => void;
  onRemoveVariable: (index: number) => void;
  bulkEditorRef: React.Ref<BulkEnvEditorHandle>;
}

export const EnvironmentFormModal: React.FC<EnvironmentFormModalProps> = ({
  isOpen,
  editingId,
  formData,
  errors,
  projects,
  sftpHosts,
  editorMode,
  bulkContent,
  isSaving,
  onClose,
  onSubmit,
  onFormDataChange,
  onEditorModeChange,
  onAddVariable,
  onUpdateVariable,
  onRemoveVariable,
  bulkEditorRef,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingId ? t('vault.editEnvironment') : t('vault.addEnvironment')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onSubmit} disabled={isSaving}>
            {isSaving ? (
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
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('vault.envName')} required error={errors.name}>
            <FormInput
              value={formData.name}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
              placeholder={t('vault.envNamePlaceholder')}
              error={errors.name}
            />
          </FormField>

          <FormField label={t('vault.project')} required error={errors.project}>
            <FormInput
              value={formData.project}
              onChange={(e) => onFormDataChange({ ...formData, project: e.target.value })}
              placeholder={t('vault.projectPlaceholder')}
              list="projects-list"
              error={errors.project}
            />
            <datalist id="projects-list">
              {projects.map((project) => (
                <option key={project} value={project} />
              ))}
            </datalist>
          </FormField>
        </div>

        <FormField label={t('vault.description')} error={errors.description}>
          <Textarea
            value={formData.description}
            onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
            placeholder={t('vault.descriptionPlaceholder')}
            error={errors.description}
            rows={2}
          />
        </FormField>

        <div>
          <Tabs
            tabs={[
              { id: 'simple', label: t('vault.simpleMode'), icon: <List className="h-4 w-4" /> },
              { id: 'bulk', label: t('vault.bulkEdit'), icon: <Code className="h-4 w-4" /> },
            ]}
            activeTab={editorMode}
            onChange={(tabId) => onEditorModeChange(tabId as EditorMode)}
          />

          {editorMode === 'simple' && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('vault.variables')} *</span>
                <button
                  type="button"
                  onClick={onAddVariable}
                  className="text-sm text-primary hover:underline"
                >
                  + {t('vault.addVariable')}
                </button>
              </div>
              <div className="max-h-64 space-y-2 overflow-auto rounded-md border border-border bg-card p-3 transition-colors duration-200">
                {formData.variables.map((variable, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={variable.key}
                      onChange={(e) => onUpdateVariable(index, 'key', e.target.value)}
                      className="flex-1 rounded-md border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground transition-colors duration-200"
                      placeholder={t('vault.variableKeyPlaceholder')}
                    />
                    <input
                      type="text"
                      value={variable.value}
                      onChange={(e) => onUpdateVariable(index, 'value', e.target.value)}
                      className="flex-1 rounded-md border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground transition-colors duration-200"
                      placeholder={t('vault.variableValuePlaceholder')}
                    />
                    {formData.variables.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveVariable(index)}
                        className="rounded p-2 text-destructive hover:bg-secondary transition-colors duration-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {editorMode === 'bulk' && (
            <div className="mt-3">
              <BulkEnvEditor
                initialContent={bulkContent}
                contentRef={bulkEditorRef}
              />
            </div>
          )}
          {errors.variables && (
            <p role="alert" className="mt-2 text-sm text-destructive">{errors.variables}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('vault.linkedHost')} error={errors.host_id}>
            <Select
              value={formData.host_id}
              onChange={(e) => onFormDataChange({ ...formData, host_id: e.target.value })}
              error={errors.host_id}
              options={[
                { value: '', label: t('vault.noHost') },
                ...sftpHosts.map((host) => ({
                  value: host.id,
                  label: host.label,
                })),
              ]}
            />
          </FormField>

          <FormField label={t('vault.defaultRemotePath')} error={errors.default_remote_path}>
            <FormInput
              value={formData.default_remote_path}
              onChange={(e) =>
                onFormDataChange({ ...formData, default_remote_path: e.target.value })
              }
              placeholder={t('vault.defaultRemotePathPlaceholder')}
              error={errors.default_remote_path}
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
};
