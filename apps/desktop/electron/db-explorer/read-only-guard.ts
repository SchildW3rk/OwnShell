export const READ_ONLY_ERROR =
  'This connection is read-only. Disable read-only to run write operations.';

const MUTATING_SQL_PATTERN =
  /\b(INSERT|UPDATE|DELETE|UPSERT|REPLACE|MERGE|CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE|VACUUM|ANALYZE|REINDEX|CLUSTER|COMMENT|COPY|LOAD|CALL|EXECUTE|DO|REFRESH|LOCK|SET|RESET|INTO|OUTFILE|DUMPFILE)\b/i;
const MUTATING_SQL_FUNCTION_PATTERN = /\b(nextval|setval)\s*\(/i;
const READ_ONLY_SQL_PREFIX_PATTERN = /^(SELECT|WITH|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;

function stripSqlCommentsAndLiterals(sql: string): string {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\$[A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z0-9_]*\$/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
    .replace(/`(?:``|[^`])*`/g, '``');
}

export function shouldBlockReadOnlySql(sql: string): boolean {
  const normalized = stripSqlCommentsAndLiterals(sql).trim();
  if (!normalized) return true;

  if (MUTATING_SQL_PATTERN.test(normalized)) return true;
  if (MUTATING_SQL_FUNCTION_PATTERN.test(normalized)) return true;

  return !READ_ONLY_SQL_PREFIX_PATTERN.test(normalized);
}

export function mongoPipelineWrites(pipeline: Array<Record<string, unknown>>): boolean {
  return pipeline.some((stage) => {
    const stageOperator = Object.keys(stage)[0]?.toLowerCase();
    return stageOperator === '$out' || stageOperator === '$merge';
  });
}

export function readOnlyFailure() {
  return { success: false, error: READ_ONLY_ERROR, reason: 'read-only' as const };
}
