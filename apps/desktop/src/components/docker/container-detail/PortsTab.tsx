import React, { useMemo, useState } from 'react';
import type {
  DockerContainerExtended,
  DockerContainerNetwork,
  DockerContainerPortTarget,
} from '@ownshell/core';
import { AppCheckbox, AppSelect, Button } from '@ownshell/ui';
import {
  AlertCircle,
  ArrowRight,
  Cable,
  CheckCircle2,
  Loader2,
  Network,
  Play,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useDockerContainerPorts } from '../../../hooks/docker';
import { useTunnelStore } from '../../../stores/useTunnelStore';
import { formatName } from '../utils';

interface PortsTabProps {
  sessionId: string;
  hostId?: string;
  container: DockerContainerExtended;
}

interface TunnelDraft {
  localPort: string;
  remoteHost: string;
  remotePort: string;
  name: string;
  saveConfig: boolean;
  autoStart: boolean;
  targetLabel: string;
}

const isValidPort = (value: string): boolean => {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
};

const getPublishedLabel = (target: DockerContainerPortTarget): string =>
  target.published.length > 0
    ? target.published
        .map((binding) => `${binding.hostIp || '*'}:${binding.hostPort}`)
        .join(', ')
    : 'internal';

export const PortsTab: React.FC<PortsTabProps> = ({ sessionId, hostId, container }) => {
  const { t } = useTranslation();
  const { startTunnel, saveTunnelConfig } = useTunnelStore();
  const [draft, setDraft] = useState<TunnelDraft | null>(null);
  const [manualLocalPort, setManualLocalPort] = useState('');
  const [manualRemotePort, setManualRemotePort] = useState('');
  const [manualNetworkName, setManualNetworkName] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedTunnel, setStartedTunnel] = useState<{ localPort: number; target: string } | null>(
    null
  );

  const portsQuery = useDockerContainerPorts(sessionId, container.id);
  const ports = portsQuery.data?.ports || [];
  const networks = portsQuery.data?.networks || [];
  const containerName = formatName(container.names);
  const networkOptions = networks.map((network) => ({
    value: network.name,
    label: `${network.name} (${network.ipAddress})`,
  }));

  const selectedManualNetwork = useMemo<DockerContainerNetwork | undefined>(() => {
    if (manualNetworkName) {
      return networks.find((network) => network.name === manualNetworkName);
    }
    return networks[0];
  }, [manualNetworkName, networks]);

  const openDraft = (target: DockerContainerPortTarget) => {
    setError(null);
    setStartedTunnel(null);
    setDraft({
      localPort: String(target.port),
      remoteHost: target.ipAddress,
      remotePort: String(target.port),
      name: `${containerName}:${target.portSpec}`,
      saveConfig: false,
      autoStart: false,
      targetLabel: `${target.ipAddress}:${target.port} (${target.networkName})`,
    });
  };

  const openManualDraft = () => {
    if (!selectedManualNetwork) return;

    const localPort = manualLocalPort || manualRemotePort;
    if (!isValidPort(localPort) || !isValidPort(manualRemotePort)) {
      setError(t('docker.portsTab.invalidPort', 'Ports must be between 1 and 65535.'));
      return;
    }

    setError(null);
    setStartedTunnel(null);
    setDraft({
      localPort,
      remoteHost: selectedManualNetwork.ipAddress,
      remotePort: manualRemotePort,
      name: `${containerName}:${manualRemotePort}/tcp`,
      saveConfig: false,
      autoStart: false,
      targetLabel: `${selectedManualNetwork.ipAddress}:${manualRemotePort} (${selectedManualNetwork.name})`,
    });
  };

  const startDraftTunnel = async () => {
    if (!draft) return;

    if (!isValidPort(draft.localPort) || !isValidPort(draft.remotePort)) {
      setError(t('docker.portsTab.invalidPort', 'Ports must be between 1 and 65535.'));
      return;
    }

    const localPort = Number.parseInt(draft.localPort, 10);
    const remotePort = Number.parseInt(draft.remotePort, 10);

    setIsStarting(true);
    setError(null);

    try {
      const tunnelId = await startTunnel(sessionId, {
        localPort,
        remoteHost: draft.remoteHost,
        remotePort,
        description: draft.name || `${containerName}:${remotePort}`,
      });

      if (!tunnelId) {
        setError(t('docker.portsTab.startFailed', 'Tunnel could not be started.'));
        return;
      }

      if (hostId && draft.saveConfig) {
        await saveTunnelConfig(hostId, {
          localPort,
          remoteHost: draft.remoteHost,
          remotePort,
          name: draft.name || `${containerName}:${remotePort}`,
          autoStart: draft.autoStart,
        });
      }

      setStartedTunnel({ localPort, target: `${draft.remoteHost}:${remotePort}` });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="h-full overflow-auto bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cable className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t('docker.portsTab.title', 'Container Ports')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('docker.portsTab.subtitle', 'Create local tunnels to internal container ports.')}
            </p>
          </div>
        </div>
        {portsQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </div>

      {portsQuery.data?.error && (
        <div className="mb-4 flex items-center gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {portsQuery.data.error}
        </div>
      )}

      <div className="rounded border border-border bg-surface">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{t('docker.portsTab.containerPort', 'Container Port')}</span>
          <span>{t('docker.portsTab.network', 'Network')}</span>
          <span>{t('docker.portsTab.containerIp', 'Container IP')}</span>
          <span>{t('docker.portsTab.published', 'Published')}</span>
          <span className="text-right">{t('docker.actions')}</span>
        </div>

        {ports.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <Network className="mx-auto mb-2 h-8 w-8 opacity-50" />
            {t('docker.portsTab.noPorts', 'No exposed container ports found.')}
          </div>
        ) : (
          ports.map((target) => (
            <div
              key={`${target.portSpec}-${target.networkName}-${target.ipAddress}`}
              className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center border-b border-border/70 px-3 py-2 text-sm last:border-b-0 hover:bg-secondary/60"
            >
              <span className="font-mono text-foreground">
                {target.port}/{target.protocol}
              </span>
              <span className="truncate text-muted-foreground">{target.networkName}</span>
              <span className="font-mono text-muted-foreground">{target.ipAddress}</span>
              <span className="truncate text-muted-foreground">{getPublishedLabel(target)}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => openDraft(target)}
                className="no-drag"
              >
                <Cable className="mr-1.5 h-3.5 w-3.5" />
                {t('docker.portsTab.tunnel', 'Tunnel')}
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 rounded border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">
            {t('docker.portsTab.manualTitle', 'Manual Port')}
          </h4>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_auto]">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('docker.portsTab.targetNetwork', 'Target network')}
            </label>
            <AppSelect
              value={selectedManualNetwork?.name || ''}
              options={networkOptions}
              onChange={setManualNetworkName}
              disabled={networks.length === 0}
              placeholder={t('docker.portsTab.noNetwork', 'No network IP')}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('tunnels.remotePort')}
            </label>
            <input
              type="number"
              min={1}
              max={65535}
              value={manualRemotePort}
              onChange={(event) => setManualRemotePort(event.target.value)}
              placeholder="3000"
              className="h-10 w-full rounded border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('tunnels.localPort')}
            </label>
            <input
              type="number"
              min={1}
              max={65535}
              value={manualLocalPort}
              onChange={(event) => setManualLocalPort(event.target.value)}
              placeholder={manualRemotePort || '3000'}
              className="h-10 w-full rounded border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={openManualDraft}
              disabled={!selectedManualNetwork || !manualRemotePort}
              className="no-drag h-10"
            >
              <Cable className="mr-1.5 h-4 w-4" />
              {t('docker.portsTab.prepareTunnel', 'Prepare')}
            </Button>
          </div>
        </div>
      </div>

      {error && !draft && (
        <div className="mt-3 flex items-center gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/15 text-primary">
                  <Cable className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {t('docker.portsTab.createTunnel', 'Create Tunnel')}
                  </h3>
                  <p className="text-xs text-muted-foreground">{draft.targetLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="no-drag rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {startedTunnel ? (
                <div className="rounded border border-success/30 bg-success/10 p-4 text-sm text-success">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    {t('docker.portsTab.running', 'Tunnel is running')}
                  </div>
                  <div className="mt-2 font-mono">
                    http://127.0.0.1:{startedTunnel.localPort}
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        {t('tunnels.localPort')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={draft.localPort}
                        onChange={(event) => setDraft({ ...draft, localPort: event.target.value })}
                        className="h-10 w-full rounded border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        {t('tunnels.nameOptional')}
                      </label>
                      <input
                        type="text"
                        value={draft.name}
                        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                        className="h-10 w-full rounded border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="rounded border border-border bg-background p-3">
                    <p className="mb-1 text-xs text-muted-foreground">
                      {t('tunnels.thisWillForward')}
                    </p>
                    <p className="flex items-center gap-2 font-mono text-sm text-foreground">
                      <span>localhost:{draft.localPort || '...'}</span>
                      <ArrowRight className="h-4 w-4 text-primary" />
                      <span>
                        {draft.remoteHost}:{draft.remotePort}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <AppCheckbox
                      checked={draft.saveConfig}
                      onCheckedChange={(checked) =>
                        setDraft({
                          ...draft,
                          saveConfig: checked,
                          autoStart: checked ? draft.autoStart : false,
                        })
                      }
                      label={t('tunnels.saveConfig')}
                      description={
                        hostId
                          ? t(
                              'docker.portsTab.saveHint',
                              'Container IPs can change after Docker restarts.'
                            )
                          : t('docker.portsTab.saveDisabled', 'No host context available.')
                      }
                      disabled={!hostId}
                    />
                    {draft.saveConfig && (
                      <AppCheckbox
                        checked={draft.autoStart}
                        onCheckedChange={(checked) => setDraft({ ...draft, autoStart: checked })}
                        label={t('tunnels.autoStart')}
                        className="ml-6"
                      />
                    )}
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      {error}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDraft(null)}
                disabled={isStarting}
                className="no-drag"
              >
                {startedTunnel ? t('common.close', 'Close') : t('common.cancel')}
              </Button>
              {!startedTunnel && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={startDraftTunnel}
                  disabled={isStarting}
                  className="no-drag"
                >
                  {isStarting ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 h-4 w-4" />
                  )}
                  {isStarting ? t('tunnels.starting') : t('tunnels.startTunnel')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
