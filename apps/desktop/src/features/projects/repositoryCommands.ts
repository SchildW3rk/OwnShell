import type { HostsTable, ProjectsTable } from '@ownshell/core';

function encodeRepositoryPath(path: string): string {
  const absolutePath = path.startsWith('/') ? path : `/${path}`;
  return absolutePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildProjectSshRepositoryUrl(
  host: Pick<HostsTable, 'hostname' | 'port' | 'username'>,
  project: Pick<ProjectsTable, 'repository_path'>
): string {
  const hostname =
    host.hostname.includes(':') && !host.hostname.startsWith('[')
      ? `[${host.hostname}]`
      : host.hostname;
  const port = host.port === 22 ? '' : `:${host.port}`;
  return `ssh://${encodeURIComponent(host.username)}@${hostname}${port}${encodeRepositoryPath(project.repository_path)}`;
}

export function buildProjectGitCommands(
  host: Pick<HostsTable, 'hostname' | 'port' | 'username'>,
  project: Pick<ProjectsTable, 'repository_path'>
): { url: string; clone: string; remote: string } {
  const url = buildProjectSshRepositoryUrl(host, project);
  return {
    url,
    clone: `git clone ${shellQuote(url)}`,
    remote: `git remote add origin ${shellQuote(url)}`,
  };
}
