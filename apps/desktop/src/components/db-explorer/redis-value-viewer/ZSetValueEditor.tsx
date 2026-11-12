import React from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Button, Input } from '@ownshell/ui';

interface ZSetValueEditorProps {
  value: Array<{ member: string; score: number }>;
  newFieldValue: string;
  newScore: string;
  isSaving: boolean;
  readOnly: boolean;
  onNewFieldValueChange: (value: string) => void;
  onNewScoreChange: (score: string) => void;
  onAdd: () => void;
  onRemove: (member: string) => void;
}

export const ZSetValueEditor: React.FC<ZSetValueEditorProps> = ({
  value,
  newFieldValue,
  newScore,
  isSaving,
  readOnly,
  onNewFieldValueChange,
  onNewScoreChange,
  onAdd,
  onRemove,
}) => {
  const { t } = useTranslation();
  return (
  <div className="space-y-3">
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <label className="block text-xs text-muted-foreground mb-1">{t('db.redis.member')}</label>
        <Input
          value={newFieldValue}
          onChange={(e) => onNewFieldValueChange(e.target.value)}
          placeholder={t('db.redis.memberPlaceholder')}
          className="text-sm"
          disabled={readOnly}
        />
      </div>
      <div className="w-24">
        <label className="block text-xs text-muted-foreground mb-1">{t('db.redis.score')}</label>
        <Input
          value={newScore}
          onChange={(e) => onNewScoreChange(e.target.value)}
          placeholder="0"
          type="number"
          className="text-sm"
          disabled={readOnly}
        />
      </div>
      <Button variant="primary" size="sm" onClick={onAdd} disabled={!newFieldValue || isSaving || readOnly}>
        <Plus className="w-4 h-4" />
      </Button>
    </div>

    <div className="border border-border rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface">
          <tr>
            <th className="w-24 px-3 py-2 text-left text-muted-foreground font-medium">{t('db.redis.score')}</th>
            <th className="px-3 py-2 text-left text-muted-foreground font-medium">{t('db.redis.member')}</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {value.map((item) => (
            <tr key={item.member} className="hover:bg-surface/50">
              <td className="px-3 py-2 text-accent">{item.score}</td>
              <td className="px-3 py-2 font-mono truncate">{item.member}</td>
              <td className="px-2">
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onRemove(item.member)}
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
