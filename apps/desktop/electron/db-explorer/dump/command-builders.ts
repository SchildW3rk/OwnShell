import type { DBConnectionConfig, DBType } from '@ownshell/core';
import { shellQuote } from '../../utils/shell-quote';
import { buildExecutableEnv } from '../../utils/executable-resolver';
import type { DumpCommandOptions } from './types';

export function buildDumpCommand(
  config: DBConnectionConfig,
  port: number,
  options: DumpCommandOptions
): string {
  const { type, database, username, password, executionMode, dockerContainer } = config;

  let cmd = '';

  switch (type) {
    case 'postgres': {
      const pgPassword = password ? `PGPASSWORD=${shellQuote(password)} ` : '';
      cmd = `${pgPassword}pg_dump -h 127.0.0.1 -p ${shellQuote(port)} -U ${shellQuote(username || 'postgres')}`;
      if (options.clean !== false) cmd += ' --clean --if-exists';
      if (options.noOwner !== false) cmd += ' --no-owner --no-acl';
      if (options.create) cmd += ' --create';
      if (options.schemaOnly) cmd += ' --schema-only';
      if (options.dataOnly) cmd += ' --data-only';
      if (options.tables?.length) {
        for (const t of options.tables) {
          cmd += ` -t ${shellQuote(t)}`;
        }
      }
      cmd += ` ${shellQuote(database || 'postgres')}`;
      break;
    }

    case 'mysql': {
      const mysqlPassword = password ? `MYSQL_PWD=${shellQuote(password)} ` : '';
      cmd = `${mysqlPassword}mysqldump -h 127.0.0.1 -P ${shellQuote(port)} -u ${shellQuote(username || 'root')}`;
      if (options.clean !== false) cmd += ' --add-drop-table';
      if (options.create) cmd += ' --databases';
      if (options.schemaOnly) cmd += ' --no-data';
      if (options.dataOnly) cmd += ' --no-create-info';
      if (options.tables?.length) {
        cmd += ` ${shellQuote(database || 'mysql')} ${options.tables.map(shellQuote).join(' ')}`;
      } else {
        cmd += ` ${shellQuote(database || 'mysql')}`;
      }
      break;
    }

    case 'mongodb': {
      const uri = buildMongoURI(config, port);
      cmd = `mongodump --uri=${shellQuote(uri)} --archive`;
      if (options.compress) cmd += ' --gzip';
      return cmd;
    }

    case 'redis': {
      cmd = `redis-cli -h 127.0.0.1 -p ${shellQuote(port)}`;
      if (password) cmd += ` -a ${shellQuote(password)}`;
      cmd += ' --rdb /tmp/ownshell-redis-dump.rdb && cat /tmp/ownshell-redis-dump.rdb';
      break;
    }

    default:
      throw new Error(`Unsupported database type for export: ${type}`);
  }

  if (executionMode === 'docker' && dockerContainer) {
    cmd = `docker exec ${shellQuote(dockerContainer)} sh -c ${shellQuote(cmd)}`;
  }

  if (options.compress) {
    cmd += ' | gzip';
  }

  return cmd;
}

export function buildRestoreCommand(
  config: DBConnectionConfig,
  port: number,
  compressed: boolean
): string {
  const { type, database, username, password, executionMode, dockerContainer } = config;

  let dbCmd = '';
  const decompress = compressed && type !== 'mongodb' ? 'gunzip | ' : '';

  switch (type) {
    case 'postgres': {
      const pgPassword = password ? `PGPASSWORD=${shellQuote(password)} ` : '';
      dbCmd = `${pgPassword}psql -h 127.0.0.1 -p ${shellQuote(port)} -U ${shellQuote(username || 'postgres')} -d ${shellQuote(database || 'postgres')} -v ON_ERROR_STOP=0 -q`;
      break;
    }

    case 'mysql': {
      const mysqlPassword = password ? `MYSQL_PWD=${shellQuote(password)} ` : '';
      dbCmd = `${mysqlPassword}mysql -h 127.0.0.1 -P ${shellQuote(port)} -u ${shellQuote(username || 'root')} ${shellQuote(database || 'mysql')}`;
      break;
    }

    case 'mongodb': {
      const uri = buildMongoURI(config, port);
      dbCmd = `mongorestore --uri=${shellQuote(uri)} --archive`;
      if (compressed) dbCmd += ' --gzip';
      break;
    }

    case 'redis': {
      dbCmd = `redis-cli -h 127.0.0.1 -p ${shellQuote(port)}`;
      if (password) dbCmd += ` -a ${shellQuote(password)}`;
      dbCmd += ' --pipe';
      break;
    }

    default:
      throw new Error(`Unsupported database type for import: ${type}`);
  }

  if (executionMode === 'docker' && dockerContainer) {
    dbCmd = `docker exec -i ${shellQuote(dockerContainer)} sh -c ${shellQuote(dbCmd)}`;
  }

  return decompress + dbCmd;
}

export function buildLocalDumpCommand(
  config: DBConnectionConfig,
  options: { compress: boolean; tables?: string[]; schemaOnly?: boolean; dataOnly?: boolean }
): { command: string; args: string[] } {
  const { type, host, port, database, username, password, executionMode, dockerContainer } =
    config;
  const effectiveHost = executionMode === 'docker' ? '127.0.0.1' : host || 'localhost';

  let baseCommand: string;
  let baseArgs: string[];

  switch (type) {
    case 'postgres': {
      baseCommand = 'pg_dump';
      baseArgs = [
        '-h',
        effectiveHost,
        '-p',
        String(port || 5432),
        '-U',
        username || 'postgres',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
      ];
      if (options.schemaOnly) baseArgs.push('--schema-only');
      if (options.dataOnly) baseArgs.push('--data-only');
      if (options.tables?.length) {
        for (const t of options.tables) {
          baseArgs.push('-t', t);
        }
      }
      baseArgs.push(database || 'postgres');
      break;
    }

    case 'mysql': {
      baseCommand = 'mysqldump';
      baseArgs = ['-h', effectiveHost, '-P', String(port || 3306), '-u', username || 'root'];
      if (options.schemaOnly) baseArgs.push('--no-data');
      if (options.dataOnly) baseArgs.push('--no-create-info');
      baseArgs.push(database || 'mysql');
      if (options.tables?.length) {
        baseArgs.push(...options.tables);
      }
      break;
    }

    case 'mongodb': {
      baseCommand = 'mongodump';
      const uri = buildMongoURI({ ...config, host: effectiveHost }, port || 27017);
      baseArgs = ['--uri', uri, '--archive'];
      if (options.compress) baseArgs.push('--gzip');
      break;
    }

    case 'redis': {
      baseCommand = 'redis-cli';
      baseArgs = ['-h', effectiveHost, '-p', String(port || 6379), '--rdb', '-'];
      break;
    }

    default:
      throw new Error(`Unsupported database type for local export: ${type}`);
  }

  if (executionMode === 'docker' && dockerContainer) {
    return wrapWithDockerExec(dockerContainer, type, password, baseCommand, baseArgs);
  }

  return { command: baseCommand, args: baseArgs };
}

export function buildLocalRestoreCommand(config: DBConnectionConfig): {
  command: string;
  args: string[];
} {
  const { type, host, port, database, username, password, executionMode, dockerContainer } =
    config;
  const effectiveHost = executionMode === 'docker' ? '127.0.0.1' : host || 'localhost';

  let baseCommand: string;
  let baseArgs: string[];

  switch (type) {
    case 'postgres':
      baseCommand = 'psql';
      baseArgs = [
        '-h',
        effectiveHost,
        '-p',
        String(port || 5432),
        '-U',
        username || 'postgres',
        '-d',
        database || 'postgres',
        '-v',
        'ON_ERROR_STOP=0',
        '-q',
      ];
      break;

    case 'mysql':
      baseCommand = 'mysql';
      baseArgs = [
        '-h',
        effectiveHost,
        '-P',
        String(port || 3306),
        '-u',
        username || 'root',
        database || 'mysql',
      ];
      break;

    case 'mongodb': {
      baseCommand = 'mongorestore';
      const uri = buildMongoURI({ ...config, host: effectiveHost }, port || 27017);
      baseArgs = ['--uri', uri, '--archive'];
      break;
    }

    case 'redis':
      baseCommand = 'redis-cli';
      baseArgs = ['-h', effectiveHost, '-p', String(port || 6379), '--pipe'];
      break;

    default:
      throw new Error(`Unsupported database type for local import: ${type}`);
  }

  if (executionMode === 'docker' && dockerContainer) {
    return wrapWithDockerExec(dockerContainer, type, password, baseCommand, baseArgs);
  }

  return { command: baseCommand, args: baseArgs };
}

export function wrapWithDockerExec(
  dockerContainer: string,
  dbType: DBType,
  password: string | undefined,
  baseCommand: string,
  baseArgs: string[]
): { command: string; args: string[] } {
  const dockerArgs = ['exec', '-i'];

  if (password) {
    if (dbType === 'postgres') {
      dockerArgs.push('-e', `PGPASSWORD=${password}`);
    } else if (dbType === 'mysql') {
      dockerArgs.push('-e', `MYSQL_PWD=${password}`);
    }
  }

  dockerArgs.push(dockerContainer, baseCommand, ...baseArgs);

  return { command: 'docker', args: dockerArgs };
}

export function buildMongoURI(config: DBConnectionConfig, port: number): string {
  const { host, username, password, database } = config;
  const auth =
    username && password
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
      : '';
  return `mongodb://${auth}${host || '127.0.0.1'}:${port}/${database || 'admin'}`;
}

export function buildEnvVars(config: DBConnectionConfig): NodeJS.ProcessEnv {
  const env = buildExecutableEnv(process.env);

  if (config.password) {
    switch (config.type) {
      case 'postgres':
        env.PGPASSWORD = config.password;
        break;
      case 'mysql':
        env.MYSQL_PWD = config.password;
        break;
    }
  }

  return env;
}

export function redactCommand(command: string): string {
  return command
    .replace(/PGPASSWORD=.*?\s(?=(?:pg_dump|psql)\b)/g, "PGPASSWORD='***' ")
    .replace(/MYSQL_PWD=.*?\s(?=(?:mysql|mysqldump)\b)/g, "MYSQL_PWD='***' ")
    .replace(/(redis-cli[^\n]*?-a )'[^']*'/g, "$1'***'")
    .replace(/(mongodb:\/\/[^:@\s]+):[^@\s]+@/g, '$1:***@');
}
