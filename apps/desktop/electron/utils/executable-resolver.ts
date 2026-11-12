import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const COMMON_MAC_EXECUTABLE_DIRS = [
  path.join(homedir(), '.docker', 'bin'),
  '/Applications/Docker.app/Contents/Resources/bin',
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/opt/homebrew/opt/libpq/bin',
  '/opt/homebrew/opt/postgresql/bin',
  '/opt/homebrew/opt/postgresql@18/bin',
  '/opt/homebrew/opt/postgresql@17/bin',
  '/opt/homebrew/opt/postgresql@16/bin',
  '/opt/homebrew/opt/mysql-client/bin',
  '/opt/homebrew/opt/mongodb-database-tools/bin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/local/opt/libpq/bin',
  '/usr/local/opt/postgresql/bin',
  '/usr/local/opt/postgresql@18/bin',
  '/usr/local/opt/postgresql@17/bin',
  '/usr/local/opt/postgresql@16/bin',
  '/usr/local/opt/mysql-client/bin',
  '/usr/local/opt/mongodb-database-tools/bin',
];

const COMMON_UNIX_EXECUTABLE_DIRS = [
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

function hasPathSeparator(value: string): boolean {
  return (
    value.includes(path.sep) ||
    (process.platform === 'win32' && value.includes(path.win32.sep))
  );
}

function canExecute(filePath: string): boolean {
  try {
    accessSync(filePath, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableNames(name: string): string[] {
  if (process.platform !== 'win32' || path.extname(name)) return [name];

  const pathExt = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
  return pathExt
    .split(';')
    .filter(Boolean)
    .map((extension) => `${name}${extension.toLowerCase()}`);
}

export function getExecutableSearchPaths(envPath = process.env.PATH || ''): string[] {
  const pathEntries = envPath.split(path.delimiter).filter(Boolean);
  const commonEntries =
    process.platform === 'win32'
      ? []
      : process.platform === 'darwin'
        ? [...COMMON_MAC_EXECUTABLE_DIRS, ...COMMON_UNIX_EXECUTABLE_DIRS]
        : COMMON_UNIX_EXECUTABLE_DIRS;

  return Array.from(new Set([...pathEntries, ...commonEntries]));
}

export function getAugmentedPath(envPath = process.env.PATH || ''): string {
  return getExecutableSearchPaths(envPath).join(path.delimiter);
}

export function buildExecutableEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  const pathKey =
    process.platform === 'win32'
      ? Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path'
      : 'PATH';

  env[pathKey] = getAugmentedPath(env[pathKey] || env.PATH || '');
  return env;
}

export function resolveExecutable(name: string, envPath = process.env.PATH || ''): string | null {
  if (hasPathSeparator(name)) {
    return canExecute(name) ? name : null;
  }

  for (const candidatePath of getExecutableSearchPaths(envPath)) {
    for (const executableName of executableNames(name)) {
      const candidate = path.join(candidatePath, executableName);
      if (canExecute(candidate)) return candidate;
    }
  }

  return null;
}
