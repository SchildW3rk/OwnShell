/**
 * Configuration for a port forwarding tunnel
 */
export interface TunnelConfig {
  /** Local port to listen on (e.g., 8080) */
  localPort: number;
  /** Remote host to connect to (e.g., '127.0.0.1' or 'db.internal') */
  remoteHost: string;
  /** Remote port to connect to (e.g., 80, 5432) */
  remotePort: number;
  /** Optional description (e.g., 'Web Server', 'Database') */
  description?: string;
}

/**
 * Runtime state of an active tunnel
 */
export interface TunnelState {
  /** Unique tunnel ID */
  id: string;
  /** SSH session this tunnel belongs to */
  sessionId: string;
  /** Tunnel configuration */
  config: TunnelConfig;
  /** Current status */
  status: 'starting' | 'active' | 'error' | 'stopped';
  /** Error message if status is 'error' */
  error?: string;
  /** Number of currently connected clients */
  connectedClients: number;
  /** Bytes transferred through this tunnel */
  bytesTransferred: {
    sent: number;
    received: number;
  };
  /** When the tunnel was created */
  createdAt: Date;
}

/**
 * Runtime service discovered on the remote SSH host.
 */
export interface DiscoveredTunnelService {
  id: string;
  source: 'host';
  name: string;
  host: string;
  port: number;
  protocol: 'tcp';
  processName?: string;
  pid?: string;
  listenAddress?: string;
}

export interface TunnelServiceDiscoveryResult {
  success: boolean;
  services?: DiscoveredTunnelService[];
  error?: string;
}

/**
 * Saved tunnel configuration (from database)
 */
export interface SavedTunnel {
  id: string;
  hostId: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  name: string;
  autoStart: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Tunnel Error Types
 */
export class TunnelError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'TunnelError';
  }
}
