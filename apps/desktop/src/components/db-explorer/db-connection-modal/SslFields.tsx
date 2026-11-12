import React from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AppSelect, Badge, Button, Textarea } from '@ownshell/ui';
import { FolderOpen, ShieldAlert, X } from 'lucide-react';
import type { DBConnectionFormData, DbSslMode } from './types';

interface SslFieldsProps {
  formData: DBConnectionFormData;
  /** Fingerprint of the CA already saved with this connection */
  storedCaFingerprint?: string | null;
  /** Connection was migrated from the old unverified SSL switch */
  showLegacyHint?: boolean;
  onChange: (updater: (prev: DBConnectionFormData) => DBConnectionFormData) => void;
}

export const SslFields: React.FC<SslFieldsProps> = ({
  formData,
  storedCaFingerprint,
  showLegacyHint,
  onChange,
}) => {
  const { t } = useTranslation();
  const hasStoredCa = Boolean(storedCaFingerprint) && !formData.sslCaRemoved && !formData.sslCa;

  const pickCaFile = async () => {
    const result = await window.electronAPI.dbConnections.pickCaCertificate();
    if (result.success && result.pem) {
      const pem = result.pem;
      onChange((prev) => ({ ...prev, sslCa: pem }));
    } else if (result.error) {
      toast.error(t('database.ssl.caInvalid'));
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor="db-ssl-mode" className="block text-sm font-medium text-foreground">
        {t('database.ssl.label')}
      </label>
      <AppSelect
        id="db-ssl-mode"
        value={formData.sslMode}
        onChange={(sslMode) => onChange((prev) => ({ ...prev, sslMode: sslMode as DbSslMode }))}
        options={[
          { value: 'disabled', label: t('database.ssl.modeDisabled') },
          { value: 'require', label: t('database.ssl.modeRequire') },
          { value: 'require-no-verify', label: t('database.ssl.modeRequireNoVerify') },
        ]}
      />

      {formData.sslMode === 'require-no-verify' && (
        <div className="flex items-start gap-2">
          <Badge variant="warning">
            <ShieldAlert className="mr-1 inline h-3 w-3" aria-hidden="true" />
            {t('database.ssl.noVerifyBadge')}
          </Badge>
          <p className="text-xs text-muted-foreground">{t('database.ssl.noVerifyHint')}</p>
        </div>
      )}

      {showLegacyHint && formData.sslMode === 'require-no-verify' && (
        <p className="text-xs text-warning">{t('database.ssl.legacyHint')}</p>
      )}

      {formData.sslMode !== 'disabled' && (
        <div className="space-y-1">
          <span className="block text-sm font-medium text-foreground">
            {t('database.ssl.caLabel')}
          </span>
          {hasStoredCa ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="success">{t('database.ssl.caSet')}</Badge>
              <span className="truncate font-mono" title={storedCaFingerprint ?? undefined}>
                {storedCaFingerprint}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange((prev) => ({ ...prev, sslCaRemoved: true }))}
                aria-label={t('database.ssl.caRemove')}
                title={t('database.ssl.caRemove')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Textarea
                id="db-ssl-ca"
                value={formData.sslCa}
                onChange={(e) => onChange((prev) => ({ ...prev, sslCa: e.target.value }))}
                placeholder="-----BEGIN CERTIFICATE-----"
                rows={3}
                className="font-mono text-xs"
                aria-label={t('database.ssl.caLabel')}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{t('database.ssl.caHint')}</p>
                <Button type="button" variant="ghost" size="sm" onClick={pickCaFile}>
                  <FolderOpen className="mr-1 h-4 w-4" />
                  {t('database.ssl.caChooseFile')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
