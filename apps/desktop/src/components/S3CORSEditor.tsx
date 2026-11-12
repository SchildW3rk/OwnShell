/**
 * S3 CORS Editor (TanStack Query)
 *
 * GUI for managing CORS rules on S3 buckets
 * - Add/Edit/Delete CORS rules
 * - App-styled method selection
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Loader2, AlertCircle, Shield, Check } from 'lucide-react';
import { Button, Input, cn } from '@ownshell/ui';
import { useS3CORS, useSaveS3CORS, useDeleteS3CORS } from '../hooks/s3';
import { S3CORSRule, S3CORSMethod } from '@ownshell/core';
import { useTranslation } from 'react-i18next';

const ALL_METHODS: S3CORSMethod[] = ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'];

interface S3CORSEditorProps {
  connectionId: string | null;
  bucket: string | null;
}

interface CORSRuleEditorProps {
  rule: S3CORSRule;
  ruleId: string;
  onChange: (rule: S3CORSRule) => void;
  onDelete: () => void;
}

interface MethodToggleProps {
  method: S3CORSMethod;
  checked: boolean;
  onToggle: () => void;
}

const MethodToggle: React.FC<MethodToggleProps> = ({ method, checked, onToggle }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    onClick={onToggle}
    className={cn(
      'no-drag inline-flex h-8 items-center gap-2 rounded border px-2.5 text-xs font-medium transition-colors',
      checked
        ? 'border-primary/60 bg-primary/10 text-foreground shadow-sm'
        : 'border-border bg-secondary text-muted-foreground hover:border-primary/40 hover:text-foreground'
    )}
  >
    <span
      className={cn(
        'flex h-4 w-4 items-center justify-center rounded border transition-colors',
        checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/40 bg-background'
      )}
    >
      {checked && <Check className="h-3 w-3" />}
    </span>
    <span>{method}</span>
  </button>
);

const CORSRuleEditor: React.FC<CORSRuleEditorProps> = ({ rule, ruleId, onChange, onDelete }) => {
  const { t } = useTranslation();
  const handleMethodToggle = (method: S3CORSMethod) => {
    const methods = rule.allowedMethods.includes(method)
      ? rule.allowedMethods.filter((m) => m !== method)
      : [...rule.allowedMethods, method];
    onChange({ ...rule, allowedMethods: methods });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-5 shadow-sm">
      {/* Rule Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{t('s3.cors.rule')}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="no-drag text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Allowed Origins */}
      <div>
        <label
          htmlFor={`cors-origins-${ruleId}`}
          className="block text-xs font-medium text-muted-foreground mb-1.5"
        >
          {t('s3.cors.allowedOrigins')}
        </label>
        <Input
          id={`cors-origins-${ruleId}`}
          type="text"
          value={rule.allowedOrigins.join(', ')}
          onChange={(e) =>
            onChange({
              ...rule,
              allowedOrigins: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="*, https://example.com"
        />
        <p className="text-xs text-muted-foreground/70 mt-1">
          Use * for all origins or specify domains
        </p>
      </div>

      {/* Allowed Methods */}
      <div>
        <span className="block text-xs font-medium text-muted-foreground mb-2">
          {t('s3.cors.allowedMethods')}
        </span>
        <div className="flex flex-wrap gap-2">
          {ALL_METHODS.map((method) => (
            <MethodToggle
              key={method}
              method={method}
              checked={rule.allowedMethods.includes(method)}
              onToggle={() => handleMethodToggle(method)}
            />
          ))}
        </div>
      </div>

      {/* Allowed Headers */}
      <div>
        <label
          htmlFor={`cors-headers-${ruleId}`}
          className="block text-xs font-medium text-muted-foreground mb-1.5"
        >
          {t('s3.cors.allowedHeaders')}
        </label>
        <Input
          id={`cors-headers-${ruleId}`}
          type="text"
          value={rule.allowedHeaders?.join(', ') || ''}
          onChange={(e) =>
            onChange({
              ...rule,
              allowedHeaders: e.target.value
                ? e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : undefined,
            })
          }
          placeholder="*, Content-Type, Authorization"
        />
      </div>

      {/* Expose Headers */}
      <div>
        <label
          htmlFor={`cors-expose-${ruleId}`}
          className="block text-xs font-medium text-muted-foreground mb-1.5"
        >
          {t('s3.cors.exposeHeaders')}
        </label>
        <Input
          id={`cors-expose-${ruleId}`}
          type="text"
          value={rule.exposeHeaders?.join(', ') || ''}
          onChange={(e) =>
            onChange({
              ...rule,
              exposeHeaders: e.target.value
                ? e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : undefined,
            })
          }
          placeholder="ETag, Content-Length"
        />
      </div>

      {/* Max Age */}
      <div>
        <label
          htmlFor={`cors-maxage-${ruleId}`}
          className="block text-xs font-medium text-muted-foreground mb-1.5"
        >
          {t('s3.cors.maxAge')}
        </label>
        <Input
          id={`cors-maxage-${ruleId}`}
          type="number"
          value={rule.maxAgeSeconds || ''}
          onChange={(e) =>
            onChange({
              ...rule,
              maxAgeSeconds: e.target.value ? parseInt(e.target.value, 10) : undefined,
            })
          }
          placeholder="3600"
          min={0}
        />
        <p className="text-xs text-muted-foreground/70 mt-1">
          {t('s3.cors.maxAgeHint')}
        </p>
      </div>
    </div>
  );
};

export const S3CORSEditor: React.FC<S3CORSEditorProps> = ({ connectionId, bucket }) => {
  const { t } = useTranslation();
  // TanStack Query hooks
  const corsQuery = useS3CORS(connectionId, bucket);
  const saveMutation = useSaveS3CORS(connectionId, bucket);
  const deleteMutation = useDeleteS3CORS(connectionId, bucket);

  const [localRules, setLocalRules] = useState<Array<S3CORSRule & { _id: string }>>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [idCounter, setIdCounter] = useState(0);

  // Sync local rules with query data
  useEffect(() => {
    if (corsQuery.data) {
      setLocalRules(corsQuery.data.map((rule, i) => ({ ...rule, _id: `rule-${i}` })));
      setHasChanges(false);
    }
  }, [corsQuery.data]);

  const handleAddRule = () => {
    const newRule: S3CORSRule & { _id: string } = {
      _id: `new-${idCounter}`,
      allowedOrigins: ['*'],
      allowedMethods: ['GET'],
      allowedHeaders: ['*'],
      maxAgeSeconds: 3600,
    };
    setIdCounter((c) => c + 1);
    setLocalRules([...localRules, newRule]);
    setHasChanges(true);
  };

  const handleRuleChange = (id: string, rule: S3CORSRule) => {
    setLocalRules(localRules.map((r) => (r._id === id ? { ...rule, _id: id } : r)));
    setHasChanges(true);
  };

  const handleDeleteRule = (id: string) => {
    setLocalRules(localRules.filter((r) => r._id !== id));
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Remove _id before saving
    const rulesToSave = localRules.map(({ _id, ...rule }) => rule);
    await saveMutation.mutateAsync(rulesToSave);
    setHasChanges(false);
  };

  const handleDeleteAll = async () => {
    if (confirm(t('s3.cors.deleteAllConfirm'))) {
      await deleteMutation.mutateAsync();
    }
  };

  const isLoading = corsQuery.isLoading;
  const isSaving = saveMutation.isPending || deleteMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t('s3.cors.title')}</h3>
        </div>
        <div className="flex items-center gap-2">
          {localRules.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDeleteAll}
              disabled={isSaving}
              className="no-drag text-destructive hover:bg-destructive/10"
            >
              {t('s3.cors.deleteAll')}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddRule}
            className="no-drag"
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('s3.cors.addRule')}
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          {t('s3.cors.info')}
        </p>
      </div>

      {/* Rules */}
      {localRules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-3 text-primary/60" />
          <p className="text-sm font-medium text-foreground">{t('s3.cors.noRules')}</p>
          <p className="text-xs mt-1">{t('s3.cors.noRulesHint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {localRules.map((rule) => (
            <CORSRuleEditor
              key={rule._id}
              rule={rule}
              ruleId={rule._id}
              onChange={(updated) => handleRuleChange(rule._id, updated)}
              onDelete={() => handleDeleteRule(rule._id)}
            />
          ))}
        </div>
      )}

      {/* Save Button */}
      {hasChanges && (
        <div className="sticky bottom-0 bg-background/95 border-t border-border pt-4 -mx-4 px-4 backdrop-blur">
          <Button
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full no-drag"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {t('s3.cors.save')}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
