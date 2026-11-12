'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runProfile } = require('./run.cjs');
const { nativeClick } = require('./mixed-ui.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const password = 'Benchmark-Only-2026!';
async function fill(page, label, value) {
  await page.locator('label').filter({ hasText: new RegExp(`^${label}$`) }).locator('..').locator('input').fill(value);
}
async function snapshot(app, phase) {
  return app.evaluate(({ app }, phase) => ({ phase, at: performance.now(), timeOrigin: performance.timeOrigin, processes: app.getAppMetrics(), mainHeap: process.memoryUsage() }), phase);
}
async function firstAction(context, index, start, kind, extra = {}) {
  const { app, page, ssh, report, directory } = context;
  await page.getByRole('button', { name: 'Add SSH Host', exact: true }).waitFor();
  const workspaceReady = performance.now();
  await nativeClick(app, page.getByRole('button', { name: 'Add SSH Host', exact: true }));
  await fill(page, 'Label', `Benchmark ${index}`);
  await fill(page, 'Hostname / IP', '127.0.0.1');
  await fill(page, 'Port', String(ssh.port));
  await fill(page, 'Username', 'benchmark');
  await fill(page, 'Password', ssh.password);
  await page.getByRole('button', { name: 'Add Host', exact: true }).scrollIntoViewIfNeeded();
  const submitted = await nativeClick(app, page.getByRole('button', { name: 'Add Host', exact: true }));
  await page.getByRole('button', { name: `Benchmark ${index}`, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add Host', exact: true }).waitFor({ state: 'detached' });
  const screenshot = `${kind}-${index}-usable.png`;
  await page.screenshot({ path: path.join(directory, screenshot) });
  const capturedAt = performance.now();
  const sample = { kind, index, launchIndex: context.launchIndex, timeOrigin: context.runtime.timeOrigin, durationMs: capturedAt - start, workspaceReadyMs: workspaceReady - start, firstActionMs: capturedAt - workspaceReady, screenshot, nativeSubmit: submitted, endpoint: 'Actual UI host creation completed; new host visible in captured Electron compositor image. Includes automation/form-fill/capture overhead; not first-paint or single-input latency.', ...extra };
  report.startup.samples.push(sample);
  sample.capturedAt = capturedAt;
  report.startup.resources.push(await snapshot(app, `${kind}-usable`));
  return sample;
}
async function locked(page, lastIndex) {
  await page.getByRole('button', { name: 'Unlock', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add SSH Host', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: `Benchmark ${lastIndex}`, exact: true }).count(), 0);
}
async function unlock(context, lastIndex, kind) {
  const { app, page } = context;
  await locked(page, lastIndex);
  await fill(page, 'Master Password', password);
  const start = performance.now();
  const dispatch = await nativeClick(app, page.getByRole('button', { name: 'Unlock', exact: true }));
  return { start, dispatch, kind };
}
async function lifecycle(context) {
  const { launch, setup, ssh, directory, report } = context;
  report.startup = {
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    targetMs: null,
    definitions: { fresh: 'New isolated local application profile with public master-password setup and recovery acknowledgement; OS disk cache not flushed.', existing: 'New Electron process reusing the same local password-protected synthetic profile; OS cache warm.', unlock: 'Explicit native UI lock followed by actual password verification and key derivation, license gate and successful UI action.', repetitions: 'Three independent fresh profiles per batch, three existing-process starts and three in-process unlocks per profile. Invalid-password attempt is separate from timed valid unlock.' },
    samples: [], resources: [], correctness: {},
  };
  let current = await launch();
  let { app, page } = current;
  await page.waitForSelector('input');
  assert.equal(await page.getByRole('button', { name: 'Add SSH Host', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Create Master Password', exact: true }).waitFor();
  report.startup.correctness.freshLocalSetupGate = true;
  report.startup.resources.push(await snapshot(app, 'fresh-local-setup'));
  await setup(page);
  const usable = { ...context, ...current };
  await firstAction(usable, 1, current.launchStarted, 'fresh-start', { safetyProbeDurationMs: current.safetyProbeDurationMs });
  let index = 1;
  for (let repetition = 0; repetition < 3; repetition++) {
    current = await launch(); ({ app, page } = current);
    await locked(page, index);
    const lockReadyMs = performance.now() - current.launchStarted;
    report.startup.resources.push(await snapshot(app, 'existing-locked'));
    const existing = { ...context, ...current };
    const valid = await unlock(existing, index, 'existing-unlock');
    await page.getByRole('button', { name: `Benchmark ${index}`, exact: true }).waitFor();
    const sample = await firstAction(existing, ++index, valid.start, 'existing-unlock', { repetition, nativeUnlock: valid.dispatch });
    report.startup.samples.push({ kind: 'existing-process-start', repetition, launchIndex: current.launchIndex, timeOrigin: current.runtime.timeOrigin, lockReadyMs, durationMs: sample.capturedAt - current.launchStarted, endpoint: sample.endpoint, screenshot: sample.screenshot, safetyProbeDurationMs: current.safetyProbeDurationMs });
    report.startup.correctness.persistedHostSurvivedRestart = true;
    await nativeClick(app, page.locator('button').filter({ has: page.locator('svg.lucide-lock') }));
    await locked(page, index);
    if (repetition === 0) {
      await fill(page, 'Master Password', 'Definitely-Wrong-Synthetic-2026!');
      const invalidStart = performance.now();
      await nativeClick(app, page.getByRole('button', { name: 'Unlock', exact: true }));
      await page.getByText('Incorrect password', { exact: true }).waitFor();
      await locked(page, index);
      report.startup.invalidPasswordMs = performance.now() - invalidStart;
      report.startup.correctness.invalidPasswordRemainsLocked = true;
      await page.screenshot({ path: path.join(directory, 'invalid-password-locked.png') });
    }
    const inProcess = await unlock(existing, index, 'in-process-unlock');
    await page.getByRole('button', { name: `Benchmark ${index}`, exact: true }).waitFor();
    await firstAction(existing, ++index, inProcess.start, 'in-process-unlock', { repetition, nativeUnlock: inProcess.dispatch });
    report.startup.correctness.explicitLockBoundary = true;
    report.startup.resources.push(await snapshot(app, 'idle-before'));
    await wait(2100);
    report.startup.resources.push(await snapshot(app, 'idle-after'));
  }
  const ipc = await app.evaluate(() => global.__ownshellBenchmark.ipc());
  assert.ok(ipc.some(event => event.channel === 'license:get-status'), 'actual license status gate must execute (development exemption, NOT activated entitlement verification)');
  report.startup.correctness.developmentLicenseGateExecuted = true;
  report.startup.correctness.hostsCreated = index;
  report.startup.correctness.nativeInput = true;
}
function distribution(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const percentile = p => sorted[Math.ceil(sorted.length * p) - 1];
  return { n: values.length, min: sorted[0], p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1), mean, standardDeviation: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length), targetMs: null };
}
(async () => {
  if (!process.argv.includes('--output') || !process.argv[process.argv.indexOf('--output') + 1]) throw new Error('Startup scenario requires --output <artifact-directory>');
  for (let repetition = 0; repetition < 3; repetition++) {
    await runProfile('everyday', undefined, { lifecycle, directorySuffix: `fresh-${repetition + 1}` });
  }
  const args = process.argv.slice(2);
  const output = path.resolve(args.includes('--output') ? args[args.indexOf('--output') + 1] : '.');
  const reports = [1, 2, 3].map(index => JSON.parse(fs.readFileSync(path.join(output, 'everyday', `fresh-${index}`, 'report.json'), 'utf8')));
  const samples = reports.flatMap(report => report.startup.samples);
  const summary = Object.fromEntries([...new Set(samples.map(sample => sample.kind))].map(kind => [kind, distribution(samples.filter(sample => sample.kind === kind).map(sample => sample.durationMs))]));
  fs.writeFileSync(path.join(output, 'startup-summary.json'), JSON.stringify({ sourceCommits: [...new Set(reports.map(report => report.startup.sourceCommit))], build: reports[0].build, hardware: reports[0].hardware, definitions: reports[0].startup.definitions, summary, correctness: reports.map(report => report.startup.correctness), cleanup: reports.map(report => report.safety.cleanup), limitations: ['Unpackaged Electron; Vite production assets with existing development-license exemption. Not activated/shipped-app entitlement or startup verification.', 'Small sample: p95/p99 are observed nearest ranks, not population guarantees. No absolute startup target was agreed.', 'Fresh profile is not an OS disk-cache-cold boot. Automated local password setup/recovery acknowledgement/form input time, confinement probes and screenshot capture are included. No overhead subtraction.', 'Usable endpoint requires actual successful host creation and captured compositor output, not just a window, DOM-ready or handler completion. It is an upper bound, not physical monitor timing.'] }, null, 2));
  console.log(`STARTUP_SUMMARY ${JSON.stringify(summary)}`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
