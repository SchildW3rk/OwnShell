/**
 * Key-Value Editor (v1.18.0)
 *
 * Reusable editor for Params and Headers:
 * - Key/Value inputs with {{variable}} highlighting
 * - Checkbox to enable/disable rows
 * - Delete button per row
 * - Add new row button
 */

import React, { useCallback } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

// ============================================
// Types
// ============================================

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

interface KeyValueEditorProps {
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Whether to show bulk actions */
  showBulkActions?: boolean;
  /** Replaces the value input of a row (e.g. file rows in form-data). */
  renderValue?: (item: KeyValueItem) => React.ReactNode;
}

// ============================================
// Variable Highlighting
// ============================================

/**
 * Render value with {{variable}} highlighting
 */
export const VariableHighlightInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}> = ({ value, onChange, placeholder, disabled, className }) => {
  // Check if value contains variables
  const hasVariables = /\{\{[^}]+\}\}/.test(value);

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'w-full px-2 py-1.5 bg-secondary border border-border rounded text-sm',
          'text-foreground placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent',
          disabled && 'opacity-50 cursor-not-allowed',
          hasVariables && 'text-primary font-medium',
          className
        )}
      />
      {/* Variable indicator */}
      {hasVariables && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <span className="text-[10px] text-primary/60 font-mono">{'{{ }}'}</span>
        </div>
      )}
    </div>
  );
};

// ============================================
// Row Component
// ============================================

interface KeyValueRowProps {
  item: KeyValueItem;
  keyPlaceholder: string;
  valuePlaceholder: string;
  onUpdate: (updates: Partial<KeyValueItem>) => void;
  onDelete: () => void;
  renderValue?: (item: KeyValueItem) => React.ReactNode;
}

const KeyValueRow = React.memo<KeyValueRowProps>(function KeyValueRow({
  item,
  keyPlaceholder,
  valuePlaceholder,
  onUpdate,
  onDelete,
  renderValue,
}) {
  return (
    <div className={cn('group flex items-center gap-2 py-1', !item.enabled && 'opacity-50')}>
      {/* Drag Handle (future) */}
      <div className="flex-shrink-0 w-4 opacity-0 group-hover:opacity-50 cursor-grab">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Enable Checkbox */}
      <input
        type="checkbox"
        checked={item.enabled}
        onChange={(e) => onUpdate({ enabled: e.target.checked })}
        className="flex-shrink-0 w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
      />

      {/* Key Input */}
      <input
        type="text"
        value={item.key}
        onChange={(e) => onUpdate({ key: e.target.value })}
        placeholder={keyPlaceholder}
        disabled={!item.enabled}
        className={cn(
          'w-[180px] flex-shrink-0 px-2 py-1.5 bg-secondary border border-border rounded text-sm',
          'text-foreground placeholder:text-muted-foreground font-medium',
          'focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent',
          !item.enabled && 'cursor-not-allowed'
        )}
      />

      {/* Value Input with Variable Highlighting */}
      {renderValue ? (
        renderValue(item)
      ) : (
        <VariableHighlightInput
          value={item.value}
          onChange={(value) => onUpdate({ value })}
          placeholder={valuePlaceholder}
          disabled={!item.enabled}
        />
      )}

      {/* Delete Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="flex-shrink-0 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
});

// ============================================
// Main Component
// ============================================

export const KeyValueEditor: React.FC<KeyValueEditorProps> = ({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  showBulkActions = true,
  renderValue,
}) => {
  const { t } = useTranslation();

  // Add new row
  const handleAddRow = useCallback(() => {
    const id = `kv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    onChange([...items, { id, key: '', value: '', enabled: true }]);
  }, [items, onChange]);

  // Update row
  const handleUpdateRow = useCallback(
    (id: string, updates: Partial<KeyValueItem>) => {
      onChange(items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    },
    [items, onChange]
  );

  // Delete row
  const handleDeleteRow = useCallback(
    (id: string) => {
      onChange(items.filter((item) => item.id !== id));
    },
    [items, onChange]
  );

  // Bulk enable/disable all
  const handleToggleAll = useCallback(
    (enabled: boolean) => {
      onChange(items.map((item) => ({ ...item, enabled })));
    },
    [items, onChange]
  );

  // Delete all disabled
  const handleDeleteDisabled = useCallback(() => {
    onChange(items.filter((item) => item.enabled));
  }, [items, onChange]);

  // Count enabled/disabled
  const enabledCount = items.filter((i) => i.enabled).length;
  const disabledCount = items.length - enabledCount;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with Bulk Actions */}
      {showBulkActions && items.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/50">
          <span className="text-xs text-muted-foreground">
            {enabledCount} {t('api.enabled', 'enabled')}
            {disabledCount > 0 && (
              <span className="ml-1">
                / {disabledCount} {t('api.disabled', 'disabled')}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleToggleAll(true)}
              className="h-6 text-xs"
            >
              {t('api.enableAll', 'Enable All')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleToggleAll(false)}
              className="h-6 text-xs"
            >
              {t('api.disableAll', 'Disable All')}
            </Button>
            {disabledCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteDisabled}
                className="h-6 text-xs text-destructive hover:text-destructive"
              >
                {t('api.deleteDisabled', 'Delete Disabled')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Rows */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
        {items.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-3">{t('api.noItems', 'No items yet')}</p>
            <Button variant="secondary" size="sm" onClick={handleAddRow}>
              <Plus className="w-4 h-4 mr-1.5" />
              {t('api.addItem', 'Add Item')}
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <KeyValueRow
                key={item.id}
                item={item}
                keyPlaceholder={keyPlaceholder}
                valuePlaceholder={valuePlaceholder}
                onUpdate={(updates) => handleUpdateRow(item.id, updates)}
                onDelete={() => handleDeleteRow(item.id)}
                renderValue={renderValue}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Row Button (always visible when there are items) */}
      {items.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddRow}
            className="w-full justify-start text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('api.addRow', 'Add Row')}
          </Button>
        </div>
      )}
    </div>
  );
};

// ============================================
// Utility Functions
// ============================================

/**
 * Parse JSON string to KeyValueItem array
 */
export function parseKeyValueItems(json: string): KeyValueItem[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.map((item, index) => ({
        id: item.id || `kv-${index}`,
        key: item.key || '',
        value: item.value || '',
        enabled: item.enabled !== false,
      }));
    }
  } catch {
    // Invalid JSON, return empty array
  }
  return [];
}

/**
 * Serialize KeyValueItem array to JSON string
 */
export function serializeKeyValueItems(items: KeyValueItem[]): string {
  return JSON.stringify(
    items.map((item) => ({
      key: item.key,
      value: item.value,
      enabled: item.enabled,
    }))
  );
}

/**
 * Convert KeyValueItems to object (for actual request)
 * Only includes enabled items with non-empty keys
 */
export function keyValueItemsToObject(items: KeyValueItem[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of items) {
    if (item.enabled && item.key.trim()) {
      result[item.key] = item.value;
    }
  }
  return result;
}
