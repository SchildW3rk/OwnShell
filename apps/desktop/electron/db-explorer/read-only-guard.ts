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

export function mongoPipelineWrites(pipeline: Array<Record<string, unknown>>, depth = 0): boolean {
  // Unparseable nesting depth counts as a write: refuse rather than guess.
  if (!Array.isArray(pipeline) || depth > 16) return true;
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const nested = (value: unknown) =>
    Array.isArray(value) && mongoPipelineWrites(value as Array<Record<string, unknown>>, depth + 1);
  // Every key, not just the first: the IPC payload is not trusted to be well-formed.
  return pipeline.some(
    (stage) =>
      isObject(stage) &&
      Object.entries(stage).some(([key, value]) => {
        if (key === '$out' || key === '$merge') return true;
        // Sub-pipelines: $lookup.pipeline, $unionWith.pipeline, $facet.<name>.
        if ((key === '$lookup' || key === '$unionWith') && isObject(value)) return nested(value.pipeline);
        if (key === '$facet' && isObject(value)) return Object.values(value).some(nested);
        return false;
      })
  );
}

export function readOnlyFailure() {
  return { success: false, error: READ_ONLY_ERROR, reason: 'read-only' as const };
}
