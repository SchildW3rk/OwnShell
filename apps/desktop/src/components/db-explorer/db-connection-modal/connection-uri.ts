import { DEFAULT_PORTS } from './constants';
import type { DBConnectionFormData, DBType } from './types';

const SUPPORTED_PROTOCOLS: Record<string, DBType> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  mysql: 'mysql',
  redis: 'redis',
  rediss: 'redis',
  mongodb: 'mongodb',
  'mongodb+srv': 'mongodb',
};

const READ_PREFERENCES = new Set([
  'primary',
  'primaryPreferred',
  'secondary',
  'secondaryPreferred',
  'nearest',
]);

interface ParsedConnectionUri {
  type: DBType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectionUri: string;
  sslEnabled?: boolean;
  authDatabase?: string;
  replicaSet?: string;
  directConnection?: boolean;
  readPreference?: string;
  name?: string;
}

function unwrapConnectionUri(value: string): string {
  const trimmed = value.trim();
  const maybeAssignment = trimmed.match(/^[A-Z0-9_]+\s*=\s*(.+)$/i);
  const rawValue = maybeAssignment ? maybeAssignment[1].trim() : trimmed;

  return rawValue.replace(/^['"]|['"]$/g, '');
}

export function sanitizeConnectionUri(value: string): string {
  const unwrapped = unwrapConnectionUri(value);

  try {
    const url = new URL(unwrapped);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return unwrapped;
  }
}

function getBooleanSearchParam(url: URL, key: string): boolean | undefined {
  const value = url.searchParams.get(key);
  if (!value) return undefined;
  if (value === '1' || value.toLowerCase() === 'true') return true;
  if (value === '0' || value.toLowerCase() === 'false') return false;
  return undefined;
}

function getSslEnabled(type: DBType, protocol: string, url: URL): boolean | undefined {
  if (protocol === 'rediss') return true;

  const tls = getBooleanSearchParam(url, 'tls') ?? getBooleanSearchParam(url, 'ssl');
  if (tls !== undefined) return tls;

  if (type === 'postgres') {
    const sslMode = url.searchParams.get('sslmode');
    if (!sslMode || sslMode === 'disable') return undefined;
    return true;
  }

  return undefined;
}

export function parseDatabaseConnectionUri(value: string): ParsedConnectionUri | null {
  const unwrapped = unwrapConnectionUri(value);
  if (!unwrapped.includes('://')) return null;

  let url: URL;
  try {
    url = new URL(unwrapped);
  } catch {
    return null;
  }

  const protocol = url.protocol.replace(':', '');
  const type = SUPPORTED_PROTOCOLS[protocol];
  if (!type || type === 'sqlite') return null;

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const authDatabase =
    url.searchParams.get('authSource') || url.searchParams.get('authDatabase') || undefined;
  const readPreference = url.searchParams.get('readPreference') || undefined;

  return {
    type,
    host: url.hostname,
    port: url.port ? Number(url.port) : DEFAULT_PORTS[type],
    database,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    connectionUri: sanitizeConnectionUri(unwrapped),
    sslEnabled: getSslEnabled(type, protocol, url),
    authDatabase,
    replicaSet: url.searchParams.get('replicaSet') || undefined,
    directConnection: getBooleanSearchParam(url, 'directConnection'),
    readPreference: readPreference && READ_PREFERENCES.has(readPreference) ? readPreference : '',
    name: database || url.hostname || undefined,
  };
}

export function applyParsedConnectionUri(
  formData: DBConnectionFormData,
  parsed: ParsedConnectionUri
): DBConnectionFormData {
  return {
    ...formData,
    name: formData.name || parsed.name || formData.name,
    type: parsed.type,
    host: parsed.host || formData.host,
    port: parsed.port || formData.port,
    database: parsed.database || formData.database,
    username: parsed.username || formData.username,
    password: parsed.password || formData.password,
    sslEnabled: parsed.sslEnabled ?? formData.sslEnabled,
    connectionUri: parsed.connectionUri,
    authDatabase: parsed.authDatabase || '',
    replicaSet: parsed.replicaSet || '',
    directConnection: parsed.directConnection ?? false,
    readPreference: parsed.readPreference || '',
  };
}

export function normalizeFormDataFromConnectionUri(
  formData: DBConnectionFormData
): DBConnectionFormData {
  if (!formData.connectionUri.trim()) return formData;

  const parsed = parseDatabaseConnectionUri(formData.connectionUri);
  return parsed ? applyParsedConnectionUri(formData, parsed) : { ...formData, connectionUri: '' };
}
