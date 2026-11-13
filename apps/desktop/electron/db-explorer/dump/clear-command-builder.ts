import type { DBConnectionConfig } from '@ownshell/core';
import { shellQuote } from '../../utils/shell-quote';
import {
  dockerSecretFlag,
  shellTls,
  toolHost,
  withCaFile,
  withStdinSecret,
  type DumpConfig,
} from './command-builders';

export function buildClearCommand(options: {
  type: DBConnectionConfig['type'];
  database?: string;
  username?: string;
  password?: string;
  executionMode?: 'direct' | 'docker';
  dockerContainer?: string;
  port: number;
  mode: 'truncate' | 'drop';
  host?: string | null;
  sslMode?: DumpConfig['sslMode'];
  sslCa?: string;
}): string | null {
  const { type, database, username, executionMode, dockerContainer, port, mode } = options;
  const config = options;
  const host = shellQuote(toolHost(config));
  const tls = shellTls(config);
  let clearCommand = '';

  switch (type) {
    case 'postgres': {
      const psqlBase = `${tls.env}psql -q -h ${host} -p ${shellQuote(port)} -U ${shellQuote(username || 'postgres')} -d ${shellQuote(database || 'postgres')}`;

      if (mode === 'truncate') {
        const sql =
          "DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$;";
        clearCommand = `${psqlBase} -c ${shellQuote(sql)}`;
      } else {
        const sql =
          "DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.viewname) || ' CASCADE'; END LOOP; FOR r IN (SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S') LOOP EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.relname) || ' CASCADE'; END LOOP; END $$;";
        clearCommand = `${psqlBase} -c ${shellQuote(sql)}`;
      }
      break;
    }

    case 'mysql': {
      const mysqlBase = `mysql --protocol=TCP${tls.args} -h ${host} -P ${shellQuote(port)} -u ${shellQuote(username || 'root')} ${shellQuote(database || 'mysql')}`;
      const databaseSql = (database || 'mysql').replace(/'/g, "''");
      const action = mode === 'truncate' ? 'TRUNCATE TABLE ' : 'DROP TABLE IF EXISTS ';
      const sql = `SET FOREIGN_KEY_CHECKS=0; SELECT CONCAT('${action}', table_name, ';') FROM information_schema.tables WHERE table_schema='${databaseSql}';`;
      clearCommand = `${mysqlBase} -N -e ${shellQuote(sql)} | ${mysqlBase}; ${mysqlBase} -e ${shellQuote('SET FOREIGN_KEY_CHECKS=1;')}`;
      break;
    }

    default:
      return null;
  }

  if (executionMode === 'docker' && dockerContainer) {
    return withStdinSecret(
      config,
      `docker exec${dockerSecretFlag(config)} ${shellQuote(dockerContainer)} sh -c ${shellQuote(clearCommand)}`
    );
  }

  return withStdinSecret(config, withCaFile(config, clearCommand));
}
