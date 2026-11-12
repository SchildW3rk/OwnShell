import React from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Button, Input } from '@ownshell/ui';

interface ListValueEditorProps {
  value: string[];
  newFieldValue: string;
  isSaving: boolean;
  readOnly: boolean;
  onNewFieldValueChange: (value: string) => void;
  onPush: (direction: 'left' | 'right') => void;
  onPop: (direction: 'left' | 'right') => void;
}

export const ListValueEditor: React.FC<ListValueEditorProps> = ({
  value,
  newFieldValue,
  isSaving,
  readOnly,
  onNewFieldValueChange,
  onPush,
  onPop,
}) => {
  const { t } = useTranslation();
  return (
  <div className="space-y-3">
    <div className="flex gap-2">
      <Input
        value={newFieldValue}
        onChange={(e) => onNewFieldValueChange(e.target.value)}
        placeholder={t('db.redis.newItem')}
        className="flex-1 text-sm"
        disabled={readOnly}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && newFieldValue && !readOnly) onPush('right');
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPush('left')}
        disabled={!newFieldValue || isSaving || readOnly}
        title={t('db.redis.pushLeft')}
      >
        <Plus className="w-4 h-4 mr-1" />
        {t('db.redis.left')}
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={() => onPush('right')}
        disabled={!newFieldValue || isSaving || readOnly}
        title={t('db.redis.pushRight')}
      >
        <Plus className="w-4 h-4 mr-1" />
        {t('db.redis.right')}
      </Button>
    </div>

    <div className="flex gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPop('left')}
        disabled={isSaving || value.length === 0 || readOnly}
        title={t('db.redis.popLeftTitle')}
      >
        <Minus className="w-4 h-4 mr-1" />
        {t('db.redis.popLeft')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPop('right')}
        disabled={isSaving || value.length === 0 || readOnly}
        title={t('db.redis.popRightTitle')}
      >
        <Minus className="w-4 h-4 mr-1" />
        {t('db.redis.popRight')}
      </Button>
    </div>

    <div className="border border-border rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface">
          <tr>
            <th className="w-16 px-3 py-2 text-left text-muted-foreground font-medium">{t('db.redis.index')}</th>
            <th className="px-3 py-2 text-left text-muted-foreground font-medium">{t('db.redis.value')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {value.map((item, index) => (
            <tr key={index} className="hover:bg-surface/50">
              <td className="px-3 py-2 text-muted-foreground">{index}</td>
              <td className="px-3 py-2 font-mono truncate">{item}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
  );
};
