import React, { useCallback, useMemo } from 'react';
import { Paperclip } from 'lucide-react';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { KeyValueEditor, VariableHighlightInput, type KeyValueItem } from '../KeyValueEditor';
import type { FormDataItem } from './types';

interface FormDataEditorProps {
  value: string;
  onChange: (value: string) => void;
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

export const FormDataEditor: React.FC<FormDataEditorProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  const items = useMemo<FormDataItem[]>(() => {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => ({
          id: item.id || `fd-${index}`,
          key: item.key || '',
          value: item.value || '',
          enabled: item.enabled !== false,
          type: item.type === 'file' ? 'file' : 'text',
        }));
      }
    } catch {
      // Invalid JSON
    }
    return [];
  }, [value]);

  // Rows keep their `type` because KeyValueEditor spreads updates onto the item.
  const handleChange = useCallback(
    (newItems: KeyValueItem[]) => {
      onChange(
        JSON.stringify(
          (newItems as FormDataItem[]).map((item) => ({
            key: item.key,
            value: item.value,
            enabled: item.enabled,
            type: item.type || 'text',
          }))
        )
      );
    },
    [onChange]
  );

  const updateItem = useCallback(
    (id: string, updates: Partial<FormDataItem>) =>
      handleChange(items.map((item) => (item.id === id ? { ...item, ...updates } : item))),
    [items, handleChange]
  );

  const renderValue = useCallback(
    (row: KeyValueItem) => {
      const item = row as FormDataItem;
      const pickFile = async () => {
        // The main process re-validates the path and reads the file when sending.
        const file = await window.electronAPI.apiClient.files.pick();
        if (file) updateItem(item.id, { value: file.path });
      };
      return (
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <select
            value={item.type}
            disabled={!item.enabled}
            aria-label={t('api.body.formFieldType')}
            onChange={(event) =>
              updateItem(item.id, { type: event.target.value as FormDataItem['type'], value: '' })
            }
            className="flex-shrink-0 px-2 py-1.5 bg-secondary border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="text">{t('api.body.formFieldText')}</option>
            <option value="file">{t('api.body.formFieldFile')}</option>
          </select>
          {item.type === 'file' ? (
            <button
              type="button"
              disabled={!item.enabled}
              onClick={pickFile}
              title={item.value || undefined}
              className={cn(
                'flex flex-1 min-w-0 items-center gap-2 px-2 py-1.5 bg-secondary border border-border rounded text-sm text-left',
                item.value ? 'text-foreground' : 'text-muted-foreground',
                !item.enabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">
                {item.value ? fileName(item.value) : t('api.body.browseFiles')}
              </span>
            </button>
          ) : (
            <VariableHighlightInput
              value={item.value}
              onChange={(text) => updateItem(item.id, { value: text })}
              placeholder={t('api.params.value')}
              disabled={!item.enabled}
            />
          )}
        </div>
      );
    },
    [t, updateItem]
  );

  return (
    <KeyValueEditor
      items={items}
      onChange={handleChange}
      keyPlaceholder={t('api.body.formFieldName')}
      valuePlaceholder={t('api.params.value')}
      renderValue={renderValue}
    />
  );
};
