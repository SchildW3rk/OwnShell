/**
 * Docker Networks View
 *
 * Lists all Docker networks
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Network,
  RefreshCw,
  Loader2,
  AlertCircle,
  Globe,
  Server,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@ownshell/ui';
import { DockerNetwork } from '@ownshell/core';
import { useDockerNetworks } from '../../hooks/docker';
import { useRemoveNetwork } from '../../hooks/docker/useDockerMutations';
import { CreateNetworkModal } from './CreateNetworkModal';
import toast from 'react-hot-toast';

interface DockerNetworksViewProps {
  sessionId: string;
}

export const DockerNetworksView: React.FC<DockerNetworksViewProps> = ({ sessionId }) => {
  const { t } = useTranslation();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const networksQuery = useDockerNetworks(sessionId);
  const removeNetworkMutation = useRemoveNetwork(sessionId);

  const networks = networksQuery.data?.networks || [];
  const isLoading = networksQuery.isLoading;

  const handleRefresh = () => {
    networksQuery.refetch();
  };

  const handleNetworkCreated = () => {
    networksQuery.refetch();
  };

  const handleDeleteNetwork = async (network: DockerNetwork) => {
    const isSystemNetwork = ['bridge', 'host', 'none'].includes(network.name);

    if (isSystemNetwork) {
      toast.error(t('docker.network.cannotDeleteSystem', 'Cannot delete system network'));
      return;
    }

    if (network.containers > 0) {
      const confirmed = confirm(
        t(
          'docker.network.deleteWithContainers',
          'This network has {{count}} connected containers. Delete anyway?',
          { count: network.containers }
        )
      );
      if (!confirmed) return;
    } else {
      const confirmed = confirm(
        t('docker.network.deleteConfirm', 'Delete network "{{name}}"?', { name: network.name })
      );
      if (!confirmed) return;
    }

    removeNetworkMutation.mutate({ networkId: network.id });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            {t('docker.networks', 'Networks')}
          </h2>
          <span className="text-xs text-muted-foreground">({networks.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('docker.network.create', 'Create Network')}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {networksQuery.data?.error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-[#F48771]/20">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <span className="text-sm text-destructive">{networksQuery.data.error}</span>
        </div>
      )}

      {/* Networks List */}
      <div className="flex-1 overflow-auto">
        {isLoading && networks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : networks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Network className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                {t('docker.noNetworks', 'No networks found')}
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium">{t('docker.name', 'Name')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('docker.driver', 'Driver')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('docker.scope', 'Scope')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('docker.subnet', 'Subnet')}</th>
                <th className="text-left px-4 py-2 font-medium">
                  {t('docker.gateway', 'Gateway')}
                </th>
                <th className="text-right px-4 py-2 font-medium">
                  {t('docker.containers', 'Containers')}
                </th>
                <th className="text-right px-4 py-2 font-medium w-24">
                  {t('docker.actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3E3E42]">
              {networks.map((network) => (
                <NetworkRow
                  key={network.id}
                  network={network}
                  onDelete={() => handleDeleteNetwork(network)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Network Modal */}
      {showCreateModal && (
        <CreateNetworkModal
          sessionId={sessionId}
          onClose={() => setShowCreateModal(false)}
          onNetworkCreated={handleNetworkCreated}
        />
      )}
    </div>
  );
};

interface NetworkRowProps {
  network: DockerNetwork;
  onDelete: () => void;
}

const NetworkRow: React.FC<NetworkRowProps> = ({ network, onDelete }) => {
  const { t } = useTranslation();
  const getDriverIcon = () => {
    switch (network.driver) {
      case 'bridge':
        return <Server className="w-4 h-4 text-accent" />;
      case 'host':
        return <Globe className="w-4 h-4 text-[#DCDCAA]" />;
      default:
        return <Network className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const isSystemNetwork = ['bridge', 'host', 'none'].includes(network.name);

  return (
    <tr className="group hover:bg-surface transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {getDriverIcon()}
          <span
            className={`text-sm font-medium ${isSystemNetwork ? 'text-muted-foreground' : 'text-foreground'}`}
          >
            {network.name}
          </span>
          {network.internal && (
            <span className="px-1.5 py-0.5 text-xs bg-secondary text-muted-foreground rounded">
              internal
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-accent">{network.driver}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-muted-foreground">{network.scope}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-muted-foreground font-mono">{network.subnet || '-'}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-muted-foreground font-mono">{network.gateway || '-'}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`text-sm ${network.containers > 0 ? 'text-accent' : 'text-muted-foreground'}`}>
          {network.containers}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {!isSystemNetwork && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            title={t('docker.network.delete', 'Delete network')}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </td>
    </tr>
  );
};

export default DockerNetworksView;
