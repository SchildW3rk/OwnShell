import * as fs from 'fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { quoteDoubleIdentifier } from '../sql-identifiers';
import type { ProgressCallback } from './types';

/** The parts of better-sqlite3 (and node:sqlite in tests) the dump needs. */
export interface SqliteHandle {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    iterate(...params: unknown[]): Iterable<unknown>;
    safeIntegers?(on?: boolean): unknown;
    setReadBigInts?(on: boolean): unknown;
    raw?(on?: boolean): unknown;
  };
}

export interface SqliteDumpOptions {
  tables?: string[];
  schemaOnly?: boolean;
  dataOnly?: boolean;
}

export function sqliteLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return String(value);
    // SQLite stores NaN as NULL; 9e999 is how sqlite3 .dump writes infinity.
    return Number.isNaN(value) ? 'NULL' : value > 0 ? '9e999' : '-9e999';
  }
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`;
  const text = String(value);
  // A raw NUL would end the literal early on re-import.
  if (text.includes('\0')) return `CAST(X'${Buffer.from(text, 'utf8').toString('hex')}' AS TEXT)`;
  return `'${text.replace(/'/g, "''")}'`;
}

/** SQL dump lines in the shape of `sqlite3 .dump`; streamed so large tables never sit in memory. */
export function* sqliteDumpLines(
  db: SqliteHandle,
  options: SqliteDumpOptions = {}
): Generator<string> {
  const wanted = options.tables?.length ? new Set(options.tables) : null;
  const tables = (
    db
      .prepare(
        "SELECT t.name, t.type, m.sql FROM pragma_table_list t JOIN sqlite_master m ON m.name = t.name " +
          "WHERE t.schema = 'main' AND t.type IN ('table', 'virtual') AND t.name NOT LIKE 'sqlite_%' ORDER BY m.rowid"
      )
      .all() as Array<{ name: string; type: string; sql: string }>
  ).filter((table) => !wanted || wanted.has(table.name));

  yield 'PRAGMA foreign_keys=OFF;\n';
  yield 'BEGIN TRANSACTION;\n';

  for (const table of tables) {
    if (!options.dataOnly) yield `${table.sql};\n`;
    if (options.schemaOnly) continue;

    // Generated and hidden columns cannot be inserted.
    const columns = (
      db.prepare('SELECT name, hidden FROM pragma_table_xinfo(?)').all(table.name) as Array<{
        name: string;
        hidden: number;
      }>
    )
      .filter((column) => column.hidden === 0)
      .map((column) => quoteDoubleIdentifier(column.name));
    if (columns.length === 0) continue;

    const target = `${quoteDoubleIdentifier(table.name)}(${columns.join(',')})`;
    const statement = db.prepare(`SELECT ${columns.join(',')} FROM ${quoteDoubleIdentifier(table.name)}`);
    // Keep 64-bit integers exact.
    statement.safeIntegers?.(true);
    statement.setReadBigInts?.(true);
    statement.raw?.(true);
    for (const row of statement.iterate()) {
      const values = Array.isArray(row) ? row : Object.values(row as Record<string, unknown>);
      yield `INSERT INTO ${target} VALUES(${values.map(sqliteLiteral).join(',')});\n`;
    }
  }

  // AUTOINCREMENT high-water marks, so deleted ids are not handed out again.
  const hasSequence = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    .all().length;
  if (!options.schemaOnly && hasSequence) {
    const exported = new Set(tables.map((table) => table.name));
    const sequences = db.prepare('SELECT name, seq FROM sqlite_sequence').all() as Array<{
      name: string;
      seq: unknown;
    }>;
    for (const { name, seq } of sequences) {
      if (!exported.has(name)) continue;
      yield `DELETE FROM sqlite_sequence WHERE name = ${sqliteLiteral(name)};\n`;
      yield `INSERT INTO sqlite_sequence(name, seq) VALUES(${sqliteLiteral(name)}, ${sqliteLiteral(seq)});\n`;
    }
  }

  if (!options.dataOnly) {
    const objects = db
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('index', 'trigger', 'view') " +
          "AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'view' THEN 0 ELSE 1 END, rowid"
      )
      .all() as Array<{ type: string; name: string; tbl_name: string; sql: string }>;
    for (const object of objects) {
      const key = object.type === 'view' ? object.name : object.tbl_name;
      if (!wanted || wanted.has(key)) yield `${object.sql};\n`;
    }
  }

  yield 'COMMIT;\n';
}

export interface SqlStatement {
  text: string;
  /** Leading bare keywords, upper-cased (at most four). */
  words: string[];
}

/**
 * Splits SQL into statements at top-level `;`, skipping quoted strings/identifiers and
 * comments. Inside CREATE TRIGGER a `;` only ends the statement after `END`, the same
 * rule as sqlite3_complete().
 */
export function splitSqliteStatements(sql: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let start = 0;
  let words: string[] = [];
  let lastWord = '';
  let hasToken = false;
  const isWordChar = (c: string) => /[A-Za-z0-9_$]/.test(c) || c > '\x7f';
  const inTrigger = () =>
    words[0] === 'CREATE' &&
    (words[1] === 'TRIGGER' || ((words[1] === 'TEMP' || words[1] === 'TEMPORARY') && words[2] === 'TRIGGER'));

  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      for (;;) {
        const end = sql.indexOf(close, j);
        if (end === -1) {
          j = sql.length;
          break;
        }
        // A doubled quote is an escaped quote ([...] has no escape).
        if (close !== ']' && sql[end + 1] === close) j = end + 2;
        else {
          j = end + 1;
          break;
        }
      }
      i = j;
      hasToken = true;
      lastWord = '';
    } else if (c === ';') {
      if (inTrigger() && lastWord !== 'END') {
        i++;
        lastWord = '';
        continue;
      }
      if (hasToken) statements.push({ text: sql.slice(start, i + 1).trim(), words });
      i++;
      start = i;
      words = [];
      lastWord = '';
      hasToken = false;
    } else if (isWordChar(c)) {
      let j = i + 1;
      while (j < sql.length && isWordChar(sql[j])) j++;
      lastWord = sql.slice(i, j).toUpperCase();
      if (words.length < 4) words.push(lastWord);
      hasToken = true;
      i = j;
    } else {
      if (!/\s/.test(c)) {
        hasToken = true;
        lastWord = '';
      }
      i++;
    }
  }
  if (hasToken) statements.push({ text: sql.slice(start).trim(), words });
  return statements;
}

// Statements that would end our transaction or reach beyond this database.
const FORBIDDEN_STATEMENTS = new Set([
  'BEGIN',
  'COMMIT',
  'END',
  'ROLLBACK',
  'SAVEPOINT',
  'RELEASE',
  'ATTACH',
  'DETACH',
  'VACUUM',
  'PRAGMA',
]);

const DUMP_BEGIN = /^BEGIN(\s+(DEFERRED|IMMEDIATE|EXCLUSIVE))?(\s+TRANSACTION)?\s*;?$/i;
const DUMP_COMMIT = /^(COMMIT|END)(\s+TRANSACTION)?\s*;?$/i;

/**
 * Validates every statement of a dump, then runs it in one transaction after optionally
 * clearing existing tables, so a failing or rejected import leaves the database untouched.
 * Only the wrapper our dump and `sqlite3 .dump` write (`PRAGMA foreign_keys=OFF`,
 * a leading BEGIN TRANSACTION and trailing COMMIT) is accepted and stripped.
 */
export function applySqliteScript(
  db: SqliteHandle,
  script: string,
  clearMode: 'none' | 'truncate' | 'drop' = 'none'
): void {
  const statements = splitSqliteStatements(script);
  // Applied below anyway.
  if (/^PRAGMA\s+foreign_keys\s*=\s*(OFF|0|FALSE)\s*;?$/i.test(statements[0]?.text ?? '')) statements.shift();
  if (DUMP_BEGIN.test(statements[0]?.text ?? '') && DUMP_COMMIT.test(statements.at(-1)?.text ?? '')) {
    statements.shift();
    statements.pop();
  }
  const forbidden = statements.find((statement) => FORBIDDEN_STATEMENTS.has(statement.words[0]));
  if (forbidden) {
    throw new SqlImportError(
      `Import rejected: ${forbidden.words[0]} statements are not allowed in a SQL import`,
      'db.importStatementRejected',
      { statement: forbidden.words[0] }
    );
  }

  db.exec('PRAGMA foreign_keys=OFF;');
  db.exec('BEGIN IMMEDIATE;');
  try {
    if (clearMode !== 'none') {
      const objects = db
        .prepare(
          "SELECT m.type, m.name FROM sqlite_master m LEFT JOIN pragma_table_list t ON t.name = m.name AND t.schema = 'main' " +
            "WHERE m.type IN ('table', 'view', 'trigger') AND m.name NOT LIKE 'sqlite_%' AND COALESCE(t.type, '') != 'shadow'"
        )
        .all() as Array<{ type: string; name: string }>;
      for (const object of objects) {
        const name = quoteDoubleIdentifier(object.name);
        if (clearMode === 'drop') {
          db.exec(`DROP ${object.type.toUpperCase()} IF EXISTS ${name};`);
        } else if (object.type === 'table') {
          db.exec(`DELETE FROM ${name};`);
        }
      }
    }
    for (const statement of statements) db.exec(statement.text);
    db.exec('COMMIT;');
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Nothing left to roll back.
    }
    throw error;
  }
}

/** Import error the renderer can translate (`i18nKey` + params); `message` stays English for logs. */
export class SqlImportError extends Error {
  constructor(
    message: string,
    readonly i18nKey: string,
    readonly i18nParams: Record<string, string | number>
  ) {
    super(message);
    this.name = 'SqlImportError';
  }
}

/** Input caps: a JS string tops out around 512 Mi characters and the script is held as one. */
export const SQL_IMPORT_LIMITS = { maxInputBytes: 200 * 1024 * 1024, maxSqlBytes: 256 * 1024 * 1024 };

/** Reads a (gzipped) dump without blocking the main process, rejecting oversized input. */
export async function readSqlDump(
  inputPath: string,
  compressed = false,
  limits = SQL_IMPORT_LIMITS
): Promise<{ text: string; inputBytes: number }> {
  const inputBytes = (await fs.promises.stat(inputPath)).size;
  const fileMb = Math.round(limits.maxInputBytes / 1048576);
  const sqlMb = Math.round(limits.maxSqlBytes / 1048576);
  const tooLarge = () =>
    new SqlImportError(`Import file is too large (limit: ${fileMb} MB file, ${sqlMb} MB SQL)`, 'db.importTooLarge', {
      fileMb,
      sqlMb,
    });
  if (inputBytes > limits.maxInputBytes) throw tooLarge();

  const chunks: Buffer[] = [];
  let total = 0;
  let overLimit: Error | undefined;
  const collect = async (stream: AsyncIterable<Buffer>) => {
    for await (const chunk of stream) {
      total += chunk.length;
      if (total > limits.maxSqlBytes) throw (overLimit = tooLarge());
      chunks.push(chunk);
    }
  };
  const source = fs.createReadStream(inputPath);
  // pipeline reports an AbortError when the consumer stops early; surface the cap instead.
  await (compressed ? pipeline(source, zlib.createGunzip(), collect) : pipeline(source, collect)).catch(
    (error: unknown) => {
      throw overLimit ?? error;
    }
  );
  return { text: Buffer.concat(chunks, total).toString('utf8'), inputBytes };
}

export async function exportSQLite(
  filePath: string,
  outputPath: string,
  options: SqliteDumpOptions & { compress?: boolean },
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string; outputPath: string }> {
  onProgress?.({ bytesProcessed: 0, stage: 'exporting', message: 'Exporting SQLite database...' });

  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    // One read transaction for a consistent snapshot while the explorer keeps its connection.
    db.exec('BEGIN;');
    const source = Readable.from(sqliteDumpLines(db as unknown as SqliteHandle, options));
    const target = fs.createWriteStream(outputPath);
    await (options.compress
      ? pipeline(source, zlib.createGzip(), target)
      : pipeline(source, target));
    db.exec('COMMIT;');
  } finally {
    db.close();
  }

  const stats = await fs.promises.stat(outputPath);
  onProgress?.({
    bytesProcessed: stats.size,
    totalBytes: stats.size,
    percentage: 100,
    stage: 'completed',
    message: 'Export completed',
  });
  return { success: true, outputPath };
}

export async function importSQLite(
  filePath: string,
  inputPath: string,
  options: { compressed?: boolean; clearMode?: 'none' | 'truncate' | 'drop' },
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string }> {
  onProgress?.({ bytesProcessed: 0, stage: 'importing', message: 'Importing SQL into SQLite...' });

  const { text, inputBytes } = await readSqlDump(inputPath, options.compressed);
  if (text.startsWith('SQLite format 3\0')) {
    throw new Error('Import expects a .sql dump, not a SQLite database file');
  }

  const db = new Database(filePath, { fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000');
    applySqliteScript(db as unknown as SqliteHandle, text, options.clearMode);
  } finally {
    db.close();
  }

  onProgress?.({
    bytesProcessed: inputBytes,
    totalBytes: inputBytes,
    percentage: 100,
    stage: 'completed',
    message: 'Import completed',
  });
  return { success: true };
}
