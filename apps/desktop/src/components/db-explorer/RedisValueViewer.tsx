/**
 * Redis Value Viewer Component
 *
 * Displays and edits Redis key values.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import type { RedisDataType, RedisValue } from '@ownshell/core';

import { HashValueEditor } from './redis-value-viewer/HashValueEditor';
import { ListValueEditor } from './redis-value-viewer/ListValueEditor';
import { RedisKeyHeader } from './redis-value-viewer/RedisKeyHeader';
import { SetValueEditor } from './redis-value-viewer/SetValueEditor';
import { StringValueEditor } from './redis-value-viewer/StringValueEditor';
import { ZSetValueEditor } from './redis-value-viewer/ZSetValueEditor';

interface RedisValueViewerProps {
  connectionId: string;
  keyName: string;
  readOnly: boolean;
  onKeyDeleted: () => void;
  onKeyRenamed: (newKey: string) => void;
}

export const RedisValueViewer: React.FC<RedisValueViewerProps> = React.memo(function RedisValueViewerContent({
  connectionId,
  keyName,
  readOnly,
  onKeyDeleted,
  onKeyRenamed,
}: RedisValueViewerProps) {
  const { t } = useTranslation();
  const [keyType, setKeyType] = useState<RedisDataType>('none');
  const [value, setValue] = useState<RedisValue | null>(null);
  const [ttl, setTtl] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [isEditingValue, setIsEditingValue] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isEditingTtl, setIsEditingTtl] = useState(false);
  const [editTtl, setEditTtl] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');

  const [newField, setNewField] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [newScore, setNewScore] = useState('0');
  const loadRequestRef = useRef(0);

  const loadKeyData = useCallback(async () => {
    const request = ++loadRequestRef.current;
    setIsLoading(true);
    setError(null);
    setValue(null);

    try {
      // Keep type, value and TTL together in the existing value-read response.
      const valueResult = await window.electronAPI.redis.getValue(connectionId, keyName);
      if (request !== loadRequestRef.current) return;
      if (valueResult.success) {
        setKeyType(valueResult.type);
        setTtl(valueResult.ttl);
        setValue(valueResult.value);
      } else {
        setError(valueResult.error || 'Failed to get value');
      }
    } catch (err) {
      if (request !== loadRequestRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load key');
    } finally {
      if (request === loadRequestRef.current) setIsLoading(false);
    }
  }, [connectionId, keyName]);

  useEffect(() => {
    loadKeyData();
    setIsEditingValue(false);
    setIsEditingTtl(false);
    setIsRenaming(false);
    return () => { loadRequestRef.current++; };
  }, [loadKeyData]);

  const handleDelete = async () => {
    if (readOnly) return;
    const confirmed = window.confirm(t('db.redis.deleteKeyConfirm', { name: keyName }));
    if (!confirmed) return;

    try {
      const result = await window.electronAPI.redis.deleteKeys(connectionId, [keyName]);
      if (result.success) onKeyDeleted();
    } catch (err) {
      console.error('Failed to delete key:', err);
    }
  };

  const handleRename = async () => {
    if (readOnly) return;
    if (!newKeyName || newKeyName === keyName) {
      setIsRenaming(false);
      return;
    }

    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.renameKey(connectionId, keyName, newKeyName);
      if (result.success) {
        onKeyRenamed(newKeyName);
        setIsRenaming(false);
      } else {
        setError(result.error || 'Failed to rename key');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetTtl = async () => {
    if (readOnly) return;
    const seconds = parseInt(editTtl, 10);
    if (isNaN(seconds) || seconds < 0) {
      setIsEditingTtl(false);
      return;
    }

    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.setTtl(connectionId, keyName, seconds);
      if (result.success) {
        setTtl(seconds);
        setIsEditingTtl(false);
      }
    } catch (err) {
      console.error('Failed to set TTL:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePersist = async () => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.persist(connectionId, keyName);
      if (result.success) setTtl(-1);
    } catch (err) {
      console.error('Failed to persist key:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveString = async () => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.setString(
        connectionId,
        keyName,
        editValue,
        ttl > 0 ? ttl : undefined
      );
      if (result.success) {
        setValue(editValue);
        setIsEditingValue(false);
      }
    } catch (err) {
      console.error('Failed to save string:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddHashField = async () => {
    if (readOnly) return;
    if (!newField) return;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.setHash(connectionId, keyName, {
        [newField]: newFieldValue,
      });
      if (result.success) {
        await loadKeyData();
        setNewField('');
        setNewFieldValue('');
      }
    } catch (err) {
      console.error('Failed to add hash field:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteHashField = async (field: string) => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.deleteHashFields(connectionId, keyName, [field]);
      if (result.success) await loadKeyData();
    } catch (err) {
      console.error('Failed to delete hash field:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleListPush = async (direction: 'left' | 'right') => {
    if (readOnly) return;
    if (!newFieldValue) return;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.listPush(
        connectionId,
        keyName,
        [newFieldValue],
        direction
      );
      if (result.success) {
        await loadKeyData();
        setNewFieldValue('');
      }
    } catch (err) {
      console.error('Failed to push to list:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleListPop = async (direction: 'left' | 'right') => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.listPop(connectionId, keyName, direction);
      if (result.success) await loadKeyData();
    } catch (err) {
      console.error('Failed to pop from list:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetAdd = async () => {
    if (readOnly) return;
    if (!newFieldValue) return;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.setAdd(connectionId, keyName, [newFieldValue]);
      if (result.success) {
        await loadKeyData();
        setNewFieldValue('');
      }
    } catch (err) {
      console.error('Failed to add to set:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetRemove = async (member: string) => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.setRemove(connectionId, keyName, [member]);
      if (result.success) await loadKeyData();
    } catch (err) {
      console.error('Failed to remove from set:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleZSetAdd = async () => {
    if (readOnly) return;
    if (!newFieldValue) return;
    const score = parseFloat(newScore);
    if (isNaN(score)) return;

    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.zsetAdd(connectionId, keyName, [
        { member: newFieldValue, score },
      ]);
      if (result.success) {
        await loadKeyData();
        setNewFieldValue('');
        setNewScore('0');
      }
    } catch (err) {
      console.error('Failed to add to sorted set:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleZSetRemove = async (member: string) => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      const result = await window.electronAPI.redis.zsetRemove(connectionId, keyName, [member]);
      if (result.success) await loadKeyData();
    } catch (err) {
      console.error('Failed to remove from sorted set:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-destructive">
        <AlertCircle className="w-8 h-8 mb-2" />
        <p className="text-sm">{error}</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={loadKeyData}>
          <RefreshCw className="w-4 h-4 mr-1" />
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <RedisKeyHeader
        keyType={keyType}
        keyName={keyName}
        ttl={ttl}
        isRenaming={isRenaming}
        newKeyName={newKeyName}
        copied={copied}
        isSaving={isSaving}
        isEditingTtl={isEditingTtl}
        editTtl={editTtl}
        readOnly={readOnly}
        onNewKeyNameChange={setNewKeyName}
        onRename={handleRename}
        onCancelRename={() => setIsRenaming(false)}
        onStartRename={() => {
          setNewKeyName(keyName);
          setIsRenaming(true);
        }}
        onCopy={handleCopy}
        onRefresh={loadKeyData}
        onDelete={handleDelete}
        onEditTtlChange={setEditTtl}
        onStartEditTtl={() => {
          setEditTtl(ttl > 0 ? String(ttl) : '');
          setIsEditingTtl(true);
        }}
        onCancelEditTtl={() => setIsEditingTtl(false)}
        onSetTtl={handleSetTtl}
        onPersist={handlePersist}
      />

      <div className="flex-1 overflow-auto p-4">
        {keyType === 'string' && (
          <StringValueEditor
            value={value as string}
            isEditing={isEditingValue}
            editValue={editValue}
            isSaving={isSaving}
            readOnly={readOnly}
            onEditValueChange={setEditValue}
            onStartEdit={() => {
              setEditValue(value as string);
              setIsEditingValue(true);
            }}
            onSave={handleSaveString}
            onCancel={() => setIsEditingValue(false)}
          />
        )}

        {keyType === 'hash' && value && typeof value === 'object' && !Array.isArray(value) && (
          <HashValueEditor
            value={value as Record<string, string>}
            newField={newField}
            newFieldValue={newFieldValue}
            isSaving={isSaving}
            readOnly={readOnly}
            onNewFieldChange={setNewField}
            onNewFieldValueChange={setNewFieldValue}
            onAddField={handleAddHashField}
            onDeleteField={handleDeleteHashField}
          />
        )}

        {keyType === 'list' && Array.isArray(value) && (
          <ListValueEditor
            value={value as string[]}
            newFieldValue={newFieldValue}
            isSaving={isSaving}
            readOnly={readOnly}
            onNewFieldValueChange={setNewFieldValue}
            onPush={handleListPush}
            onPop={handleListPop}
          />
        )}

        {keyType === 'set' && Array.isArray(value) && (
          <SetValueEditor
            value={value as string[]}
            newFieldValue={newFieldValue}
            isSaving={isSaving}
            readOnly={readOnly}
            onNewFieldValueChange={setNewFieldValue}
            onAdd={handleSetAdd}
            onRemove={handleSetRemove}
          />
        )}

        {keyType === 'zset' && Array.isArray(value) && (
          <ZSetValueEditor
            value={value as Array<{ member: string; score: number }>}
            newFieldValue={newFieldValue}
            newScore={newScore}
            isSaving={isSaving}
            readOnly={readOnly}
            onNewFieldValueChange={setNewFieldValue}
            onNewScoreChange={setNewScore}
            onAdd={handleZSetAdd}
            onRemove={handleZSetRemove}
          />
        )}

        {keyType === 'stream' && (
          <div className="text-center text-muted-foreground py-8">
            <p>{t('db.redis.streamUnsupported')}</p>
            <p className="text-sm mt-1">{t('db.redis.streamHint')}</p>
          </div>
        )}

        {keyType === 'none' && (
          <div className="text-center text-muted-foreground py-8">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('db.redis.keyNotFound')}</p>
          </div>
        )}
      </div>
    </div>
  );
});

export default RedisValueViewer;
