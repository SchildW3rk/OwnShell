/**
 * SSH Tunnel Manager
 *
 * Manages local port forwarding tunnels through SSH connections.
 * Implements the -L flag functionality (local port forwarding).
 *
 * Flow:
 * 1. Create local TCP server on specified port
 * 2. On incoming connection, use ssh2's forwardOut to tunnel to remote
 * 3. Pipe data bidirectionally between local socket and SSH channel
 */

import * as net from 'net';
import { Client } from 'ssh2';
import { TunnelConfig, TunnelState, TunnelError } from '@ownshell/core';
import { logger } from '../logger';
import { v4 as uuidv4 } from 'uuid';
import { BrowserWindow } from 'electron';

/**
 * Internal representation of an active tunnel
 */
interface ActiveTunnel {
  id: string;
  sessionId: string;
  config: TunnelConfig;
  server: net.Server;
  sshClient: Client;
  connections: Set<net.Socket>;
  bytesSent: number;
  bytesReceived: number;
  createdAt: Date;
  status: 'starting' | 'active' | 'error' | 'stopped';
  error?: string;
}

/**
 * TunnelManager - Singleton for managing SSH tunnels
 */
export class TunnelManager {
  private tunnels: Map<string, ActiveTunnel> = new Map();
  private mainWindow: BrowserWindow | null = null;

  /**
   * Set the main window for IPC events
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * Start a new local port forwarding tunnel
   *
   * @param sshClient - The connected ssh2 Client
   * @param sessionId - The SSH session ID this tunnel belongs to
   * @param config - Tunnel configuration (localPort, remoteHost, remotePort)
   * @returns The tunnel ID
   */
  async startTunnel(sshClient: Client, sessionId: string, config: TunnelConfig): Promise<string> {
    const tunnelId = uuidv4();

    logger.info('Starting tunnel', {
      tunnelId,
      sessionId,
      localPort: config.localPort,
      remoteHost: config.remoteHost,
      remotePort: config.remotePort,
    });

    // Check if port is already in use
    const portInUse = await this.isPortInUse(config.localPort);
    if (portInUse) {
      const error = new TunnelError(`Port ${config.localPort} is already in use`, 'PORT_IN_USE');
      logger.error('Port in use', { port: config.localPort });
      throw error;
    }

    // Check if we already have a tunnel on this port
    for (const tunnel of this.tunnels.values()) {
      if (tunnel.config.localPort === config.localPort && tunnel.status === 'active') {
        const error = new TunnelError(
          `Tunnel already exists on port ${config.localPort}`,
          'TUNNEL_EXISTS'
        );
        throw error;
      }
    }

    return new Promise((resolve, reject) => {
      const connections = new Set<net.Socket>();
      let bytesSent = 0;
      let bytesReceived = 0;

      // Create local TCP server
      const server = net.createServer((localSocket) => {
        logger.debug('New connection to tunnel', {
          tunnelId,
          localPort: config.localPort,
          remoteAddress: localSocket.remoteAddress,
        });

        connections.add(localSocket);
        this.updateTunnelClients(tunnelId, connections.size);

        // Forward through SSH tunnel
        sshClient.forwardOut(
          '127.0.0.1',
          config.localPort,
          config.remoteHost,
          config.remotePort,
          (err, channel) => {
            if (err) {
              logger.error('forwardOut failed', {
                tunnelId,
                error: err.message,
                remoteHost: config.remoteHost,
                remotePort: config.remotePort,
              });
              localSocket.destroy();
              connections.delete(localSocket);
              this.updateTunnelClients(tunnelId, connections.size);
              return;
            }

            // Track bytes transferred
            localSocket.on('data', (data) => {
              bytesSent += data.length;
              const tunnel = this.tunnels.get(tunnelId);
              if (tunnel) {
                tunnel.bytesSent = bytesSent;
              }
            });

            channel.on('data', (data: Buffer) => {
              bytesReceived += data.length;
              const tunnel = this.tunnels.get(tunnelId);
              if (tunnel) {
                tunnel.bytesReceived = bytesReceived;
              }
            });

            // Pipe data bidirectionally
            localSocket.pipe(channel);
            channel.pipe(localSocket);

            // Handle errors
            localSocket.on('error', (socketErr) => {
              logger.debug('Local socket error', {
                tunnelId,
                error: socketErr.message,
              });
              channel.close();
            });

            channel.on('error', (channelErr: Error) => {
              logger.debug('SSH channel error', {
                tunnelId,
                error: channelErr.message,
              });
              localSocket.destroy();
            });

            // Cleanup on close
            const cleanup = () => {
              connections.delete(localSocket);
              this.updateTunnelClients(tunnelId, connections.size);
              localSocket.destroy();
              channel.close();
            };

            localSocket.on('close', cleanup);
            channel.on('close', cleanup);
          }
        );
      });

      // Handle server errors
      server.on('error', (err) => {
        logger.error('Tunnel server error', {
          tunnelId,
          error: err.message,
        });

        const tunnel = this.tunnels.get(tunnelId);
        if (tunnel) {
          tunnel.status = 'error';
          tunnel.error = err.message;
        }

        this.emitTunnelStatus(tunnelId);
        reject(new TunnelError(err.message, 'SERVER_ERROR'));
      });

      // Handle server close
      server.on('close', () => {
        logger.info('Tunnel server closed', { tunnelId });
        const tunnel = this.tunnels.get(tunnelId);
        if (tunnel && tunnel.status !== 'stopped') {
          tunnel.status = 'stopped';
          this.emitTunnelStatus(tunnelId);
        }
      });

      // Start listening
      server.listen(config.localPort, '127.0.0.1', () => {
        const tunnel: ActiveTunnel = {
          id: tunnelId,
          sessionId,
          config,
          server,
          sshClient,
          connections,
          bytesSent: 0,
          bytesReceived: 0,
          createdAt: new Date(),
          status: 'active',
        };

        this.tunnels.set(tunnelId, tunnel);

        logger.info('Tunnel started successfully', {
          tunnelId,
          localPort: config.localPort,
          remoteHost: config.remoteHost,
          remotePort: config.remotePort,
        });

        this.emitTunnelStatus(tunnelId);
        resolve(tunnelId);
      });
    });
  }

  /**
   * Stop a tunnel by ID
   */
  async stopTunnel(tunnelId: string): Promise<void> {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) {
      logger.warn('Attempted to stop non-existent tunnel', { tunnelId });
      return;
    }

    logger.info('Stopping tunnel', {
      tunnelId,
      localPort: tunnel.config.localPort,
    });

    // Close all active connections
    for (const socket of tunnel.connections) {
      socket.destroy();
    }
    tunnel.connections.clear();

    // Close the server
    tunnel.server.close();

    // Update status
    tunnel.status = 'stopped';
    this.emitTunnelStatus(tunnelId);

    // Remove from map
    this.tunnels.delete(tunnelId);

    logger.info('Tunnel stopped', { tunnelId });
  }

  /**
   * Stop all tunnels for a specific SSH session
   * Called when SSH session disconnects
   */
  stopAllForSession(sessionId: string): void {
    logger.info('Stopping all tunnels for session', { sessionId });

    const tunnelIds: string[] = [];
    for (const [tunnelId, tunnel] of this.tunnels) {
      if (tunnel.sessionId === sessionId) {
        tunnelIds.push(tunnelId);
      }
    }

    for (const tunnelId of tunnelIds) {
      this.stopTunnel(tunnelId);
    }

    logger.info('Stopped tunnels for session', {
      sessionId,
      count: tunnelIds.length,
    });
  }

  /**
   * Get all tunnels for a specific SSH session
   */
  getTunnelsBySession(sessionId: string): TunnelState[] {
    const result: TunnelState[] = [];

    for (const tunnel of this.tunnels.values()) {
      if (tunnel.sessionId === sessionId) {
        result.push(this.toTunnelState(tunnel));
      }
    }

    return result;
  }

  /**
   * Get a specific tunnel by ID
   */
  getTunnel(tunnelId: string): TunnelState | null {
    const tunnel = this.tunnels.get(tunnelId);
    return tunnel ? this.toTunnelState(tunnel) : null;
  }

  /**
   * Get all active tunnels
   */
  getAllTunnels(): TunnelState[] {
    return Array.from(this.tunnels.values()).map((t) => this.toTunnelState(t));
  }

  /**
   * Check if a port is in use
   */
  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(false);
      });

      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Convert internal tunnel to TunnelState
   */
  private toTunnelState(tunnel: ActiveTunnel): TunnelState {
    return {
      id: tunnel.id,
      sessionId: tunnel.sessionId,
      config: tunnel.config,
      status: tunnel.status,
      error: tunnel.error,
      connectedClients: tunnel.connections.size,
      bytesTransferred: {
        sent: tunnel.bytesSent,
        received: tunnel.bytesReceived,
      },
      createdAt: tunnel.createdAt,
    };
  }

  /**
   * Update connected client count and emit status
   */
  private updateTunnelClients(tunnelId: string, _count: number): void {
    const tunnel = this.tunnels.get(tunnelId);
    if (tunnel) {
      // Emit status update with new client count
      this.emitTunnelStatus(tunnelId);
    }
  }

  /**
   * Emit tunnel status to renderer
   */
  private emitTunnelStatus(tunnelId: string): void {
    if (!this.mainWindow) return;

    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return;

    const state = this.toTunnelState(tunnel);
    this.mainWindow.webContents.send('ssh:tunnel:status', state);
  }
}

// Singleton instance
export const tunnelManager = new TunnelManager();
