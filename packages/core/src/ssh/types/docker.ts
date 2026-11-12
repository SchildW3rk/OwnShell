/**
 * Docker container state
 */
export type DockerContainerState =
  | 'running'
  | 'exited'
  | 'paused'
  | 'restarting'
  | 'dead'
  | 'created'
  | 'removing';

/**
 * Docker container information
 * Parsed from: docker ps -a --format '{{json .}}'
 */
export interface DockerContainer {
  /** Container ID (short, 12 chars) */
  id: string;
  /** Container name(s) */
  names: string;
  /** Image name and tag */
  image: string;
  /** Human-readable status (e.g., "Up 2 hours", "Exited (0) 5 days ago") */
  status: string;
  /** Container state */
  state: DockerContainerState;
  /** Port mappings (e.g., "0.0.0.0:80->80/tcp, 443/tcp") */
  ports: string;
  /** Creation time (e.g., "2 days ago") */
  created: string;
  /** Command/entrypoint */
  command: string;
}

/**
 * Docker check result
 */
export interface DockerCheckResult {
  success: boolean;
  installed: boolean;
  version?: string;
  error?: string;
  permissionDenied?: boolean;
}

/**
 * Docker action result
 */
export interface DockerActionResult {
  success: boolean;
  error?: string;
}

/**
 * Docker logs result
 */
export interface DockerLogsResult {
  success: boolean;
  logs?: string;
  error?: string;
}

/**
 * Container Stats - Real-time resource usage
 */
export interface DockerContainerStats {
  /** Container ID */
  containerId: string;
  /** CPU usage percentage (0-100) */
  cpuPercent: number;
  /** Memory usage in bytes */
  memoryUsage: number;
  /** Memory limit in bytes */
  memoryLimit: number;
  /** Memory usage percentage */
  memoryPercent: number;
  /** Network received bytes */
  networkRx: number;
  /** Network transmitted bytes */
  networkTx: number;
  /** Block I/O read bytes */
  blockRead: number;
  /** Block I/O write bytes */
  blockWrite: number;
  /** Number of PIDs */
  pids: number;
  /** Timestamp of this measurement */
  timestamp: number;
}

/**
 * Container Stats Result
 */
export interface DockerStatsResult {
  success: boolean;
  stats?: DockerContainerStats;
  error?: string;
}

/**
 * Docker Image Information
 */
export interface DockerImage {
  /** Image ID (short, 12 chars) */
  id: string;
  /** Repository name */
  repository: string;
  /** Tag */
  tag: string;
  /** Image size in bytes */
  size: number;
  /** Human-readable size */
  sizeHuman: string;
  /** Created timestamp */
  created: string;
  /** Number of containers using this image */
  containers: number;
}

/**
 * Docker Images List Result
 */
export interface DockerImagesResult {
  success: boolean;
  images?: DockerImage[];
  error?: string;
}

/**
 * Docker Image Remove Result
 */
export interface DockerImageRemoveResult {
  success: boolean;
  error?: string;
}

/**
 * Docker Network Information
 */
export interface DockerNetwork {
  /** Network ID (short) */
  id: string;
  /** Network name */
  name: string;
  /** Driver type (bridge, host, overlay, etc.) */
  driver: string;
  /** Scope (local, swarm, global) */
  scope: string;
  /** Is internal network */
  internal: boolean;
  /** IPv6 enabled */
  ipv6: boolean;
  /** IPAM subnet */
  subnet?: string;
  /** IPAM gateway */
  gateway?: string;
  /** Created timestamp */
  created: string;
  /** Number of connected containers */
  containers: number;
}

/**
 * Docker Networks List Result
 */
export interface DockerNetworksResult {
  success: boolean;
  networks?: DockerNetwork[];
  error?: string;
}

/**
 * Extended Docker Container with Compose info
 */
export interface DockerContainerExtended extends DockerContainer {
  /** Compose project name (from label: com.docker.compose.project) */
  composeProject?: string;
  /** Compose service name (from label: com.docker.compose.service) */
  composeService?: string;
  /** All container labels */
  labels?: Record<string, string>;
}

/**
 * Docker Compose Project
 */
export interface DockerComposeProject {
  /** Project name */
  name: string;
  /** Containers in this project */
  containers: DockerContainerExtended[];
  /** Count of running containers */
  runningCount: number;
  /** Total container count */
  totalCount: number;
}

/**
 * Docker Extended List Result (with Compose info)
 */
export interface DockerListExtendedResult {
  success: boolean;
  containers?: DockerContainerExtended[];
  projects?: DockerComposeProject[];
  error?: string;
  permissionDenied?: boolean;
}

/**
 * Docker Prune Images Result
 */
export interface DockerPruneResult {
  success: boolean;
  /** Space reclaimed in bytes */
  spaceReclaimed?: number;
  /** Human-readable space reclaimed */
  spaceReclaimedHuman?: string;
  /** Number of items pruned */
  prunedCount?: number;
  error?: string;
}

/**
 * Docker Exec (Attach Shell) Session
 */
export interface DockerExecSession {
  /** Session ID for this exec session */
  execSessionId: string;
  /** Container ID */
  containerId: string;
  /** Whether session is active */
  active: boolean;
}

/**
 * Docker Exec Result
 */
export interface DockerExecResult {
  success: boolean;
  execSessionId?: string;
  error?: string;
}

/**
 * Compose file path result
 */
export interface DockerComposeFilePathResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Compose file read result
 */
export interface DockerComposeFileReadResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Compose operation result
 */
export interface DockerComposeOperationResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Container network connection info
 */
export interface DockerContainerNetwork {
  name: string;
  ipAddress: string;
  gateway: string;
  macAddress: string;
}

/**
 * Container networks result
 */
export interface DockerContainerNetworksResult {
  success: boolean;
  networks?: DockerContainerNetwork[];
  error?: string;
}

/**
 * Docker container port binding shown by docker inspect
 */
export interface DockerContainerPortBinding {
  hostIp: string;
  hostPort: string;
}

/**
 * A reachable target for local SSH port forwarding into a Docker container
 */
export interface DockerContainerPortTarget {
  portSpec: string;
  port: number;
  protocol: string;
  networkName: string;
  ipAddress: string;
  published: DockerContainerPortBinding[];
  discoveredFrom?: 'docker-inspect' | 'container-listener';
  isListening?: boolean;
  processName?: string;
  pid?: string;
  listenAddress?: string;
}

/**
 * Container ports and container network targets result
 */
export interface DockerContainerPortsResult {
  success: boolean;
  ports?: DockerContainerPortTarget[];
  networks?: DockerContainerNetwork[];
  error?: string;
}

/**
 * Log stream start result
 */
export interface DockerLogStreamResult {
  success: boolean;
  streamId?: string;
  error?: string;
}

/**
 * Host memory result
 */
export interface DockerHostMemoryResult {
  success: boolean;
  totalMemory?: number;
  error?: string;
}
