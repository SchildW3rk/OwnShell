/**
 * Create Network Modal
 *
 * Modal for creating new Docker networks with basic and advanced options
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Network, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@ownshell/ui';
import toast from 'react-hot-toast';

interface CreateNetworkModalProps {
  sessionId: string;
  onClose: () => void;
  onNetworkCreated?: () => void;
}

export const CreateNetworkModal: React.FC<CreateNetworkModalProps> = ({
  sessionId,
  onClose,
  onNetworkCreated,
}) => {
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [driver, setDriver] = useState('bridge');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [subnet, setSubnet] = useState('');
  const [gateway, setGateway] = useState('');
  const [ipv6, setIpv6] = useState(false);
  const [internal, setInternal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('docker.network.nameRequired', 'Network name is required'));
      return;
    }

    setIsCreating(true);

    try {
      const result = await window.electronAPI.docker.networkCreate(sessionId, {
        name: name.trim(),
        driver,
        subnet: subnet.trim() || undefined,
        gateway: gateway.trim() || undefined,
        ipv6,
        internal,
      });

      if (result.success) {
        toast.success(t('docker.network.created', 'Network created successfully'));
        onNetworkCreated?.();
        onClose();
      } else {
        toast.error(result.error || t('docker.network.createFailed', 'Failed to create network'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('docker.network.createFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative bg-background border border-border rounded-lg shadow-2xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              {t('docker.network.create', 'Create Network')}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Network Name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t('docker.network.name', 'Network Name')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-network"
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-[#606060] focus:outline-none focus:border-primary"
              autoFocus
            />
          </div>

          {/* Driver */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t('docker.network.driver', 'Driver')}
            </label>
            <select
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="bridge">bridge</option>
              <option value="host">host</option>
              <option value="overlay">overlay</option>
              <option value="macvlan">macvlan</option>
            </select>
          </div>

          {/* Advanced Options Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs text-primary hover:text-[#1E90FF] transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {t('docker.network.advancedOptions', 'Advanced Options')}
          </button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="space-y-4 pt-2 border-t border-border">
              {/* Subnet */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  {t('docker.network.subnet', 'Subnet')} ({t('common.optional', 'optional')})
                </label>
                <input
                  type="text"
                  value={subnet}
                  onChange={(e) => setSubnet(e.target.value)}
                  placeholder="172.20.0.0/16"
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-[#606060] focus:outline-none focus:border-primary"
                />
              </div>

              {/* Gateway */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  {t('docker.network.gateway', 'Gateway')} ({t('common.optional', 'optional')})
                </label>
                <input
                  type="text"
                  value={gateway}
                  onChange={(e) => setGateway(e.target.value)}
                  placeholder="172.20.0.1"
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-[#606060] focus:outline-none focus:border-primary"
                />
              </div>

              {/* IPv6 */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ipv6}
                  onChange={(e) => setIpv6(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0"
                />
                <span className="text-sm text-foreground">
                  {t('docker.network.enableIPv6', 'Enable IPv6')}
                </span>
              </label>

              {/* Internal */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={internal}
                  onChange={(e) => setInternal(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0"
                />
                <span className="text-sm text-foreground">
                  {t('docker.network.internal', 'Internal (restrict external access)')}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 bg-surface border-t border-border">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('docker.network.creating', 'Creating...')}
              </>
            ) : (
              t('docker.network.create', 'Create Network')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateNetworkModal;
