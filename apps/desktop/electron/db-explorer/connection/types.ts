import type { DBType } from '@ownshell/core';
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
  sslEnabled?: boolean;
  connectionMode?: 'local' | 'ssh';
  sshHostId?: string;
  sshTunnelEnabled?: boolean;
  executionMode?: 'direct' | 'docker';
  dockerContainer?: string;
}
