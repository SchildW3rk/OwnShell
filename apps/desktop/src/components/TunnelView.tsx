/**
 * Tunnel View
 *
 * Port forwarding management UI.
 */

import React, { useEffect, useState } from 'react';
import type { SavedTunnel } from '@ownshell/core';
import { Button, LoadingState } from '@ownshell/ui';
import { Cable, Plus, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useTerminalStore } from '../stores/useTerminalStore';
import { useTunnelStore } from '../stores/useTunnelStore';
import { ActiveTunnelsSection } from './tunnel-view/ActiveTunnelsSection';
import { AddTunnelModal } from './tunnel-view/AddTunnelModal';
import {
  DiscoveredServicesSection,
  type DiscoveredTunnelTarget,
} from './tunnel-view/DiscoveredServicesSection';
import { SavedTunnelsSection } from './tunnel-view/SavedTunnelsSection';
import type { TunnelFormData } from './tunnel-view/types';

interface TunnelViewProps {
  sessionId: string;
}

const defaultFormData: TunnelFormData = {
  localPort: '',
  remoteHost: '127.0.0.1',
  remotePort: '',
  name: '',
  autoStart: false,
  saveConfig: true,
};

export const TunnelView: React.FC<TunnelViewProps> = ({ sessionId }) => {
  const { t } = useTranslation();
  const sessions = useTerminalStore(useShallow((state) => state.sessions));
  const {
    getActiveTunnels,
    getSavedTunnels,
    startTunnel,
    stopTunnel,
    refreshTunnels,
    loadSavedTunnels,
    saveTunnelConfig,
    deleteSavedTunnel,
  } = useTunnelStore();

  const terminalSession = sessions.find((session) => session.id === sessionId);
  const sshSessionId = terminalSession?.sessionId;
  const hostId = terminalSession?.host?.id;

  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<TunnelFormData>(defaultFormData);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (hostId) {
      loadSavedTunnels(hostId);
    }
  }, [hostId, loadSavedTunnels]);

  useEffect(() => {
    if (sshSessionId) {
      refreshTunnels(sshSessionId);

      const interval = setInterval(() => {
        refreshTunnels(sshSessionId);
      }, 5000);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [sshSessionId, refreshTunnels]);

  if (!sshSessionId || !hostId) {
    return <LoadingState message={t('tunnels.waitingForSSH')} />;
  }

  const activeTunnels = getActiveTunnels(sshSessionId);
  const savedTunnels = getSavedTunnels(hostId);

  const handleStartTunnel = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsStarting(true);

    try {
      const config = {
        localPort: parseInt(formData.localPort, 10),
        remoteHost: formData.remoteHost,
        remotePort: parseInt(formData.remotePort, 10),
        description: formData.name || undefined,
      };

      const tunnelId = await startTunnel(sshSessionId, config);

      if (tunnelId && formData.saveConfig) {
        await saveTunnelConfig(hostId, {
          localPort: config.localPort,
          remoteHost: config.remoteHost,
          remotePort: config.remotePort,
          name: formData.name || `Port ${config.localPort}`,
          autoStart: formData.autoStart,
        });
      }

      setFormData(defaultFormData);
      setShowAddForm(false);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStartSavedTunnel = async (saved: SavedTunnel) => {
    await startTunnel(sshSessionId, {
      localPort: saved.localPort,
      remoteHost: saved.remoteHost,
      remotePort: saved.remotePort,
      description: saved.name,
    });
  };

  const handleStartDiscoveredTarget = async (target: DiscoveredTunnelTarget) => {
    await startTunnel(sshSessionId, {
      localPort: target.localPort,
      remoteHost: target.remoteHost,
      remotePort: target.remotePort,
      description: target.name,
    });
  };

  const handleCustomizeDiscoveredTarget = (target: DiscoveredTunnelTarget) => {
    setFormData({
      localPort: String(target.localPort),
      remoteHost: target.remoteHost,
      remotePort: String(target.remotePort),
      name: target.name,
      autoStart: false,
      saveConfig: false,
    });
    setShowAddForm(true);
  };

  const handleDeleteSaved = async (tunnelId: string) => {
    if (confirm(t('tunnels.deleteConfirm'))) {
      await deleteSavedTunnel(tunnelId, hostId);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <Cable className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">{t('tunnels.title')}</h2>
          <span className="text-xs text-muted-foreground">
            ({activeTunnels.filter((tunnel) => tunnel.status === 'active').length} active)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refreshTunnels(sshSessionId)}
            className="no-drag"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="no-drag"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {t('tunnels.add')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        <ActiveTunnelsSection activeTunnels={activeTunnels} onStopTunnel={stopTunnel} />
        <DiscoveredServicesSection
          sessionId={sshSessionId}
          activeTunnels={activeTunnels}
          onStartTarget={handleStartDiscoveredTarget}
          onCustomizeTarget={handleCustomizeDiscoveredTarget}
          onStopTunnel={stopTunnel}
        />
        <SavedTunnelsSection
          savedTunnels={savedTunnels}
          activeTunnels={activeTunnels}
          onStartSavedTunnel={handleStartSavedTunnel}
          onStopTunnel={stopTunnel}
          onDeleteSavedTunnel={handleDeleteSaved}
        />
      </div>

      {showAddForm && (
        <AddTunnelModal
          formData={formData}
          isStarting={isStarting}
          onSubmit={handleStartTunnel}
          onChange={setFormData}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
};
