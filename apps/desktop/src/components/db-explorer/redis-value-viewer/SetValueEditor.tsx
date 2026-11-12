import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button, Input } from '@ownshell/ui';

interface SetValueEditorProps {
  value: string[];
  newFieldValue: string;
  isSaving: boolean;
  readOnly: boolean;
  onNewFieldValueChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (member: string) => void;
}

export const SetValueEditor: React.FC<SetValueEditorProps> = ({
  value,
  newFieldValue,
  isSaving,
  readOnly,
  onNewFieldValueChange,
  onAdd,
  onRemove,
}) => {
  const { t } = useTranslation();
  return (
  <div className="space-y-3">
    <div className="flex gap-2">
      <Input
        value={newFieldValue}
        onChange={(e) => onNewFieldValueChange(e.target.value)}
        placeholder={t('db.redis.newMember')}
        className="flex-1 text-sm"
        disabled={readOnly}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && newFieldValue && !readOnly) onAdd();
        }}
      />
      <Button variant="primary" size="sm" onClick={onAdd} disabled={!newFieldValue || isSaving || readOnly}>
        <Plus className="w-4 h-4 mr-1" />
        {t('common.add')}
      </Button>
    </div>

    <div className="flex flex-wrap gap-2">
      {value.map((member) => (
        <div
          key={member}
          className="flex items-center gap-1 px-2 py-1 bg-surface border border-border rounded text-sm font-mono"
        >
          <span className="truncate max-w-xs">{member}</span>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onRemove(member)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              disabled={isSaving}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  </div>
  );
};
