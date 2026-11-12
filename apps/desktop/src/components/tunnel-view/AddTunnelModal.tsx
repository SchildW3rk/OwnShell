import React from 'react';
import { AppCheckbox, Button } from '@ownshell/ui';
import { ArrowRight, Cable, Loader2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TunnelFormData } from './types';

interface AddTunnelModalProps {
  formData: TunnelFormData;
  isStarting: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onChange: (formData: TunnelFormData) => void;
  onClose: () => void;
}

export const AddTunnelModal: React.FC<AddTunnelModalProps> = ({
  formData,
  isStarting,
  onSubmit,
  onChange,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-lg p-6 w-[420px]">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Cable className="w-5 h-5 text-primary" />
          {t('tunnels.addPortForward')}
        </h3>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="tunnel-local-port" className="block text-xs text-muted-foreground mb-1">
              {t('tunnels.localPort')}
            </label>
            <input
              id="tunnel-local-port"
              type="number"
              value={formData.localPort}
              onChange={(event) => onChange({ ...formData, localPort: event.target.value })}
              placeholder="8080"
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
              required
              min={1}
              max={65535}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('tunnels.localPortHelp', { port: formData.localPort || '...' })}
            </p>
          </div>

          <div>
            <label
              htmlFor="tunnel-remote-host"
              className="block text-xs text-muted-foreground mb-1"
            >
              {t('tunnels.remoteHost')}
            </label>
            <input
              id="tunnel-remote-host"
              type="text"
              value={formData.remoteHost}
              onChange={(event) => onChange({ ...formData, remoteHost: event.target.value })}
              placeholder="127.0.0.1"
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">{t('tunnels.remoteHostHelp')}</p>
          </div>

          <div>
            <label
              htmlFor="tunnel-remote-port"
              className="block text-xs text-muted-foreground mb-1"
            >
              {t('tunnels.remotePort')}
            </label>
            <input
              id="tunnel-remote-port"
              type="number"
              value={formData.remotePort}
              onChange={(event) => onChange({ ...formData, remotePort: event.target.value })}
              placeholder="80"
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
              required
              min={1}
              max={65535}
            />
          </div>

          <div>
            <label htmlFor="tunnel-name" className="block text-xs text-muted-foreground mb-1">
              {t('tunnels.nameOptional')}
            </label>
            <input
              id="tunnel-name"
              type="text"
              value={formData.name}
              onChange={(event) => onChange({ ...formData, name: event.target.value })}
              placeholder={t('tunnels.namePlaceholder')}
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-2">
            <AppCheckbox
              checked={formData.saveConfig}
              onCheckedChange={(checked) => onChange({ ...formData, saveConfig: checked })}
              label={t('tunnels.saveConfig')}
              className="py-1"
            />

            {formData.saveConfig && (
              <AppCheckbox
                checked={formData.autoStart}
                onCheckedChange={(checked) => onChange({ ...formData, autoStart: checked })}
                label={t('tunnels.autoStart')}
                className="ml-6 py-1"
              />
            )}
          </div>

          {formData.localPort && formData.remotePort && (
            <div className="bg-background border border-border rounded p-3">
              <p className="text-xs text-muted-foreground mb-1">{t('tunnels.thisWillForward')}</p>
              <p className="text-sm text-foreground font-mono flex items-center gap-2">
                <span>localhost:{formData.localPort}</span>
                <ArrowRight className="w-4 h-4 text-primary" />
                <span>
                  {formData.remoteHost}:{formData.remotePort}
                </span>
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="no-drag"
              disabled={isStarting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="no-drag"
              disabled={isStarting}
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  {t('tunnels.starting')}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1.5" />
                  {t('tunnels.startTunnel')}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
