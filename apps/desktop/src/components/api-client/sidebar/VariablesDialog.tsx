import React, { useCallback, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { Button, Modal, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { useSaveApiVariables } from '../../../hooks/api/useApiQueries';
import { KeyValueEditor, type KeyValueItem } from '../KeyValueEditor';
import { BUILT_IN_NAMES } from '../variables/variable-suggestions';

type PublicVariable = Awaited<ReturnType<typeof window.electronAPI.apiClient.variables.getGlobal>>[number];

interface VariableRow extends KeyValueItem {
  secret?: boolean;
  /** A secret already has a stored value (never sent to the renderer). */
  hasValue?: boolean;
  /** The user typed a new value (for secrets: replace the stored one). */
  changed?: boolean;
}

interface VariablesDialogProps {
  title: string;
  /** Folder id, or null for the global variables. */
  collectionId: string | null;
  variables: PublicVariable[];
  onClose: () => void;
}

/** Folder or global variables; secret values are write-only and stored encrypted. */
export const VariablesDialog: React.FC<VariablesDialogProps> = ({ title, collectionId, variables, onClose }) => {
  const { t } = useTranslation();
  const save = useSaveApiVariables();
  const [rows, setRows] = useState<VariableRow[]>(() => variables.map((variable) => ({ ...variable })));

  const updateRow = useCallback(
    (id: string, patch: Partial<VariableRow>) =>
      setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row))),
    []
  );

  const handleSave = () => {
    save.mutate(
      {
        collectionId,
        variables: rows
          .filter((row) => row.key.trim())
          .map((row) => ({
            id: row.id,
            key: row.key.trim(),
            // Undefined keeps the stored secret.
            value: row.secret && !row.changed ? undefined : row.value,
            enabled: row.enabled,
            secret: !!row.secret,
          })),
      },
      { onSuccess: onClose }
    );
  };

  const renderValue = (item: KeyValueItem) => {
    const row = item as VariableRow;
    return (
      <div className="flex flex-1 items-center gap-1">
        <input
          type={row.secret ? 'password' : 'text'}
          value={row.value}
          onChange={(event) => updateRow(row.id, { value: event.target.value, changed: true })}
          placeholder={
            row.secret && row.hasValue && !row.changed ? t('api.variables.secretKept') : t('api.params.value')
          }
          aria-label={t('api.params.value')}
          autoComplete="off"
          disabled={!row.enabled}
          className="flex-1 rounded border border-border bg-secondary px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button
          variant="ghost"
          size="sm"
          type="button"
          aria-pressed={!!row.secret}
          title={t(row.secret ? 'api.variables.makePlain' : 'api.variables.makeSecret')}
          aria-label={t(row.secret ? 'api.variables.makePlain' : 'api.variables.makeSecret')}
          // A stored secret is never revealed: making it plain starts with an empty value.
          onClick={() =>
            updateRow(row.id, row.secret ? { secret: false, value: row.changed ? row.value : '', changed: true } : { secret: true, changed: true })
          }
          className={cn('h-7 w-7 flex-shrink-0 p-0', row.secret ? 'text-primary' : 'text-muted-foreground')}
        >
          {row.secret ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </Button>
      </div>
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">{t('api.variables.precedenceHint', BUILT_IN_NAMES)}</p>
      <div className="-mx-2 h-[360px]">
        <KeyValueEditor
          items={rows}
          onChange={setRows}
          keyPlaceholder={t('api.variables.name')}
          valuePlaceholder={t('api.params.value')}
          renderValue={renderValue}
        />
      </div>
    </Modal>
  );
};
