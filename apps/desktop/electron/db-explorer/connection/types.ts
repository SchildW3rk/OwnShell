import type { DBType } from '@ownshell/core';
import type { DbSslMode } from './tls-options';
import type { IMongoDBAdapter, IRedisAdapter, ISQLAdapter } from '../adapters';

export type AnyAdapter = ISQLAdapter | IRedisAdapter | IMongoDBAdapter;

export interface ActiveConnection {
  id: string;
  configId: string;
  type: DBType;
  adapter: AnyAdapter;
  tunnelId?: string;
  sshSessionId?: string;
  localPort?: number;
  autoCreatedSshSession?: boolean;
  readOnly?: boolean;
  /** Private temp dir holding a downloaded remote SQLite copy; removed on disconnect */
  tempDir?: string;
  status: 'connecting' | 'connected' | 'error' | 'disconnected';
  error?: string;
  connectedAt?: Date;
}

export interface TestConnectionConfig {
  name?: string;
  type: 'postgres' | 'mysql' | 'redis' | 'mongodb';
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  connectionUri?: string;
  authDatabase?: string;
  replicaSet?: string;
  directConnection?: boolean;
  readPreference?: string;
  sslMode?: DbSslMode;
  /** Decrypted or freshly pasted CA PEM */
  sslCa?: string;
  connectionMode?: 'local' | 'ssh';
  sshHostId?: string;
  sshTunnelEnabled?: boolean;
  executionMode?: 'direct' | 'docker';
  dockerContainer?: string;
}
