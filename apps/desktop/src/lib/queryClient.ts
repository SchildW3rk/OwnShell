/**
 * TanStack Query Client Configuration
 *
 * Configures React Query with sensible defaults for OwnShell:
 * - Aggressive refetching disabled (user-triggered actions preferred)
 * - Stale time: 30 seconds (reasonable for server state)
 * - Error retry: 1 attempt (avoid hammering remote servers)
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus (can be jarring with SSH terminals)
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect
      refetchOnReconnect: false,
      // Data considered stale after 30 seconds
      staleTime: 30 * 1000,
      // Keep data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Only retry once on failure
      retry: 1,
      // Don't retry on 4xx errors (they won't succeed)
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Don't retry mutations by default
      retry: false,
    },
  },
});

/**
 * Query Keys Factory
 *
 * Centralized query key definitions for cache invalidation
 */
export const queryKeys = {
  // Projects
  projects: {
    all: () => ['projects'] as const,
    byId: (id: string) => ['projects', id] as const,
    gitStatus: (id: string) => ['projects', id, 'git-status'] as const,
    gitCodeAll: (id: string) => ['projects', id, 'git-code'] as const,
    gitCodeDirectory: (id: string, path: string) =>
      ['projects', id, 'git-code', 'directory', path] as const,
    gitCodeFile: (id: string, path: string) =>
      ['projects', id, 'git-code', 'file', path] as const,
    gitHistory: (id: string) => ['projects', id, 'git-history'] as const,
    gitCommitDetailsAll: (id: string) => ['projects', id, 'git-commit'] as const,
    gitCommitDetails: (id: string, hash: string) => ['projects', id, 'git-commit', hash] as const,
    gitBranches: (id: string) => ['projects', id, 'git-branches'] as const,
    gitDiffAll: (id: string) => ['projects', id, 'git-diff'] as const,
    gitDiff: (id: string, path: string, scope: 'staged' | 'unstaged') =>
      ['projects', id, 'git-diff', scope, path] as const,
  },

  // Docker
  docker: {
    all: ['docker'] as const,
    session: (sessionId: string) => ['docker', 'session', sessionId] as const,
    containers: (sessionId: string, showAll?: boolean) =>
      ['docker', 'containers', sessionId, showAll ?? false] as const,
    containersExtended: (sessionId: string, showAll?: boolean) =>
      ['docker', 'containers-extended', sessionId, showAll ?? false] as const,
    check: (sessionId: string) => ['docker', 'check', sessionId] as const,
    logs: (sessionId: string, containerId: string, tail: number) =>
      ['docker', 'logs', sessionId, containerId, tail] as const,
    stats: (sessionId: string, containerId: string) =>
      ['docker', 'stats', sessionId, containerId] as const,
    images: (sessionId: string) => ['docker', 'images', sessionId] as const,
    networks: (sessionId: string) => ['docker', 'networks', sessionId] as const,
    containerPorts: (sessionId: string, containerId: string) =>
      ['docker', 'container-ports', sessionId, containerId] as const,
    composeProjects: (sessionId: string) => ['docker', 'compose-projects', sessionId] as const,
  },

  // S3
  s3: {
    all: ['s3'] as const,
    connections: () => ['s3', 'connections'] as const,
    buckets: (connectionId: string) => ['s3', 'buckets', connectionId] as const,
    objects: (connectionId: string, bucket: string, prefix: string) =>
      ['s3', 'objects', connectionId, bucket, prefix] as const,
    cors: (connectionId: string, bucket: string) => ['s3', 'cors', connectionId, bucket] as const,
  },

  // SFTP
  sftp: {
    all: ['sftp'] as const,
    session: (sessionId: string) => ['sftp', 'session', sessionId] as const,
    files: (sessionId: string, path: string) => ['sftp', 'files', sessionId, path] as const,
  },

  // Tunnels
  tunnel: {
    all: ['tunnel'] as const,
    discoveredServices: (sessionId: string) =>
      ['tunnel', 'discovered-services', sessionId] as const,
  },

  // Vault
  vault: {
    all: ['vault'] as const,
    credentials: {
      all: () => ['vault', 'credentials'] as const,
      byId: (id: string) => ['vault', 'credentials', id] as const,
    },
    environments: {
      all: () => ['vault', 'environments'] as const,
      byId: (id: string) => ['vault', 'environments', id] as const,
      byProject: (project: string) => ['vault', 'environments', 'by-project', project] as const,
    },
    projects: {
      all: () => ['vault', 'projects'] as const,
    },
  },

  // Transfer Queue
  transferQueue: {
    all: ['transfer-queue'] as const,
    queue: () => ['transfer-queue'] as const,
    stats: () => ['transfer-stats'] as const,
    history: {
      all: () => ['transfer-history'] as const,
      byLimit: (limit: number) => ['transfer-history', limit] as const,
    },
  },

  // SFTP Standalone
  sftpStandalone: {
    all: ['sftp-standalone'] as const,
    connections: () => ['sftp-connections'] as const,
    files: {
      all: () => ['sftp-standalone-files'] as const,
      byConnection: (connectionId: string) => ['sftp-standalone-files', connectionId] as const,
      byPath: (connectionId: string, path: string) =>
        ['sftp-standalone-files', connectionId, path] as const,
    },
  },

  // API Client
  apiClient: {
    all: ['api'] as const,
    collections: {
      all: () => ['api', 'collections'] as const,
      byId: (id: string) => ['api', 'collections', id] as const,
    },
    requests: {
      all: () => ['api', 'requests'] as const,
      byId: (id: string) => ['api', 'requests', id] as const,
      byCollection: (collectionId: string | null) =>
        ['api', 'requests', 'by-collection', collectionId] as const,
    },
  },

  // Sidebar folders
  sidebarFolders: {
    all: ['sidebar-folders'] as const,
    list: (resourceType: 'hosts' | 's3' | 'databases') =>
      ['sidebar-folders', resourceType] as const,
  },

  // Database Explorer
  dbExplorer: {
    all: ['dbExplorer'] as const,
    connections: () => ['dbExplorer', 'connections'] as const,
    connection: (connectionId: string) => ['dbExplorer', 'connection', connectionId] as const,
    databases: (connectionId: string) => ['dbExplorer', 'databases', connectionId] as const,
    schemas: (connectionId: string) => ['dbExplorer', 'schemas', connectionId] as const,
    tables: (connectionId: string) => ['dbExplorer', 'tables', connectionId] as const,
    schema: (connectionId: string, tableName: string) =>
      ['dbExplorer', 'schema', connectionId, tableName] as const,
    data: (
      connectionId: string,
      tableName: string,
      page: number,
      schema?: string,
      orderBy?: string,
      orderDirection?: 'ASC' | 'DESC',
      where?: string
    ) =>
      [
        'dbExplorer',
        'data',
        connectionId,
        tableName,
        page,
        schema ?? '',
        orderBy ?? '',
        orderDirection ?? '',
        where ?? '',
      ] as const,
    rowCount: (connectionId: string, tableName: string, schema?: string, where?: string) =>
      ['dbExplorer', 'rowCount', connectionId, tableName, schema ?? '', where ?? ''] as const,
    query: (connectionId: string, queryHash: string) =>
      ['dbExplorer', 'query', connectionId, queryHash] as const,
    history: (connectionId: string) => ['dbExplorer', 'history', connectionId] as const,
  },
} as const;
