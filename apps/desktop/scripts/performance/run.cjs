'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { _electron } = require('playwright-core');
const { startSSH } = require('./ssh-fixture.cjs');
const { runMixed } = require('./mixed-ui.cjs');
const { profiles, schedule } = require('./workloads.cjs');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const profileName = option('--profile', 'all');
const output = path.resolve(option('--output', path.join(os.tmpdir(), `ownshell-baseline-${Date.now()}`)));
const interactive = args.includes('--interactive');
const smoke = args.includes('--smoke');
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
async function fill(page, label, value) {
  const linked = page.getByLabel(label, { exact: true }).and(page.locator('input'));
  if (await linked.count()) return linked.fill(value);
  return page.locator('label').filter({ hasText: label }).first().locator('..').locator('input').fill(value);
}
async function setup(page) {
  await page.waitForSelector('input');
  await fill(page, 'Master Password', 'Benchmark-Only-2026!');
  await fill(page, 'Confirm Password', 'Benchmark-Only-2026!');
  await page.getByRole('button', { name: 'Create Master Password', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Got it!', exact: true }).click();
  await page.getByRole('button', { name: 'Add SSH Host', exact: true }).waitFor();
}
async function addHost(page, ssh, index) {
  await page.getByRole('button', { name: 'Add SSH Host', exact: true }).click();
  await fill(page, 'Label', `Benchmark ${index}`);
  await fill(page, 'Hostname / IP', '127.0.0.1');
  await fill(page, 'Port', String(ssh.port));
  await fill(page, 'Username', 'benchmark');
  await fill(page, 'Password', ssh.password);
  await page.getByRole('button', { name: 'Add Host', exact: true }).click();
  await page.getByRole('button', { name: `Benchmark ${index}`, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add Host', exact: true }).waitFor({ state: 'detached' });
}
async function runProfile(name, scenario = runMixed, { lifecycle, directorySuffix } = {}) {
  const featureScenario = Boolean(lifecycle) || scenario !== runMixed;
  if (directorySuffix !== undefined && !/^[a-z0-9-]+$/.test(directorySuffix)) throw new Error('Invalid scenario directory suffix');
  const profile = profiles[name]; if (!profile) throw new Error(`Unknown profile ${name}`);
  const directory = path.join(output, name, ...(directorySuffix ? [directorySuffix] : [])); fs.mkdirSync(directory, { recursive: true });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ownshell-benchmark-'));
  fs.mkdirSync(path.join(root, 'downloads')); fs.mkdirSync(path.join(root, 'profile'));
  json(path.join(root, 'package.json'), { name: 'ownshell-performance-baseline', version: require('../../package.json').version, main: path.join(__dirname, 'electron-bootstrap.cjs') });
  // Session frame preloads run before product scripts on the first navigation and every relaunch.
  fs.writeFileSync(path.join(root, 'locale-preload.cjs'), "'use strict';\nwindow.localStorage.setItem('ownshell-language', 'en');\n");
  const report = {
    schemaVersion: 1, status: 'running', profile: name,
    build: { renderer: 'vite production build', productVersion: require('../../package.json').version, electron: 'unpackaged Electron 40.10.1', license: 'existing development license exemption; NODE_ENV=development', packaged: false },
    hardware: { platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemory: os.totalmem() },
    workload: { ...profile, transferConnections: 1, additionalStandaloneSftpPane: 1, windowDIP: { width: 1200, height: 800 }, textLineBytes: 128, textNewline: 'LF' },
    schedule, loads: [], samples: [], summary: {}, resources: [], ipc: [], longTasks: [], correctness: {},
    safety: { isolatedProfile: true, realElectron: true, loopbackOnly: true },
    limitations: [
      'Frame capture is a compositor/capture upper bound, not physical display time.',
      'Frame delivery includes capture/subscription overhead. Post-hoc PNG encoding/comparison costs and sampler overhead are reported separately; no subtraction.',
      'IPC adapter totals include transport, fixture response and local preparation; not pure server time.',
      'Remote terminal command echo is not single-key local input processing and has no local-input target.',
      'Chromium Event Timing has a 16ms observation floor and 8ms rounding; frame-image samples are the primary evidence.',
      'Cold means fresh isolated application state and first access, not a purged OS disk cache; warm repetitions reuse mounted panes.',
    ],
  };
  let ssh, app, page, electronProcess, rendererSampler, fixtureSampler, cdp;
  report.rendererResources = []; report.fixtureDriverResources = []; report.driverTimeOrigin = performance.timeOrigin;
  const started = performance.now();
  let launchIndex = 0, activeLaunch;
  if (lifecycle) {
    report.workload = { kind: 'startup-unlock', terminalSessions: 0, transfers: 0, hostCreationThroughUI: true, windowDIP: { width: 1200, height: 800 }, provisionedButNotExercisedSSHFixture: profile };
    report.schedule = { processStartsPerProfile: 4, explicitLocksPerProfile: 3, idleObservationMs: 2100 };
    report.launches = [];
  }
  const closeApp = async () => {
    clearInterval(rendererSampler); clearInterval(fixtureSampler);
    if (!app) return;
    const data = {};
    for (const [key, getter] of Object.entries({ ipc: 'ipc', resources: 'metrics', workerMessages: 'workerMessages', nativeInputEvents: 'nativeInputEvents', blockedBrowserRequests: 'blockedRequests', blockedNodeConnections: 'blockedConnections', startupEvents: 'startupEvents', screenLocks: 'screenLocks' })) {
      data[key] = await app.evaluate((_electron, getter) => global.__ownshellBenchmark[getter](), getter).catch(() => []);
    }
    report.safety.screenLocks ??= [];
    report.safety.screenLocks.push(...data.screenLocks.map(value => ({ ...value, launchIndex, timeOrigin: activeLaunch.runtime?.timeOrigin })));
    if (lifecycle) {
      activeLaunch.rendererTiming = await page.evaluate(() => ({
        timeOrigin: performance.timeOrigin,
        navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
        scripts: performance.getEntriesByType('resource').filter(entry => ['script', 'link', 'css'].includes(entry.initiatorType)).map(entry => ({ path: new URL(entry.name).pathname, startTime: entry.startTime, duration: entry.duration, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize })),
        longTasks: globalThis.__startupLongTasks,
      })).catch(() => ({ unavailable: 'Renderer closed before timing harvest' }));
      for (const key of ['ipc', 'resources', 'workerMessages', 'nativeInputEvents']) {
        report[key] ??= [];
        report[key].push(...data[key].map(value => ({ ...value, launchIndex, timeOrigin: activeLaunch.runtime?.timeOrigin })));
      }
      for (const key of ['blockedBrowserRequests', 'blockedNodeConnections']) {
        report.safety[key] ??= [];
        report.safety[key].push(...data[key].map(value => ({ ...value, launchIndex })));
      }
    } else {
      for (const key of ['ipc', 'resources', 'workerMessages', 'nativeInputEvents']) report[key] = data[key];
      for (const key of ['blockedBrowserRequests', 'blockedNodeConnections']) report.safety[key] = data[key];
    }
    let closeFailure;
    try { await app.close(); }
    catch (error) {
      closeFailure = error;
      report.status = 'failed'; report.cleanupError = error.message; process.exitCode = 1;
      if (electronProcess.exitCode === null && electronProcess.signalCode === null) {
        await new Promise(resolve => {
          const timer = setTimeout(() => electronProcess.kill('SIGKILL'), 5000);
          electronProcess.once('exit', () => { clearTimeout(timer); resolve(); });
          electronProcess.kill('SIGTERM');
        });
      }
    }
    const exited = electronProcess.exitCode !== null || electronProcess.signalCode !== null;
    if (lifecycle) {
      const logPath = path.join(root, 'profile', 'logs', 'ownshell.log');
      const productionLog = fs.existsSync(logPath) ? fs.readFileSync(logPath).subarray(activeLaunch.logOffset).toString('utf8') : '';
      fs.writeFileSync(path.join(directory, `launch-${launchIndex}-production.log`), productionLog);
      const markers = ['Electron app ready', 'Initializing OwnShell application', 'Initializing database', 'Database initialized successfully', 'Running database migrations...', 'Database migrations completed successfully', 'Crypto manager initialized', 'License manager initialized', 'Application initialized successfully', 'Creating main window', 'Starting in production mode'];
      const productionMilestones = productionLog.split('\n').flatMap(line => {
        const match = line.match(/^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+\[\w+\]\s+(.*)$/);
        const kind = match && markers.find(marker => match[2].startsWith(marker));
        return kind ? [{ kind, fromLaunchMs: new Date(match[1].replace(' ', 'T')).getTime() - activeLaunch.launchStartedWall, clock: 'production wall-clock log, millisecond resolution; not monotonic CPU attribution' }] : [];
      });
      report.launches.push({ ...activeLaunch, startupEvents: data.startupEvents, productionMilestones, electronExited: exited });
    }
    app = null; page = null;
    report.safety.cleanup ??= {};
    report.safety.cleanup.electronExited = lifecycle ? report.launches.every(value => value.electronExited) : exited;
    if (closeFailure) throw closeFailure;
  };
  const launch = async () => {
    await closeApp();
    const logPath = path.join(root, 'profile', 'logs', 'ownshell.log');
    const logOffset = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
    const launchStarted = performance.now(), launchStartedWall = Date.now();
    launchIndex++;
    activeLaunch = { launchIndex, launchStarted, launchStartedWall, logOffset };
    activeLaunch.localePreference = { key: 'ownshell-language', value: 'en', method: 'isolated session frame preload before product scripts; no additional navigation' };
    app = await _electron.launch({ args: [root, '--remote-debugging-port=0'], env: { ...process.env, OWNSHELL_BENCHMARK: '1', OWNSHELL_BENCHMARK_ROOT: root, NODE_ENV: 'development', VITE_DEV_SERVER_URL: '', ELECTRON_RUN_AS_NODE: '' }, timeout: 60000 });
    electronProcess = app.process();
    electronProcess.stdout.on('data', data => fs.appendFileSync(path.join(directory, 'electron.log'), data));
    electronProcess.stderr.on('data', data => fs.appendFileSync(path.join(directory, 'electron.log'), data));
    page = await app.firstWindow(); page.setDefaultTimeout(30000);
    await page.waitForSelector('input');
    if (!lifecycle) report.loads.push({ kind: 'cold-local-setup-form-ready', endpoint: 'DOM-ready, not paint', durationMs: performance.now() - launchStarted });
    report.runtime = await app.evaluate(() => global.__ownshellBenchmark.runtime());
    assert.notEqual(report.runtime.systemIdleState, 'locked', 'OS screen lock invalidates graphical measurements');
    activeLaunch.runtime = report.runtime;
    activeLaunch.inputReadyMs = performance.now() - launchStarted;
    const localeObservationStarted = performance.now();
    activeLaunch.localePreference.observed = await page.evaluate(() => ({ navigatorLanguage: navigator.language, stored: localStorage.getItem('ownshell-language') }));
    activeLaunch.localePreference.observationDurationMs = performance.now() - localeObservationStarted;
    report.safety.localePreference = activeLaunch.localePreference;
    assert.equal(activeLaunch.localePreference.observed.stored, 'en', 'isolated harness English preference must precede renderer initialization');
    if (lifecycle) await page.evaluate(() => {
      globalThis.__startupLongTasks = [];
      new PerformanceObserver(list => globalThis.__startupLongTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
    });
    const safetyStarted = performance.now();
    report.safety.confinementProbes = await app.evaluate(() => global.__ownshellBenchmark.probeConfinement());
    assert.ok(Object.values(report.safety.confinementProbes).every(Boolean), 'main, worker and native SSH must reject non-loopback targets before connecting');
    report.safety.rendererNonLoopbackRejected = await page.evaluate(async () => { try { await fetch('https://benchmark.invalid'); return false; } catch { return true; } });
    assert.equal(report.safety.rendererNonLoopbackRejected, true);
    activeLaunch.safetyProbeDurationMs = performance.now() - safetyStarted;
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const currentCdp = cdp, currentLaunchIndex = launchIndex;
    rendererSampler = setInterval(async () => {
      const at = performance.now();
      const result = await currentCdp.send('Performance.getMetrics').catch(() => null);
      if (result) report.rendererResources.push({ at, ...(lifecycle ? { launchIndex: currentLaunchIndex } : {}), samplingMs: performance.now() - at, metrics: result.metrics });
    }, 1000);
    fixtureSampler = setInterval(() => report.fixtureDriverResources.push({ at: performance.now(), ...(lifecycle ? { launchIndex: currentLaunchIndex } : {}), cpu: process.cpuUsage(), memory: process.memoryUsage() }), 1000);
    return { app, page, launchStarted, runtime: report.runtime, launchIndex, safetyProbeDurationMs: activeLaunch.safetyProbeDurationMs };
  };
  try {
    ssh = await startSSH(profile);
    if (lifecycle) {
      await lifecycle({ launch, setup, addHost, ssh, profile, root, directory, report });
    } else {
      await launch();
      const reloadStarted = performance.now();
      await page.reload();
      await page.waitForSelector('input');
      report.loads.push({ kind: 'warm-local-setup-form-reload', endpoint: 'DOM-ready, not paint', durationMs: performance.now() - reloadStarted });
      await setup(page);
      report.loads.push({ kind: 'cold-fresh-profile-start-through-local-setup', durationMs: performance.now() - started });
      await page.screenshot({ path: path.join(directory, 'main-window.png') });
      for (let index = 1; index <= profile.terminals; index++) await addHost(page, ssh, index);
      report.correctness.freshProfileHostCreation = true;
      await scenario({ app, page, ssh, profile, root, directory, report, interactive: interactive || smoke });
    }
    console.log(`BENCHMARK_READY ${name} ${directory}`);
    if (interactive) {
      const [port, endpoint] = fs.readFileSync(path.join(root, 'profile', 'DevToolsActivePort'), 'utf8').trim().split('\n');
      console.log(`CDP_URL http://127.0.0.1:${port} ws://127.0.0.1:${port}${endpoint}`);
      console.log(`INTERACTIVE_OBSERVATION_MS ${schedule.interactiveObservationMs}`);
      await new Promise(resolve => {
        const done = () => { clearTimeout(timer); process.off('SIGINT', done); process.off('SIGTERM', done); resolve(); };
        const timer = setTimeout(done, schedule.interactiveObservationMs);
        process.once('SIGINT', done); process.once('SIGTERM', done);
      });
    }
    const screenLocks = await app.evaluate(() => global.__ownshellBenchmark.screenLocks());
    assert.equal(screenLocks.length + (report.safety.screenLocks?.length ?? 0), 0, 'OS screen lock invalidates graphical measurements');
    report.status = interactive ? 'interactive' : smoke ? 'smoke' : featureScenario ? 'scenario' : 'complete';
  } catch (error) {
    report.status = 'failed'; report.error = error.stack;
    if (page && report.correctness.freshProfileHostCreation) fs.writeFileSync(path.join(directory, 'failure-ui.txt'), await page.locator('body').innerText().catch(() => 'Renderer unavailable'));
    throw error;
  } finally {
    report.safety.cleanup ??= {};
    for (const [resource, close] of [
      ['electron', closeApp],
      ['ssh', async () => { if (ssh) { try { await ssh.close(); report.safety.cleanup.sshClosed = true; } finally { json(path.join(directory, 'fixture-events.json'), ssh.events); } } }],
    ]) {
      try { await close(); }
      catch (error) {
        report.status = 'failed'; process.exitCode = 1;
        report.cleanupErrors ??= [];
        report.cleanupErrors.push({ resource, error: error.message });
      }
    }
    if (report.safety.screenLocks?.length) {
      report.status = 'failed';
      report.safety.prerequisiteFailure = 'OS screen lock invalidates graphical measurements';
      process.exitCode = 1;
    }
    if (fs.existsSync(path.join(root, 'transfers-active.png'))) fs.copyFileSync(path.join(root, 'transfers-active.png'), path.join(directory, 'transfers-active.png'));
    report.elapsedMs = performance.now() - started;
    fs.rmSync(root, { recursive: true, force: true });
    report.safety.cleanup.temporaryProfileRemoved = !fs.existsSync(root);
    json(path.join(directory, 'report.json'), report);
  }
  assert.equal(report.safety.screenLocks?.length ?? 0, 0, 'OS screen lock invalidates graphical measurements');
  if (!interactive && report.status !== 'failed') {
    const prefix = featureScenario ? 'SCENARIO' : 'BASELINE';
    console.log(`${prefix}_${smoke ? 'SMOKE' : 'COMPLETE'} ${name} ${JSON.stringify(Object.fromEntries(Object.entries(report.summary).map(([kind, { n, p50, p95, p99, max, targetMs }]) => [kind, { n, p50, p95, p99, max, targetMs }])))}`);
  }
  return report;
}
if (require.main === module) {
  (async () => { console.log(`ARTIFACTS ${output}`); for (const name of profileName === 'all' ? Object.keys(profiles) : [profileName]) await runProfile(name); })().catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { runProfile };
