import type { DBConnectionsTable } from '@ownshell/core';
import type { DbSslMode } from '../../../../electron/db-explorer/connection/ssl-mode';

export type { DbSslMode };

export interface DBConnectionModalProps {
  onClose: () => void;
  onCreated?: (id: string) => void;
  editConnection?: DBConnectionsTable;
  /** SSH session ID for remote file browsing (optional) */
  sshSessionId?: string;
}

export type DBType = 'postgres' | 'mysql' | 'sqlite' | 'redis' | 'mongodb';

export interface HostOption {
  id: string;
  label: string;
  hostname?: string;
}

export interface DBConnectionFormData {
  name: string;
  type: DBType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectionUri: string;
  connectionMode: 'local' | 'ssh';
  sshHostId: string;
  sshTunnelEnabled: boolean;
  sslMode: DbSslMode;
  /** Newly pasted or picked CA PEM; empty = keep the stored one */
  sslCa: string;
  /** Remove the stored CA on save */
  sslCaRemoved: boolean;
  readOnly: boolean;
  authDatabase: string;
  replicaSet: string;
  directConnection: boolean;
  readPreference: string;
  color: string;
  filePath: string;
  isRemote: boolean;
  remoteHostId: string;
  executionMode: 'direct' | 'docker';
  dockerContainer: string;
}
