import React from 'react';
import type { RedisDataType } from '@ownshell/core';
import { Check, Clock, Copy, Edit2, Lock, RefreshCw, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@ownshell/ui';

import { formatTTL, TYPE_ICONS, TYPE_LABELS } from './meta';

interface RedisKeyHeaderProps {
  keyType: RedisDataType;
  keyName: string;
  ttl: number;
  isRenaming: boolean;
  newKeyName: string;
  copied: boolean;
  isSaving: boolean;
  isEditingTtl: boolean;
  editTtl: string;
  readOnly: boolean;
  onNewKeyNameChange: (name: string) => void;
  onRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onCopy: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  onEditTtlChange: (ttl: string) => void;
  onStartEditTtl: () => void;
  onCancelEditTtl: () => void;
  onSetTtl: () => void;
  onPersist: () => void;
}

export const RedisKeyHeader: React.FC<RedisKeyHeaderProps> = ({
  keyType,
  keyName,
  ttl,
  isRenaming,
  newKeyName,
  copied,
  isSaving,
  isEditingTtl,
  editTtl,
  readOnly,
  onNewKeyNameChange,
  onRename,
  onCancelRename,
  onStartRename,
  onCopy,
  onRefresh,
  onDelete,
  onEditTtlChange,
  onStartEditTtl,
  onCancelEditTtl,
  onSetTtl,
  onPersist,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-surface/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {TYPE_ICONS[keyType]}
          {isRenaming ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={newKeyName}
                onChange={(e) => onNewKeyNameChange(e.target.value)}
                placeholder={t('db.redis.newKeyName')}
                className="flex-1 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onRename();
                  if (e.key === 'Escape') onCancelRename();
                }}
              />
              <Button variant="ghost" size="sm" onClick={onRename} disabled={isSaving}>
                <Check className="w-4 h-4 text-success" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancelRename}>
                <X className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <span className="font-mono text-sm truncate text-foreground">{keyName}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onStartRename}
              disabled={isRenaming}
              title={t('db.redis.renameKey')}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onCopy} title={t('db.redis.copyValue')}>
            {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRefresh} title={t('common.refresh')}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive hover:bg-destructive/20/20"
              title={t('db.redis.deleteKey')}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {TYPE_ICONS[keyType]}
          {TYPE_LABELS[keyType]}
        </span>
        {readOnly && (
          <span className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-warning">
            <Lock className="w-3 h-3" />
            {t('db.readOnlyBadge', 'Read-only')}
          </span>
        )}
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {isEditingTtl ? (
            <div className="flex items-center gap-1">
              <Input
                value={editTtl}
                onChange={(e) => onEditTtlChange(e.target.value)}
                placeholder={t('db.redis.seconds')}
                className="w-20 h-6 text-xs"
                type="number"
                min="0"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSetTtl();
                  if (e.key === 'Escape') onCancelEditTtl();
                }}
              />
              <Button variant="ghost" size="sm" className="h-6 px-1" onClick={onSetTtl}>
                <Check className="w-3 h-3 text-success" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-1" onClick={onCancelEditTtl}>
                <X className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ) : (
            <>
              <span>{formatTTL(ttl)}</span>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1"
                  onClick={onStartEditTtl}
                  title={t('db.redis.setTtl')}
                >
                  <Edit2 className="w-3 h-3" />
                </Button>
              )}
              {ttl > 0 && !readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1"
                  onClick={onPersist}
                  title={t('db.redis.removeTtl')}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
