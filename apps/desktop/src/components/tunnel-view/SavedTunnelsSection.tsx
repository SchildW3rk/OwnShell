import React from 'react';
import type { SavedTunnel, TunnelState } from '@ownshell/core';
import { Button, SectionHeader, StatusDot } from '@ownshell/ui';
import { ArrowRight, Bookmark, Play, Square, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SavedTunnelsSectionProps {
  savedTunnels: SavedTunnel[];
  activeTunnels: TunnelState[];
  onStartSavedTunnel: (saved: SavedTunnel) => void;
  onStopTunnel: (id: string) => void;
  onDeleteSavedTunnel: (id: string) => void;
}

export const SavedTunnelsSection: React.FC<SavedTunnelsSectionProps> = ({
  savedTunnels,
  activeTunnels,
  onStartSavedTunnel,
  onStopTunnel,
  onDeleteSavedTunnel,
}) => {
  const { t } = useTranslation();

  const getActiveTunnelForSaved = (saved: SavedTunnel): TunnelState | undefined =>
    activeTunnels.find(
      (tunnel) =>
        tunnel.config.localPort === saved.localPort &&
        tunnel.config.remoteHost === saved.remoteHost &&
        tunnel.config.remotePort === saved.remotePort
    );

  return (
    <section>
      <SectionHeader className="flex items-center gap-2">
        <Bookmark className="w-3.5 h-3.5" />
        {t('tunnels.savedConfigs')}
      </SectionHeader>

      {savedTunnels.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">{t('tunnels.noSaved')}</p>
          <p className="text-xs mt-1">{t('tunnels.noSavedHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {savedTunnels.map((saved) => {
            const activeTunnel = getActiveTunnelForSaved(saved);
            const isActive = activeTunnel?.status === 'active';

            return (
              <div
                key={saved.id}
                className="bg-surface border border-border rounded-lg p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <StatusDot variant={isActive ? 'success' : 'muted'} />

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground font-medium">{saved.name}</span>
                      {saved.autoStart && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded">
                          Auto-start
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 font-mono">
                      <span>:{saved.localPort}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span>
                        {saved.remoteHost}:{saved.remotePort}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => activeTunnel && onStopTunnel(activeTunnel.id)}
                      className="no-drag text-destructive"
                    >
                      <Square className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onStartSavedTunnel(saved)}
                      className="no-drag text-success"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteSavedTunnel(saved.id)}
                    className="no-drag text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
