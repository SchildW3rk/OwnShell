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
  if (config.type === 'redis') {
    const args = ['--tls'];
    if (!verify) args.push('--insecure');
    else if (caPath) args.push('--cacert', caPath);
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
    (config.type === 'postgres' || config.type === 'mysql' || config.type === 'redis')
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
  const script = `ca=$(mktemp) || exit 1; export ca; trap 'rm -f "$ca"' EXIT; printf '%s' ${shellQuote(config.sslCa as string)} > "$ca" || exit 1; ${cmd}`;
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

/** An RDB snapshot can only be restored on the server itself (stop Redis, replace dump.rdb). */
export const REDIS_IMPORT_UNSUPPORTED =
  'Redis import is not supported: restore an RDB snapshot on the server.';

/** redis-cli --tls checks only the CA chain, never the host name, so it cannot honour "verify". */
export const REDIS_VERIFY_UNSUPPORTED =
  "Redis export can't verify the server's host name (redis-cli only checks the CA). Set the connection's SSL mode to \"Require, don't verify\" to export.";

function assertRedisExportTls(config: ToolTarget): void {
  if (config.sslMode === 'require' && config.executionMode !== 'docker') {
    throw new Error(REDIS_VERIFY_UNSUPPORTED);
  }
}

/** Env var the CLI tool reads its password from. */
function secretVar(type: string): string | undefined {
  return (
    { postgres: 'PGPASSWORD', mysql: 'MYSQL_PWD', redis: 'REDISCLI_AUTH' } as Record<string, string>
  )[type];
}

export function dockerSecretFlag(config: Pick<DumpConfig, 'type' | 'password'>): string {
  const name = config.password ? secretVar(config.type) : undefined;
  return name ? ` -e ${name}` : '';
}

/**
 * sshd runs a command as `$SHELL -c "<command>"`, whose argv any user on the server can read
 * (`ps`, /proc). So the password never goes into the command: the outermost shell reads it
 * from the first stdin line (see stdinSecret) and exports it for the tool.
 */
export function withStdinSecret(
  config: Pick<DumpConfig, 'type' | 'password'>,
  cmd: string
): string {
  const name = config.password ? secretVar(config.type) : undefined;
  if (!name) return cmd;
  return `sh -c ${shellQuote(`IFS= read -r ${name} || exit 1; export ${name}; ${cmd}`)}`;
}

/** The stdin prefix withStdinSecret() expects, or undefined when the command needs none. */
export function stdinSecret(config: Pick<DumpConfig, 'type' | 'password'>): string | undefined {
  if (!config.password || !secretVar(config.type)) return undefined;
  if (/[\r\n]/.test(config.password)) {
    throw new Error('Passwords with line breaks are not supported for dump tools.');
  }
  return `${config.password}\n`;
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
  const { type, database, username, executionMode, dockerContainer } = config;
  const host = shellQuote(toolHost(config));
  const tls = shellTls(config);

  let cmd = '';

  switch (type) {
    case 'postgres': {
      cmd = `${tls.env}pg_dump -h ${host} -p ${shellQuote(port)} -U ${shellQuote(username || 'postgres')}`;
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
      cmd = `mysqldump --protocol=TCP${tls.args} -h ${host} -P ${shellQuote(port)} -u ${shellQuote(username || 'root')}`;
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
      assertRedisExportTls(config);
      // Snapshot in a private temp file; the password arrives as REDISCLI_AUTH (withStdinSecret).
      const script = `f=$(mktemp) || exit 1; redis-cli${tls.args} -h ${host} -p ${shellQuote(port)} --rdb "$f" >&2 && cat "$f"; rc=$?; rm -f "$f"; exit $rc`;
      cmd = `sh -c ${shellQuote(script)}`;
      break;
    }

    default:
      throw new Error(`Unsupported database type for export: ${type}`);
  }

  if (executionMode === 'docker' && dockerContainer) {
    cmd = `docker exec${dockerSecretFlag(config)} ${shellQuote(dockerContainer)} sh -c ${shellQuote(cmd)}`;
  }
  cmd = withCaFile(config, cmd);

  if (options.compress) {
    cmd = strictPipe(cmd, 'gzip');
  }

  return withStdinSecret(config, cmd);
}

export function buildRestoreCommand(config: DumpConfig, port: number, compressed: boolean): string {
  const { type, database, username, executionMode, dockerContainer } = config;

  const host = shellQuote(toolHost(config));
  const tls = shellTls(config);
  let dbCmd = '';

  switch (type) {
    case 'postgres': {
      dbCmd = `${tls.env}psql -h ${host} -p ${shellQuote(port)} -U ${shellQuote(username || 'postgres')} -d ${shellQuote(database || 'postgres')} -v ON_ERROR_STOP=0 -q`;
      break;
    }

    case 'mysql': {
      dbCmd = `mysql --protocol=TCP${tls.args} -h ${host} -P ${shellQuote(port)} -u ${shellQuote(username || 'root')} ${shellQuote(database || 'mysql')}`;
      break;
    }

    case 'mongodb': {
      const uri = buildMongoURI(config, port);
      dbCmd = `mongorestore --uri=${shellQuote(uri)} --archive`;
      if (compressed) dbCmd += ' --gzip';
      break;
    }

    case 'redis':
      throw new Error(REDIS_IMPORT_UNSUPPORTED);

    default:
      throw new Error(`Unsupported database type for import: ${type}`);
  }

  if (executionMode === 'docker' && dockerContainer) {
    dbCmd = `docker exec -i${dockerSecretFlag(config)} ${shellQuote(dockerContainer)} sh -c ${shellQuote(dbCmd)}`;
  }

  dbCmd = withCaFile(config, dbCmd);
  return withStdinSecret(
    config,
    compressed && type !== 'mongodb' ? strictPipe('gunzip', dbCmd) : dbCmd
  );
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
      assertRedisExportTls(config);
      baseCommand = 'redis-cli';
      baseArgs = [
        ...cliTls(config, caPath).args,
        '-h',
        effectiveHost,
        '-p',
        String(port || 6379),
        '--rdb',
        '-',
      ];
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
      throw new Error(REDIS_IMPORT_UNSUPPORTED);

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

  // Name only: docker copies the value from our env (buildEnvVars), so it never shows up in `ps`.
  const passwordVar = secretVar(dbType);
  if (password && passwordVar) dockerArgs.push('-e', passwordVar);

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
      case 'redis':
        env.REDISCLI_AUTH = config.password;
        break;
    }
  }

  return env;
}

export function redactCommand(command: string): string {
  return command
    .replace(/PGPASSWORD=.*?\s(?=(?:pg_dump|psql)\b)/g, "PGPASSWORD='***' ")
    .replace(/MYSQL_PWD=.*?\s(?=(?:mysql|mysqldump)\b)/g, "MYSQL_PWD='***' ")
    .replace(/REDISCLI_AUTH=.*?\s(?=redis-cli\b)/g, "REDISCLI_AUTH='***' ")
    .replace(/(mongodb:\/\/[^:@\s]+):[^@\s]+@/g, '$1:***@')
    .replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '<CA>');
}
