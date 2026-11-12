import React, { useCallback, useMemo } from 'react';

import { KeyValueEditor, type KeyValueItem } from '../KeyValueEditor';
import type { FormDataItem } from './types';

interface FormDataEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const FormDataEditor: React.FC<FormDataEditorProps> = ({ value, onChange }) => {
  const items = useMemo<FormDataItem[]>(() => {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => ({
          id: item.id || `fd-${index}`,
          key: item.key || '',
          value: item.value || '',
          enabled: item.enabled !== false,
          type: item.type || 'text',
          file: null,
        }));
      }
    } catch {
      // Invalid JSON
    }
    return [];
  }, [value]);

  const keyValueItems = useMemo<KeyValueItem[]>(
    () => items.map(({ id, key, value: val, enabled }) => ({ id, key, value: val, enabled })),
    [items]
  );

  const handleChange = useCallback(
    (newItems: KeyValueItem[]) => {
      const updatedItems = newItems.map((item) => {
        const original = items.find((i) => i.id === item.id);
        return {
          key: item.key,
          value: item.value,
          enabled: item.enabled,
          type: original?.type || 'text',
        };
      });
      onChange(JSON.stringify(updatedItems));
    },
    [items, onChange]
  );

  return (
    <KeyValueEditor
      items={keyValueItems}
      onChange={handleChange}
      keyPlaceholder="Field name"
      valuePlaceholder="Value"
    />
  );
};
