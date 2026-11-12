'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runProfile } = require('./run.cjs');
const message = 'Synthetic close failure after real Electron exit';
(async () => {
  const args = process.argv.slice(2);
  assert.ok(args.includes('--output') && args[args.indexOf('--output') + 1], 'Requires --output <artifact-directory>');
  const output = path.resolve(args[args.indexOf('--output') + 1]);
  let returnedLaunches = 0;
  let failure;
  try {
    await runProfile('everyday', undefined, { directorySuffix: 'close-failure', lifecycle: async ({ launch }) => {
      const { app, page } = await launch();
      returnedLaunches++;
      await page.getByRole('button', { name: 'Create Master Password', exact: true }).waitFor();
      const actualClose = app.close.bind(app);
      app.close = async () => {
        await actualClose();
        throw new Error(message);
      };
      await launch();
      returnedLaunches++;
      assert.fail('A failed close must prevent another process launch');
    } });
  } catch (error) { failure = error; }
  assert.equal(failure?.message, message, 'The original close failure must propagate, not be swallowed or replaced');
  assert.equal(returnedLaunches, 1, 'No second launch may return after the failed close');
  assert.equal(process.exitCode, 1, 'The runner must set a failed exit status before the expected-failure smoke resets it');
  const reportPath = path.join(output, 'everyday', 'close-failure', 'report.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.status, 'failed');
  assert.equal(report.cleanupError, message);
  assert.ok(report.error.includes(message));
  assert.equal(report.launches.length, 1, 'Exactly one actual Electron launch must be recorded');
  assert.equal(report.launches[0].electronExited, true);
  for (const key of ['electronExited', 'sshClosed', 'temporaryProfileRemoved']) assert.equal(report.safety.cleanup[key], true, key);
  const result = { status: 'passed', expectedFailure: message, returnedLaunches, recordedLaunches: report.launches.length, scenarioStatus: report.status, runnerExitCode: process.exitCode, cleanup: report.safety.cleanup };
  fs.writeFileSync(path.join(output, 'close-failure-result.json'), JSON.stringify(result, null, 2));
  // The runner sets failure exit status correctly; this smoke passes only after every expected-failure and cleanup assertion above.
  process.exitCode = 0;
  console.log(`CLOSE_FAILURE_SMOKE ${JSON.stringify(result)}`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
