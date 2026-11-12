import React, { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type {
  DiscoveredTunnelService,
  DockerContainerExtended,
  DockerContainerPortsResult,
  DockerContainerPortTarget,
  TunnelState,
  TunnelServiceDiscoveryResult,
} from '@ownshell/core';
import type { TFunction } from 'i18next';
import { Button, SectionHeader, StatusDot } from '@ownshell/ui';
import {
  ArrowRight,
  CheckCircle2,
  Container,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Server,
  Square,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../../lib/queryClient';
import { useDockerContainersExtended } from '../../hooks/docker';
import { formatName } from '../docker/utils';

export interface DiscoveredTunnelTarget {
  id: string;
  source: 'host' | 'docker';
  title: string;
  subtitle?: string;
  meta?: string;
  badgeLabel: string;
  remoteHost: string;
  remotePort: number;
  localPort: number;
  name: string;
  containerId?: string;
  containerName?: string;
  composeProject?: string;
  composeService?: string;
  image?: string;
  networkName?: string;
  protocol: string;
  portSpec?: string;
  publishedLabel?: string;
  isInternalOnly?: boolean;
  isListening?: boolean;
  discoveredFrom?: DockerContainerPortTarget['discoveredFrom'];
  processName?: string;
  pid?: string;
  listenAddress?: string;
}

interface DiscoveredServicesSectionProps {
  sessionId: string;
  activeTunnels: TunnelState[];
  onStartTarget: (target: DiscoveredTunnelTarget) => Promise<void>;
  onCustomizeTarget: (target: DiscoveredTunnelTarget) => void;
  onStopTunnel: (tunnelId: string) => Promise<void> | void;
}

const MAX_CONTAINERS_TO_INSPECT = 24;
const EPHEMERAL_PORT_MIN = 32768;

const formatPublishedLabel = (target: DockerContainerPortTarget): string => {
  if (target.published.length === 0) {
    return '';
  }

  return target.published
    .map((binding) => `${binding.hostIp || '*'}:${binding.hostPort}`)
    .join(', ');
};

const preferredLocalPort = (remotePort: number): number => {
  if (remotePort === 80) return 8080;
  if (remotePort === 443) return 8443;
  return remotePort;
};

const collectActiveLocalPorts = (activeTunnels: TunnelState[]): Set<number> =>
  new Set(
    activeTunnels
      .filter((tunnel) => tunnel.status === 'active' || tunnel.status === 'starting')
      .map((tunnel) => tunnel.config.localPort)
  );

const reserveLocalPort = (remotePort: number, reservedPorts: Set<number>): number => {
  let candidate = preferredLocalPort(remotePort);
  while (reservedPorts.has(candidate) && candidate < 65535) {
    candidate += 1;
  }

  reservedPorts.add(candidate);
  return candidate;
};

const isUsefulDockerTunnelPort = (port: DockerContainerPortTarget): boolean => {
  if (port.protocol.toLowerCase() !== 'tcp') return false;
  if (port.discoveredFrom !== 'container-listener') return true;
  if (port.published.length > 0) return true;

  return port.port < EPHEMERAL_PORT_MIN;
};

const buildTarget = (
  container: DockerContainerExtended,
  port: DockerContainerPortTarget,
  localPort: number
): DiscoveredTunnelTarget => {
  const containerName = formatName(container.names);
  const composePrefix = container.composeService || container.composeProject;
  const name = composePrefix
    ? `${composePrefix}:${port.port}/${port.protocol}`
    : `${containerName}:${port.port}/${port.protocol}`;
  const processLabel = port.processName
    ? `${port.processName}${port.pid ? ` · PID ${port.pid}` : ''}`
    : undefined;
  const contextLabel = container.composeProject
    ? `${container.composeProject}${container.composeService ? ` / ${container.composeService}` : ''}`
    : container.image;

  return {
    id: `${container.id}:${port.portSpec}:${port.networkName}:${port.ipAddress}`,
    source: 'docker',
    title: containerName,
    subtitle: [contextLabel, processLabel].filter(Boolean).join(' · '),
    meta: `${port.networkName} · ${
      port.published.length === 0 ? 'internal' : formatPublishedLabel(port)
    }`,
    badgeLabel: 'Docker',
    containerId: container.id,
    containerName,
    composeProject: container.composeProject,
    composeService: container.composeService,
    image: container.image,
    remoteHost: port.ipAddress,
    remotePort: port.port,
    localPort,
    name,
    networkName: port.networkName,
    protocol: port.protocol,
    portSpec: port.portSpec,
    publishedLabel: formatPublishedLabel(port),
    isInternalOnly: port.published.length === 0,
    isListening: port.isListening,
    discoveredFrom: port.discoveredFrom,
    processName: port.processName,
    pid: port.pid,
    listenAddress: port.listenAddress,
  };
};

const buildHostTarget = (
  service: DiscoveredTunnelService,
  localPort: number
): DiscoveredTunnelTarget => ({
  id: service.id,
  source: 'host',
  title: service.name,
  subtitle:
    service.processName && service.pid
      ? `${service.processName} · PID ${service.pid}`
      : service.listenAddress,
  meta: service.listenAddress,
  badgeLabel: 'Server',
  remoteHost: service.host,
  remotePort: service.port,
  localPort,
  name: service.name,
  protocol: service.protocol,
  processName: service.processName,
  pid: service.pid,
  listenAddress: service.listenAddress,
});

const getDockerTargetKey = (target: DiscoveredTunnelTarget): string =>
  [
    target.containerId || target.containerName || target.title,
    target.protocol,
    target.networkName || '',
    target.remoteHost,
    target.remotePort,
  ].join(':');

const mergePublishedLabels = (left?: string, right?: string): string => {
  const values = new Set(
    [left, right]
      .filter(Boolean)
      .flatMap((label) => String(label).split(',').map((entry) => entry.trim()).filter(Boolean))
  );

  return Array.from(values).join(', ');
};

const mergeDockerTargets = (targets: DiscoveredTunnelTarget[]): DiscoveredTunnelTarget[] => {
  const mergedByEndpoint = new Map<string, DiscoveredTunnelTarget>();

  for (const target of targets) {
    const key = getDockerTargetKey(target);
    const existing = mergedByEndpoint.get(key);

    if (!existing) {
      mergedByEndpoint.set(key, target);
      continue;
    }

    const publishedLabel = mergePublishedLabels(existing.publishedLabel, target.publishedLabel);
    const isListening = Boolean(existing.isListening || target.isListening);

    mergedByEndpoint.set(key, {
      ...existing,
      subtitle: (existing.subtitle || '').length >= (target.subtitle || '').length
        ? existing.subtitle
        : target.subtitle,
      meta: publishedLabel || existing.meta || target.meta,
      publishedLabel,
      isInternalOnly: !publishedLabel,
      isListening,
      discoveredFrom: isListening ? 'container-listener' : existing.discoveredFrom,
      processName: existing.processName || target.processName,
      pid: existing.pid || target.pid,
      listenAddress: existing.listenAddress || target.listenAddress,
    });
  }

  return Array.from(mergedByEndpoint.values());
};

const getTargetDetail = (
  target: DiscoveredTunnelTarget,
  t: TFunction
): string => {
  if (target.source !== 'docker') {
    return t('tunnels.listeningOn', { address: target.listenAddress || target.meta });
  }

  if (target.isListening) {
    const status = t('tunnels.listeningInContainer');
    if (target.isInternalOnly) {
      return `${target.networkName} · ${status}`;
    }

    return `${target.networkName} · ${status} · ${t('tunnels.publishedAs', {
      value: target.publishedLabel,
    })}`;
  }

  const status = target.isInternalOnly
    ? t('tunnels.declaredInternalPort')
    : t('tunnels.publishedAs', { value: target.publishedLabel });

  return `${target.networkName} · ${status}`;
};

export const DiscoveredServicesSection: React.FC<DiscoveredServicesSectionProps> = ({
  sessionId,
  activeTunnels,
  onStartTarget,
  onCustomizeTarget,
  onStopTunnel,
}) => {
  const { t } = useTranslation();
  const [startingTargetId, setStartingTargetId] = useState<string | null>(null);

  const hostServicesQuery = useQuery({
    queryKey: queryKeys.tunnel.discoveredServices(sessionId),
    queryFn: async (): Promise<TunnelServiceDiscoveryResult> =>
      window.electronAPI.tunnel.discoverServices(sessionId),
    enabled: Boolean(sessionId),
    staleTime: 15 * 1000,
  });

  const containersQuery = useDockerContainersExtended(sessionId, {
    showAll: false,
  });

  const runningContainers = useMemo(
    () =>
      (containersQuery.data?.containers || [])
        .filter((container) => container.state === 'running')
        .slice(0, MAX_CONTAINERS_TO_INSPECT),
    [containersQuery.data?.containers]
  );

  const portQueries = useQueries({
    queries: runningContainers.map((container) => ({
      queryKey: queryKeys.docker.containerPorts(sessionId, container.id),
      queryFn: async (): Promise<DockerContainerPortsResult> => {
        const result = await window.electronAPI.docker.containerPorts(sessionId, container.id);
        return result;
      },
      enabled: Boolean(sessionId),
      staleTime: 10 * 1000,
    })),
  });

  const activeLocalPorts = useMemo(() => collectActiveLocalPorts(activeTunnels), [activeTunnels]);

  const hostTargets = useMemo(
    () => {
      const reservedLocalPorts = new Set(activeLocalPorts);
      return (hostServicesQuery.data?.success ? hostServicesQuery.data.services || [] : []).map(
        (service) => buildHostTarget(service, reserveLocalPort(service.port, reservedLocalPorts))
      );
    },
    [activeLocalPorts, hostServicesQuery.data]
  );

  const dockerTargets = useMemo(
    () => {
      const reservedLocalPorts = new Set(activeLocalPorts);
      hostTargets.forEach((target) => reservedLocalPorts.add(target.localPort));

      const rawTargets = runningContainers.flatMap((container, index) => {
        const query = portQueries[index];
        const ports = query?.data?.success ? query.data.ports || [] : [];
        return ports
          .filter(isUsefulDockerTunnelPort)
          .map((port) => buildTarget(container, port, 0));
      });

      return mergeDockerTargets(rawTargets).map((target) => ({
        ...target,
        localPort: reserveLocalPort(target.remotePort, reservedLocalPorts),
      }));
    },
    [activeLocalPorts, hostTargets, portQueries, runningContainers]
  );

  const isLoading =
    hostServicesQuery.isFetching ||
    containersQuery.isFetching ||
    portQueries.some((query) => query.isFetching);
  const error =
    hostServicesQuery.data?.error ||
    containersQuery.data?.error ||
    portQueries.find((query) => query.data?.error)?.data?.error;

  const getActiveTunnel = (target: DiscoveredTunnelTarget): TunnelState | undefined =>
    activeTunnels.find(
      (tunnel) =>
        (tunnel.status === 'active' || tunnel.status === 'starting') &&
        tunnel.config.remoteHost === target.remoteHost &&
        tunnel.config.remotePort === target.remotePort
    );

  const handleStart = async (target: DiscoveredTunnelTarget) => {
    setStartingTargetId(target.id);
    try {
      await onStartTarget(target);
    } finally {
      setStartingTargetId(null);
    }
  };

  const handleRefresh = () => {
    void hostServicesQuery.refetch();
    void containersQuery.refetch();
    portQueries.forEach((query) => {
      void query.refetch();
    });
  };

  const renderTargetRows = (targets: DiscoveredTunnelTarget[]) => (
    <div className="divide-y divide-border/70">
      {targets.map((target) => {
        const activeTunnel = getActiveTunnel(target);
        const isStarting = startingTargetId === target.id;
        const statusDotVariant = activeTunnel ? 'success' : 'muted';

        return (
          <div
            key={target.id}
            className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-secondary/50"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusDot variant={statusDotVariant} />
                <span className="truncate text-sm font-medium text-foreground">
                  {target.title}
                </span>
                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {target.badgeLabel}
                </span>
                {activeTunnel && (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t('tunnels.running')}
                  </span>
                )}
              </div>
              {target.subtitle && (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {target.subtitle}
                </p>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono text-xs text-foreground">
                <span>localhost:{target.localPort}</span>
                <ArrowRight className="h-3.5 w-3.5 text-primary" />
                <span
                  className="flex min-w-0 items-baseline"
                  title={`${target.remoteHost}:${target.remotePort}`}
                >
                  <span className="truncate">{target.remoteHost}</span>
                  <span className="shrink-0">:{target.remotePort}</span>
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {getTargetDetail(target, t)}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              {activeTunnel ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onStopTunnel(activeTunnel.id)}
                  className="no-drag text-destructive"
                  title={t('tunnels.stop')}
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onCustomizeTarget(target)}
                    className="no-drag"
                    disabled={isStarting}
                    title={t('tunnels.customize')}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleStart(target)}
                    className="no-drag"
                    disabled={isStarting}
                  >
                    {isStarting ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-1.5 h-4 w-4" />
                    )}
                    {t('tunnels.startTunnel')}
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderServiceGroup = (
    title: string,
    description: string,
    icon: React.ReactNode,
    targets: DiscoveredTunnelTarget[],
    emptyTitle: string,
    emptyHint: string
  ) => (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>

      {targets.length === 0 ? (
        <div className="px-4 py-7 text-center text-sm text-muted-foreground">
          <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-muted-foreground">
            {icon}
          </div>
          <p>{isLoading ? t('tunnels.discoveringServices') : emptyTitle}</p>
          <p className="mt-1 text-xs">{emptyHint}</p>
        </div>
      ) : (
        renderTargetRows(targets)
      )}
    </div>
  );

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <SectionHeader className="mb-0 flex items-center gap-2">
          <Container className="h-3.5 w-3.5" />
          {t('tunnels.discoveredServices')}
        </SectionHeader>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="no-drag text-muted-foreground"
          title={t('common.refresh')}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="space-y-3">
        {error && (
          <div className="rounded-lg border border-warning/25 bg-warning/10 px-4 py-2 text-xs text-warning">
            {error}
          </div>
        )}

        {renderServiceGroup(
          t('tunnels.hostServices'),
          t('tunnels.hostServicesHint'),
          <Server className="h-4 w-4" />,
          hostTargets,
          t('tunnels.noHostServices'),
          t('tunnels.noHostServicesHint')
        )}

        {renderServiceGroup(
          t('tunnels.dockerServices'),
          t('tunnels.discoveredServicesHint'),
          <Container className="h-4 w-4" />,
          dockerTargets,
          t('tunnels.noDiscoveredServices'),
          t('tunnels.noDiscoveredServicesHint')
        )}
      </div>
    </section>
  );
};
