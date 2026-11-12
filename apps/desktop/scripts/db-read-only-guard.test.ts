import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldBlockReadOnlySql } from '../electron/db-explorer/read-only-guard';

const cases: Array<[sql: string, blocked: boolean]> = [
  ['SELECT * FROM users', false],
  ['  select id from t where note = \'insert into x\'', false],
  ['WITH x AS (SELECT 1) SELECT * FROM x', false],
  ['SHOW TABLES', false],
  ['EXPLAIN SELECT 1', false],
  ['SELECT "into" FROM t', false],
  // Postgres: SELECT INTO creates a table
  ['SELECT * INTO new_tbl FROM t', true],
  ['select a, b into temp copy from t', true],
  // MySQL: writes files on the server
  ["SELECT * FROM t INTO OUTFILE '/tmp/x.csv'", true],
  ["SELECT secret FROM t INTO DUMPFILE '/tmp/x'", true],
  ['SELECT 1 INTO @v', true],
  ['DELETE FROM t', true],
  ['SELECT 1; DROP TABLE t', true],
  ["SELECT nextval('seq')", true],
  ['VALUES (1)', true],
  ['', true],
];

test('read-only guard', () => {
  for (const [sql, blocked] of cases) {
    assert.equal(shouldBlockReadOnlySql(sql), blocked, sql);
  }
});

test('DB error logging keeps codes and drops the message that can quote user data', async () => {
  const { dbErrorCodes } = await import('../electron/logger');
  const error = Object.assign(new Error("Incorrect integer value: 'actual-secret' for column 'n'"), {
    code: 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', errno: 1366, sqlState: 'HY000', sql: "INSERT ... 'actual-secret'",
  });
  const meta = dbErrorCodes(error);
  assert.deepEqual(meta, { name: 'Error', code: 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', errno: '1366', sqlState: 'HY000' });
  assert.ok(!JSON.stringify(meta).includes('actual-secret'));
});
