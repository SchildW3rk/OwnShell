/**
 * S3 Connection Modal (TanStack Query)
 *
 * Form for creating/editing S3 connections
 * - Test connection before saving
 * - Supports AWS S3, Hetzner, MinIO, etc.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Cloud, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button, Input } from '@ownshell/ui';
import { useCreateS3Connection, useUpdateS3Connection } from '../hooks/s3';

interface S3ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editConnection?: {
    id: string;
    label: string;
    endpoint: string;
    region: string;
    bucket_name: string | null;
  };
}

export const S3ConnectionModal: React.FC<S3ConnectionModalProps> = ({
  isOpen,
  onClose,
  editConnection,
}) => {
  const { t } = useTranslation();

  // TanStack Query mutations
  const createMutation = useCreateS3Connection();
  const updateMutation = useUpdateS3Connection();

  const [formData, setFormData] = useState({
    label: '',
    endpoint: '',
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const isEdit = !!editConnection;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        label: editConnection?.label || '',
        endpoint: editConnection?.endpoint || '',
        region: editConnection?.region || '',
        accessKeyId: '',
        secretAccessKey: '',
        bucketName: editConnection?.bucket_name || '',
      });
      setTestResult(null);
      setIsTesting(false);
    }
  }, [isOpen, editConnection]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear test result when form changes
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (
      !formData.endpoint ||
      !formData.region ||
      !formData.accessKeyId ||
      !formData.secretAccessKey
    ) {
      setTestResult({
        success: false,
        message: t('s3.fillRequired'),
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await window.electronAPI.s3.testConnection({
        endpoint: formData.endpoint,
        region: formData.region,
        accessKeyId: formData.accessKeyId,
        secretAccessKey: formData.secretAccessKey,
      });

      if (result.success) {
        setTestResult({
          success: true,
          message: t('s3.testSuccess', { count: result.bucketCount }),
        });
      } else {
        setTestResult({
          success: false,
          message: result.error || t('s3.testFailed'),
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : t('s3.testFailed'),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.label || !formData.endpoint || !formData.region) {
      return;
    }

    // For new connections, require credentials
    if (!isEdit && (!formData.accessKeyId || !formData.secretAccessKey)) {
      return;
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: editConnection.id,
          data: {
            label: formData.label,
            endpoint: formData.endpoint,
            region: formData.region,
            bucketName: formData.bucketName || null,
            // Only update credentials if provided
            ...(formData.accessKeyId && { accessKeyId: formData.accessKeyId }),
            ...(formData.secretAccessKey && { secretAccessKey: formData.secretAccessKey }),
          },
        });
      } else {
        await createMutation.mutateAsync({
          label: formData.label,
          endpoint: formData.endpoint,
          region: formData.region,
          accessKeyId: formData.accessKeyId,
          secretAccessKey: formData.secretAccessKey,
          bucketName: formData.bucketName || undefined,
        });
      }
      onClose();
    } catch {
      // Error is handled by the mutation (toast)
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-[min(520px,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card text-card-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {isEdit ? t('s3.editTitle') : t('s3.addTitle')}
            </h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="no-drag text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Label */}
          <div>
            <label
              htmlFor="s3-label"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('s3.label')} *
            </label>
            <Input
              id="s3-label"
              type="text"
              value={formData.label}
              onChange={(e) => handleInputChange('label', e.target.value)}
              placeholder={t('s3.labelPlaceholder')}
              required
            />
          </div>

          {/* Endpoint */}
          <div>
            <label
              htmlFor="s3-endpoint"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('s3.endpoint')} *
            </label>
            <Input
              id="s3-endpoint"
              type="url"
              value={formData.endpoint}
              onChange={(e) => handleInputChange('endpoint', e.target.value)}
              placeholder={t('s3.endpointPlaceholder')}
              required
            />
            <p className="text-xs text-muted-foreground/70 mt-1">{t('s3.endpointHelp')}</p>
          </div>

          {/* Region */}
          <div>
            <label
              htmlFor="s3-region"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('s3.region')} *
            </label>
            <Input
              id="s3-region"
              type="text"
              value={formData.region}
              onChange={(e) => handleInputChange('region', e.target.value)}
              placeholder={t('s3.regionPlaceholder')}
              required
            />
          </div>

          {/* Access Key ID */}
          <div>
            <label
              htmlFor="s3-access-key"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('s3.accessKey')} {isEdit ? t('s3.leaveBlankToKeep') : '*'}
            </label>
            <Input
              id="s3-access-key"
              type="password"
              value={formData.accessKeyId}
              onChange={(e) => handleInputChange('accessKeyId', e.target.value)}
              placeholder={t('s3.accessKeyPlaceholder')}
              required={!isEdit}
            />
          </div>

          {/* Secret Access Key */}
          <div>
            <label
              htmlFor="s3-secret-key"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('s3.secretKey')} {isEdit ? t('s3.leaveBlankToKeep') : '*'}
            </label>
            <Input
              id="s3-secret-key"
              type="password"
              value={formData.secretAccessKey}
              onChange={(e) => handleInputChange('secretAccessKey', e.target.value)}
              placeholder={t('s3.secretKeyPlaceholder')}
              required={!isEdit}
            />
          </div>

          {/* Bucket (Optional) */}
          <div>
            <label
              htmlFor="s3-bucket"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('s3.bucket')}
            </label>
            <Input
              id="s3-bucket"
              type="text"
              value={formData.bucketName}
              onChange={(e) => handleInputChange('bucketName', e.target.value)}
              placeholder={t('s3.bucketPlaceholder')}
            />
            <p className="text-xs text-muted-foreground/70 mt-1">{t('s3.bucketHelp')}</p>
          </div>

          {/* Test Connection Button */}
          <div className="pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting || !formData.accessKeyId || !formData.secretAccessKey}
              className="w-full no-drag"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('s3.testing')}
                </>
              ) : (
                t('s3.test')
              )}
            </Button>

            {/* Test Result */}
            {testResult && (
              <div
                className={`flex items-center gap-2 mt-2 p-2 rounded text-sm ${
                  testResult.success
                    ? 'bg-success/10 text-success border border-success/25'
                    : 'bg-destructive/10 text-destructive border border-destructive/25'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="break-words">{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
              className="no-drag"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSaving}
              className="no-drag"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('s3.saving')}
                </>
              ) : isEdit ? (
                t('common.save')
              ) : (
                t('s3.create')
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
