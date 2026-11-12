import React from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Button, Input } from '@ownshell/ui';

interface HashValueEditorProps {
  value: Record<string, string>;
  newField: string;
  newFieldValue: string;
  isSaving: boolean;
  readOnly: boolean;
  onNewFieldChange: (field: string) => void;
  onNewFieldValueChange: (value: string) => void;
  onAddField: () => void;
  onDeleteField: (field: string) => void;
}

export const HashValueEditor: React.FC<HashValueEditorProps> = ({
  value,
  newField,
  newFieldValue,
  isSaving,
  readOnly,
  onNewFieldChange,
  onNewFieldValueChange,
  onAddField,
  onDeleteField,
}) => {
  const { t } = useTranslation();
  return (
  <div className="space-y-3">
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <label className="block text-xs text-muted-foreground mb-1">{t('db.redis.field')}</label>
        <Input
          value={newField}
          onChange={(e) => onNewFieldChange(e.target.value)}
          placeholder={t('db.redis.fieldPlaceholder')}
          className="text-sm"
          disabled={readOnly}
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs text-muted-foreground mb-1">{t('db.redis.value')}</label>
        <Input
          value={newFieldValue}
          onChange={(e) => onNewFieldValueChange(e.target.value)}
          placeholder={t('db.redis.valuePlaceholder')}
          className="text-sm"
          disabled={readOnly}
        />
      </div>
      <Button variant="primary" size="sm" onClick={onAddField} disabled={!newField || isSaving || readOnly}>
        <Plus className="w-4 h-4" />
      </Button>
    </div>

    <div className="border border-border rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface">
          <tr>
            <th className="px-3 py-2 text-left text-muted-foreground font-medium">{t('db.redis.field')}</th>
            <th className="px-3 py-2 text-left text-muted-foreground font-medium">{t('db.redis.value')}</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Object.entries(value).map(([field, val]) => (
            <tr key={field} className="hover:bg-surface/50">
              <td className="px-3 py-2 font-mono text-primary">{field}</td>
              <td className="px-3 py-2 font-mono truncate max-w-xs">{val}</td>
              <td className="px-2">
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDeleteField(field)}
                    disabled={isSaving}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
  );
};
