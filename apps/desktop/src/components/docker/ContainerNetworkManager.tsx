/**
 * Container Network Manager
 *
 * Shows connected networks with ability to connect/disconnect
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Network, X, Plus, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useDockerNetworks } from '../../hooks/docker';
import { DockerContainerNetwork } from '@ownshell/core';
import toast from 'react-hot-toast';

interface ContainerNetworkManagerProps {
  sessionId: string;
  containerId: string;
}

export const ContainerNetworkManager: React.FC<ContainerNetworkManagerProps> = ({
  sessionId,
  containerId,
}) => {
  const { t } = useTranslation();
  const [connectedNetworks, setConnectedNetworks] = useState<DockerContainerNetwork[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);
  const [showAddDropdown, setShowAddDropdown] = useState(false);

  // Get all available networks
  const networksQuery = useDockerNetworks(sessionId);
  const availableNetworks = networksQuery.data?.networks || [];

  // Load connected networks for this container
  useEffect(() => {
    const loadConnectedNetworks = async () => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.docker.containerNetworks(sessionId, containerId);
        if (result.success && result.networks) {
          setConnectedNetworks(result.networks);
        }
      } catch (err) {
        console.error('Failed to load container networks:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadConnectedNetworks();
  }, [sessionId, containerId]);

  const handleConnect = async (networkName: string) => {
    setIsConnecting(true);
    setShowAddDropdown(false);

    try {
      const result = await window.electronAPI.docker.networkConnect(
        sessionId,
        networkName,
        containerId
      );

      if (result.success) {
        toast.success(t('docker.network.connected', { network: networkName }));
        // Refresh connected networks
        const refreshResult = await window.electronAPI.docker.containerNetworks(
          sessionId,
          containerId
        );
        if (refreshResult.success && refreshResult.networks) {
          setConnectedNetworks(refreshResult.networks);
        }
      } else {
        toast.error(result.error || t('docker.network.connectFailed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('docker.network.connectFailed'));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (networkName: string) => {
    // Prevent disconnecting from bridge network
    if (networkName === 'bridge') {
      toast.error(
        t('docker.network.cannotDisconnectBridge', 'Cannot disconnect from bridge network')
      );
      return;
    }

    setIsDisconnecting(networkName);

    try {
      const result = await window.electronAPI.docker.networkDisconnect(
        sessionId,
        networkName,
        containerId
      );

      if (result.success) {
        toast.success(t('docker.network.disconnected', { network: networkName }));
        // Remove from local state
        setConnectedNetworks((prev) => prev.filter((n) => n.name !== networkName));
      } else {
        toast.error(result.error || t('docker.network.disconnectFailed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('docker.network.disconnectFailed'));
    } finally {
      setIsDisconnecting(null);
    }
  };

  // Filter out already connected networks from available list
  const unconnectedNetworks = availableNetworks.filter(
    (n) => !connectedNetworks.some((cn) => cn.name === n.name)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {t('docker.network.connectedNetworks', 'Connected Networks')}
          </span>
        </div>

        {/* Add Network Dropdown */}
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAddDropdown(!showAddDropdown)}
            disabled={isConnecting || unconnectedNetworks.length === 0}
          >
            {isConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>

          {showAddDropdown && unconnectedNetworks.length > 0 && (
            <div className="absolute right-0 mt-1 w-48 bg-surface border border-border rounded-lg shadow-lg z-10 py-1 max-h-48 overflow-auto">
              {unconnectedNetworks.map((network) => (
                <button
                  type="button"
                  key={network.id}
                  onClick={() => handleConnect(network.name)}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-secondary flex items-center gap-2"
                >
                  <Network className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="truncate">{network.name}</span>
                  <span className="text-xs text-[#606060] ml-auto">{network.driver}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Connected Networks List */}
      {connectedNetworks.length === 0 ? (
        <div className="text-center py-4">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            {t('docker.network.noNetworks', 'No networks connected')}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {connectedNetworks.map((network) => (
            <div
              key={network.name}
              className="flex items-center gap-2 px-3 py-1.5 bg-secondary border border-border rounded-lg group"
            >
              <Network className="w-3.5 h-3.5 text-accent" />
              <div className="flex flex-col">
                <span className="text-sm text-foreground">{network.name}</span>
                {network.ipAddress && (
                  <span className="text-xs text-[#606060] font-mono">{network.ipAddress}</span>
                )}
              </div>

              {/* Disconnect button - hidden for bridge */}
              {network.name !== 'bridge' && (
                <button
                  type="button"
                  onClick={() => handleDisconnect(network.name)}
                  disabled={isDisconnecting === network.name}
                  className="ml-2 p-0.5 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                  title={t('docker.network.disconnect', 'Disconnect')}
                >
                  {isDisconnecting === network.name ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContainerNetworkManager;
