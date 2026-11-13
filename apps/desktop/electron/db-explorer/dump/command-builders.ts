import type { DBConnectionConfig, DBType } from '@ownshell/core';
import { shellQuote } from '../../utils/shell-quote';
import { buildExecutableEnv } from '../../utils/executable-resolver';
import type { DbSslMode } from '../connection/ssl-mode';
import type { DumpCommandOptions } from './types';

/** Stored connection plus the decrypted SSL settings, as the app's own driver uses them. */
export type DumpConfig = DBConnectionConfig & { sslMode?: DbSslMode; sslCa?: string };
/** The fields the TLS/host helpers read (also satisfied by the clear-command options). */
type ToolTarget = Pick<DumpConfig, 'type' | 'executionMode' | 'sslMode' | 'sslCa'> & {
  host?: string | null;
};

/** Shell reference to the temp CA file created by withCaFile(). */
const CA_REF = '"$ca"';

/**
 * TLS for psql/pg_dump/mysql/mysqldump, mirroring the app's connection: verify the
 * certificate and host name in 'require', encrypt only in 'require-no-verify'.
 * Off (or Docker mode, where the tool talks to the database over the container's own
 * loopback) keeps the tool defaults.
 */
export function cliTls(
  config: ToolTarget,
  caPath?: string
): { env: Record<string, string>; args: string[] } {
  const mode = config.sslMode;
  if (!mode || mode === 'disabled' || config.executionMode === 'docker')
    return { env: {}, args: [] };
  const verify = mode === 'require';
  if (config.type === 'postgres') {
    const env: Record<string, string> = { PGSSLMODE: verify ? 'verify-full' : 'require' };
    // 'system' = the OS trust store (libpq 16+); older clients fail closed on it.
    if (verify) env.PGSSLROOTCERT = caPath ?? 'system';
    return { env, args: [] };
  }
  if (config.type === 'mysql') {
    // --loose-: MySQL clients apply --ssl-mode, MariaDB clients (the usual mysqldump on
    // Debian/Alpine) apply --ssl/--ssl-verify-server-cert; each ignores the other's flags.
    const args = verify
      ? ['--loose-ssl-mode=VERIFY_IDENTITY', '--loose-ssl', '--loose-ssl-verify-server-cert']
      : ['--loose-ssl-mode=REQUIRED', '--loose-ssl', '--loose-skip-ssl-verify-server-cert'];
    if (verify && caPath) args.push(`--ssl-ca=${caPath}`);
    return { env: {}, args };
  }
  return { env: {}, args: [] };
}

/** Whether cliTls() needs the CA PEM written to a file. */
export function needsCaFile(config: ToolTarget): boolean {
  return (
    Boolean(config.sslCa) &&
    config.sslMode === 'require' &&
    config.executionMode !== 'docker' &&
    (config.type === 'postgres' || config.type === 'mysql')
  );
}

export function shellTls(config: ToolTarget): { env: string; args: string } {
  const tls = cliTls(config, needsCaFile(config) ? CA_REF : undefined);
  const q = (v: string) => (v === CA_REF ? v : shellQuote(v));
  return {
    env: Object.entries(tls.env)
      .map(([k, v]) => `${k}=${q(v)} `)
      .join(''),
    args: tls.args.map((a) => ` ${a.endsWith(CA_REF) ? a : shellQuote(a)}`).join(''),
  };
}

/** Runs `cmd` in a POSIX sh with the CA PEM in a temp file ($ca) that is removed on exit. */
export function withCaFile(config: ToolTarget, cmd: string): string {
  if (!needsCaFile(config)) return cmd;
  const script = `ca=$(mktemp) || exit 1; trap 'rm -f "$ca"' EXIT; printf '%s' ${shellQuote(config.sslCa as string)} > "$ca" || exit 1; ${cmd}`;
  return `sh -c ${shellQuote(script)}`;
}

/**
 * `left | right` in POSIX sh that fails when either side fails: a plain pipe reports only
 * `right`, so a failed dump behind gzip, or a corrupt archive in front of psql, looked like success.
 */
export function strictPipe(left: string, right: string): string {
  const script = `exec 4>&1; s=$( { { ${left}; echo $? >&3; } | { ${right}; } >&4; echo $? >&3; } 3>&1 ); set -- $s; [ $# = 2 ] || exit 1; for c; do [ "$c" = 0 ] || exit "$c"; done`;
  return `sh -c ${shellQuote(script)}`;
}

/** Host the CLI tool connects to: the database host as the SSH server sees it, or the container's loopback. */
export function toolHost(config: ToolTarget): string {
  return config.executionMode === 'docker' ? '127.0.0.1' : config.host || '127.0.0.1';
}

export function buildDumpCommand(
  config: DumpConfig,
  port: number,
  options: DumpCommandOptions
): string {
  const { type, database, username, password, executionMode, dockerContainer } = config;
  const host = shellQuote(toolHost(config));
  const tls = shellTls(config);

  let cmd = '';

  switch (type) {
    case 'postgres': {
      const pgPassword = password ? `PGPASSWORD=${shellQuote(password)} ` : '';
      cmd = `${pgPassword}${tls.env}pg_dump -h ${host} -p ${shellQuote(port)} -U ${shellQuote(username || 'postgres')}`;
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
      cmd = `${mysqlPassword}mysqldump --protocol=TCP${tls.args} -h ${host} -P ${shellQuote(port)} -u ${shellQuote(username || 'root')}`;
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
      cmd = `redis-cli -h ${host} -p ${shellQuote(port)}`;
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
  cmd = withCaFile(config, cmd);

  if (options.compress) {
    cmd = strictPipe(cmd, 'gzip');
  }

  return cmd;
}

export function buildRestoreCommand(config: DumpConfig, port: number, compressed: boolean): string {
  const { type, database, username, password, executionMode, dockerContainer } = config;

  const host = shellQuote(toolHost(config));
  const tls = shellTls(config);
  let dbCmd = '';

  switch (type) {
    case 'postgres': {
      const pgPassword = password ? `PGPASSWORD=${shellQuote(password)} ` : '';
      dbCmd = `${pgPassword}${tls.env}psql -h ${host} -p ${shellQuote(port)} -U ${shellQuote(username || 'postgres')} -d ${shellQuote(database || 'postgres')} -v ON_ERROR_STOP=0 -q`;
      break;
    }

    case 'mysql': {
      const mysqlPassword = password ? `MYSQL_PWD=${shellQuote(password)} ` : '';
      dbCmd = `${mysqlPassword}mysql --protocol=TCP${tls.args} -h ${host} -P ${shellQuote(port)} -u ${shellQuote(username || 'root')} ${shellQuote(database || 'mysql')}`;
      break;
    }

    case 'mongodb': {
      const uri = buildMongoURI(config, port);
      dbCmd = `mongorestore --uri=${shellQuote(uri)} --archive`;
      if (compressed) dbCmd += ' --gzip';
      break;
    }

    case 'redis': {
      dbCmd = `redis-cli -h ${host} -p ${shellQuote(port)}`;
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

  dbCmd = withCaFile(config, dbCmd);
  return compressed && type !== 'mongodb' ? strictPipe('gunzip', dbCmd) : dbCmd;
}

export function buildLocalDumpCommand(
  config: DumpConfig,
  options: { compress: boolean; tables?: string[]; schemaOnly?: boolean; dataOnly?: boolean },
  caPath?: string
): { command: string; args: string[] } {
  const { type, host, port, database, username, password, executionMode, dockerContainer } = config;
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
      baseArgs = [
        '--protocol=TCP',
        ...cliTls(config, caPath).args,
        '-h',
        effectiveHost,
        '-P',
        String(port || 3306),
        '-u',
        username || 'root',
      ];
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

export function buildLocalRestoreCommand(
  config: DumpConfig,
  caPath?: string
): {
  command: string;
  args: string[];
} {
  const { type, host, port, database, username, password, executionMode, dockerContainer } = config;
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
        '--protocol=TCP',
        ...cliTls(config, caPath).args,
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
    username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : '';
  return `mongodb://${auth}${host || '127.0.0.1'}:${port}/${database || 'admin'}`;
}

export function buildEnvVars(config: DumpConfig, caPath?: string): NodeJS.ProcessEnv {
  const env = { ...buildExecutableEnv(process.env), ...cliTls(config, caPath).env };

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
    .replace(/(mongodb:\/\/[^:@\s]+):[^@\s]+@/g, '$1:***@')
    .replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '<CA>');
}
