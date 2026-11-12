import React from 'react';
import type { TunnelState } from '@ownshell/core';
import { Button, SectionHeader, StatusDot, formatBytes } from '@ownshell/ui';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Cable,
  Square,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ActiveTunnelsSectionProps {
  activeTunnels: TunnelState[];
  onStopTunnel: (id: string) => void;
}

export const ActiveTunnelsSection: React.FC<ActiveTunnelsSectionProps> = ({
  activeTunnels,
  onStopTunnel,
}) => {
  const { t } = useTranslation();

  return (
    <section>
      <SectionHeader>{t('tunnels.active')}</SectionHeader>

      {activeTunnels.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Cable className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('tunnels.noActive')}</p>
          <p className="text-xs mt-1">{t('tunnels.noActiveHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeTunnels.map((tunnel) => (
            <div key={tunnel.id} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusDot
                    variant={
                      tunnel.status === 'active'
                        ? 'success'
                        : tunnel.status === 'error'
                          ? 'error'
                          : 'warning'
                    }
                  />

                  <div>
                    <div className="flex items-center gap-2 text-foreground">
                      <span className="font-mono text-sm">
                        localhost:{tunnel.config.localPort}
                      </span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono text-sm">
                        {tunnel.config.remoteHost}:{tunnel.config.remotePort}
                      </span>
                    </div>

                    {tunnel.config.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {tunnel.config.description}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onStopTunnel(tunnel.id)}
                  className="no-drag text-destructive hover:bg-destructive/10"
                >
                  <Square className="w-4 h-4 mr-1.5" />
                  {t('tunnels.stop')}
                </Button>
              </div>

              <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {tunnel.connectedClients} {t('tunnels.clients')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ArrowUpFromLine className="w-3.5 h-3.5" />
                  <span>{formatBytes(tunnel.bytesTransferred.sent)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>{formatBytes(tunnel.bytesTransferred.received)}</span>
                </div>
              </div>

              {tunnel.error && (
                <div className="flex items-center gap-2 mt-2 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{tunnel.error}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
