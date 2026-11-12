import React from 'react';
import { useTranslation } from 'react-i18next';
import { Edit2, Loader2, Save } from 'lucide-react';
import { Button } from '@ownshell/ui';

interface StringValueEditorProps {
  value: string;
  isEditing: boolean;
  editValue: string;
  isSaving: boolean;
  readOnly: boolean;
  onEditValueChange: (value: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export const StringValueEditor: React.FC<StringValueEditorProps> = ({
  value,
  isEditing,
  editValue,
  isSaving,
  readOnly,
  onEditValueChange,
  onStartEdit,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  if (isEditing) {
    return (
      <div className="space-y-2">
        <textarea
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          readOnly={readOnly}
          className="w-full h-64 p-3 font-mono text-sm bg-surface border border-border rounded resize-y focus:outline-none focus:border-primary"
          autoFocus
        />
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={onSave} disabled={isSaving || readOnly}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            {t('common.save')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <pre className="p-3 font-mono text-sm bg-surface border border-border rounded whitespace-pre-wrap break-all max-h-96 overflow-auto">
        {value}
      </pre>
      {!readOnly && (
        <Button variant="ghost" size="sm" onClick={onStartEdit}>
          <Edit2 className="w-4 h-4 mr-1" />
          {t('common.edit')}
        </Button>
      )}
    </div>
  );
};
