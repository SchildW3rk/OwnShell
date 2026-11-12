import type { DBType } from '@ownshell/core';
import { resolveExecutable } from '../../utils/executable-resolver';

interface ToolConfig {
  dump: string;
  restore: string;
  installHint: {
    darwin: string;
    linux: string;
    win32: string;
  };
}

const DB_TOOLS: Record<string, ToolConfig> = {
  postgres: {
    dump: 'pg_dump',
    restore: 'psql',
    installHint: {
      darwin: 'brew install libpq && brew link --force libpq',
      linux: 'sudo apt install postgresql-client',
      win32: 'Download from https://postgresql.org/download/windows',
    },
  },
  mysql: {
    dump: 'mysqldump',
    restore: 'mysql',
    installHint: {
      darwin: 'brew install mysql-client && brew link --force mysql-client',
      linux: 'sudo apt install mysql-client',
      win32: 'Download from https://dev.mysql.com/downloads',
    },
  },
  mongodb: {
    dump: 'mongodump',
    restore: 'mongorestore',
    installHint: {
      darwin: 'brew install mongodb-database-tools',
      linux: 'sudo apt install mongodb-database-tools',
      win32: 'Download from https://mongodb.com/try/download/database-tools',
    },
  },
  redis: {
    dump: 'redis-cli',
    restore: 'redis-cli',
    installHint: {
      darwin: 'brew install redis',
      linux: 'sudo apt install redis-tools',
      win32: 'Install a Redis CLI package for Windows and ensure redis-cli is on PATH',
    },
  },
};

export async function findTool(toolName: string): Promise<string | null> {
  return resolveExecutable(toolName);
}

export async function checkLocalTools(
  dbType: DBType,
  executionMode?: 'direct' | 'docker'
): Promise<{
  available: boolean;
  dumpTool?: string;
  restoreTool?: string;
  installHint?: string;
}> {
  if (dbType === 'sqlite') {
    return { available: true };
  }

  if (executionMode === 'docker') {
    const dockerPath = await findTool('docker');
    if (!dockerPath) {
      return {
        available: false,
        installHint: 'Docker is not installed. Please install Docker Desktop.',
      };
    }
    return {
      available: true,
      dumpTool: 'docker',
      restoreTool: 'docker',
    };
  }

  const tools = DB_TOOLS[dbType];
  if (!tools) {
    return { available: false, installHint: `Unsupported database type: ${dbType}` };
  }

  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  const dumpPath = await findTool(tools.dump);
  const restorePath = await findTool(tools.restore);

  if (!dumpPath || !restorePath) {
    return {
      available: false,
      installHint: tools.installHint[platform] || tools.installHint.linux,
    };
  }

  return {
    available: true,
    dumpTool: dumpPath,
    restoreTool: restorePath,
  };
}
