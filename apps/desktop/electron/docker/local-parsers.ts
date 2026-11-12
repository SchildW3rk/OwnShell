import type {
  DockerComposeProject,
  DockerContainerExtended,
  DockerContainerNetwork,
  DockerContainerState,
  DockerContainerStats,
  DockerImage,
  DockerNetwork,
} from '@ownshell/core';

export function parseDockerMemoryValue(value: string): number {
  const match = value.trim().match(/^([\d.]+)\s*([KMGTP]?i?B)?$/i);
  if (!match) return 0;

  const amount = Number.parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    KIB: 1024,
    MB: 1024 ** 2,
    MIB: 1024 ** 2,
    GB: 1024 ** 3,
    GIB: 1024 ** 3,
    TB: 1024 ** 4,
    TIB: 1024 ** 4,
  };

  return Math.round(amount * (multipliers[unit] || 1));
}

function parseLabels(value: unknown): Record<string, string> {
  if (typeof value !== 'string' || !value) return {};

  const labels: Record<string, string> = {};
  for (const pair of value.split(',')) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    labels[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
  }
  return labels;
}

function parseJsonLines(stdout: string): unknown[] {
  const values: unknown[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      values.push(JSON.parse(line));
    } catch {
      // Docker can print warnings around its JSON output. Ignore only the
      // malformed line and retain every valid record.
    }
  }
  return values;
}

export function parseLocalDockerContainers(stdout: string): {
  containers: DockerContainerExtended[];
  projects: DockerComposeProject[];
} {
  const containers: DockerContainerExtended[] = parseJsonLines(stdout).map((value) => {
    const raw = value as Record<string, unknown>;
    const labels = parseLabels(raw.Labels);
    return {
      id: String(raw.ID || ''),
      names: String(raw.Names || ''),
      image: String(raw.Image || ''),
      status: String(raw.Status || ''),
      state: String(raw.State || 'unknown').toLowerCase() as DockerContainerState,
      ports: String(raw.Ports || ''),
      created: String(raw.CreatedAt || raw.RunningFor || ''),
      command: String(raw.Command || ''),
      composeProject: labels['com.docker.compose.project'],
      composeService: labels['com.docker.compose.service'],
      labels,
    };
  });

  const grouped = new Map<string, DockerContainerExtended[]>();
  for (const container of containers) {
    if (!container.composeProject) continue;
    grouped.set(container.composeProject, [
      ...(grouped.get(container.composeProject) || []),
      container,
    ]);
  }

  const projects = Array.from(grouped, ([name, projectContainers]) => ({
    name,
    containers: projectContainers,
    runningCount: projectContainers.filter((container) => container.state === 'running').length,
    totalCount: projectContainers.length,
  }));

  return { containers, projects };
}

export function parseLocalDockerImages(stdout: string): DockerImage[] {
  return parseJsonLines(stdout).map((value) => {
    const raw = value as Record<string, unknown>;
    const sizeHuman = String(raw.Size || '0B');
    return {
      id: String(raw.ID || ''),
      repository: String(raw.Repository || ''),
      tag: String(raw.Tag || ''),
      size: parseDockerMemoryValue(sizeHuman),
      sizeHuman,
      created: String(raw.CreatedAt || raw.CreatedSince || ''),
      containers: 0,
    };
  });
}

export function parseLocalDockerStats(
  stdout: string,
  containerId: string
): DockerContainerStats | null {
  try {
    const raw = JSON.parse(stdout.trim()) as Record<string, string>;
    const memory = (raw.MemUsage || '0B / 0B').split(' / ');
    const network = (raw.NetIO || '0B / 0B').split(' / ');
    const block = (raw.BlockIO || '0B / 0B').split(' / ');

    return {
      containerId,
      cpuPercent: Number.parseFloat(raw.CPUPerc?.replace('%', '') || '0'),
      memoryUsage: parseDockerMemoryValue(memory[0] || '0B'),
      memoryLimit: parseDockerMemoryValue(memory[1] || '0B'),
      memoryPercent: Number.parseFloat(raw.MemPerc?.replace('%', '') || '0'),
      networkRx: parseDockerMemoryValue(network[0] || '0B'),
      networkTx: parseDockerMemoryValue(network[1] || '0B'),
      blockRead: parseDockerMemoryValue(block[0] || '0B'),
      blockWrite: parseDockerMemoryValue(block[1] || '0B'),
      pids: Number.parseInt(raw.PIDs || '0', 10),
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

export interface LocalDockerNetworkListItem {
  ID?: string;
  Name?: string;
  Driver?: string;
  Scope?: string;
  CreatedAt?: string;
}

export function parseLocalDockerNetworkList(stdout: string): LocalDockerNetworkListItem[] {
  return parseJsonLines(stdout) as LocalDockerNetworkListItem[];
}

export function mergeLocalDockerNetworks(
  listed: LocalDockerNetworkListItem[],
  inspectStdout: string
): DockerNetwork[] {
  let inspections: Array<Record<string, any>> = [];
  try {
    const parsed = JSON.parse(inspectStdout || '[]');
    inspections = Array.isArray(parsed) ? parsed : [];
  } catch {
    inspections = [];
  }

  return listed.map((raw) => {
    const inspect = inspections.find(
      (candidate) =>
        candidate?.Name === raw.Name ||
        (typeof candidate?.Id === 'string' && candidate.Id.startsWith(raw.ID || '---'))
    );
    const ipam = inspect?.IPAM?.Config?.[0];
    return {
      id: raw.ID || '',
      name: raw.Name || '',
      driver: raw.Driver || '',
      scope: raw.Scope || '',
      internal: Boolean(inspect?.Internal),
      ipv6: Boolean(inspect?.EnableIPv6),
      subnet: ipam?.Subnet,
      gateway: ipam?.Gateway,
      created: raw.CreatedAt || inspect?.Created || '',
      containers: Object.keys(inspect?.Containers || {}).length,
    };
  });
}

export function parseLocalDockerContainerNetworks(stdout: string): DockerContainerNetwork[] {
  try {
    const networks = JSON.parse(stdout.trim()) as Record<string, Record<string, unknown>>;
    return Object.entries(networks || {}).map(([name, config]) => ({
      name,
      ipAddress: String(config?.IPAddress || ''),
      gateway: String(config?.Gateway || ''),
      macAddress: String(config?.MacAddress || ''),
    }));
  } catch {
    return [];
  }
}
