'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeInput, textEvents, nativeWheel, sftpRead, measureMixedFrame } = require('./mixed-ui.cjs');
const { schedule, quantiles } = require('./workloads.cjs');
const { startDockerFixture } = require('./docker-fixture.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pane = (page, index) => page.locator('span').filter({ hasText: new RegExp(`^Benchmark ${index}$`) }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) });
const rect = box => ({ x: Math.ceil(box.x), y: Math.ceil(box.y), width: Math.floor(box.width), height: Math.floor(box.height) });
async function measureLogEvent(context, fixture, docker, index) {
  const { app, page, directory } = context;
  const fs = require('node:fs'), path = require('node:path'), { PNG } = require('pngjs');
  const marker = `DOCKER_VISIBLE_MARKER_${index}`;
  await fixture.pause(); await wait(500);
  const viewport = docker.locator('div.overflow-auto.bg-background').last();
  const region = rect(await viewport.boundingBox());
  const geometry = await viewport.evaluate(element => {
    const chain = [];
    for (let node = element; node && chain.length < 6; node = node.parentElement) {
      const box = node.getBoundingClientRect();
      chain.push({ className: node.className, x: box.x, y: box.y, width: box.width, height: box.height, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop, children: node.children.length });
    }
    return chain;
  });
  await viewport.evaluate((element, marker) => {
    globalThis.__dockerMarker = { marker, received: null, dom: null, tail: '', timeOrigin: performance.timeOrigin };
    globalThis.__markerMutation = new MutationObserver(() => {
      if (element.textContent.includes(marker)) globalThis.__dockerMarker.dom ??= performance.now();
    });
    globalThis.__markerMutation.observe(element, { childList: true, subtree: true, characterData: true });
  }, marker);
  if (region.height < 1 || region.width < 1) {
    await fixture.marker(marker); await wait(500);
    const observed = await page.evaluate(() => { globalThis.__markerMutation.disconnect(); return globalThis.__dockerMarker; });
    fs.writeFileSync(path.join(directory, `docker-stream-visible-${index}-geometry.json`), JSON.stringify({ geometry, observed }, null, 2));
    await page.screenshot({ path: path.join(directory, 'docker-zero-viewport.png') });
    throw new Error('Docker live-log viewport has no visible area in the approved mixed layout');
  }
  await app.evaluate(({ BrowserWindow }, region) => global.__ownshellBenchmark.startFrames(BrowserWindow.getAllWindows()[0], region), region);
  const clock = await app.evaluate(() => global.__ownshellBenchmark.clock());
  await fixture.marker(marker);
  await docker.getByText(marker, { exact: true }).waitFor();
  fs.writeFileSync(path.join(directory, `docker-stream-visible-${index}-geometry.json`), JSON.stringify(geometry, null, 2));
  await wait(schedule.presentationVerificationHoldMs);
  const capture = await app.evaluate(({ BrowserWindow }, region) => global.__ownshellBenchmark.finishFrames(BrowserWindow.getAllWindows()[0], region), region);
  const observed = await page.evaluate(() => { globalThis.__markerMutation.disconnect(); return globalThis.__dockerMarker; });
  assert.notEqual(observed.received, null, 'marker must arrive through actual public Docker log stream');
  const receivedAt = observed.timeOrigin + observed.received - clock.timeOrigin;
  const comparisonAt = performance.now();
  const reference = PNG.sync.read(Buffer.from(capture.reference, 'base64'));
  const frame = capture.frames.find(frame => {
    if (frame.at < receivedAt) return false;
    const image = PNG.sync.read(Buffer.from(frame.png, 'base64'));
    return image.width === reference.width && image.height === reference.height && image.data.equals(reference.data);
  });
  const id = `docker-stream-visible-${index}`;
  fs.writeFileSync(path.join(directory, `${id}-reference.png`), Buffer.from(capture.reference, 'base64'));
  fs.writeFileSync(path.join(directory, `${id}-frames.json`), JSON.stringify({ observed, receivedAt, clock, captureStats: capture.captureStats, frames: capture.frames.map(({ png, ...frame }) => frame) }, null, 2));
  if (!frame) capture.frames.forEach((frame, index) => fs.writeFileSync(path.join(directory, `${id}-frame-${index}.png`), Buffer.from(frame.png, 'base64')));
  assert.ok(frame, 'actual stream marker must match a presented compositor frame, not only DOM');
  fs.writeFileSync(path.join(directory, `${id}.png`), Buffer.from(frame.png, 'base64'));
  return { id, kind: 'docker-stream-visible', receivedAt, domObservedMs: observed.dom - observed.received, durationMs: frame.at - receivedAt, presentedCaptureAt: frame.at, capturedFrames: capture.captureStats.totalReadbacks, retainedFrames: capture.frames.length, captureStats: capture.captureStats, encodingMs: capture.encodingMs, comparisonMs: performance.now() - comparisonAt, referenceCaptureMs: capture.referenceCaptureMs, region, method: 'early public onLogsStreamData receive -> exact compositor target PNG; acquisition v2 readback upper bound, observer work included, not physical display' };
}
async function scenario(context) {
  const { app, page, ssh, root, directory, report, profile } = context;
  const diagnosticProfiles = process.argv.includes('--diagnostic-profiles');
  const fixture = await startDockerFixture(root);
  report.scenario = { issue: 11, scriptSha256: createHash('sha256').update(require('node:fs').readFileSync(__filename)).digest('hex'), fixture: { id: fixture.id, name: fixture.name, image: fixture.image, workload: fixture.workload }, phases: [] };
  report.scenario.instrumentation = {
    acquisitionVersion: 2,
    diagnosticProfiler: { enabled: diagnosticProfiles, intervalMicroseconds: diagnosticProfiles ? 1000 : null, phases: diagnosticProfiles ? ['visible-live-logs', 'hidden-live-logs', 'console-output'] : [], cpuProfilerDuringTiming: false },
    inputAndStreamTiming: 'Ordinary regional public capturePage readbacks; no CPUProfiler during timing samples',
  };
  try {
    await runMixed({ ...context, interactive: true });
    fixture.enable(ssh);
    await page.locator('header button[title]').first().click();
    await wait(250);
    report.scenario.sidebarCollapsed = true;
    const docker = pane(page, 3);
    await docker.getByRole('button', { name: 'Docker', exact: true }).click();
    report.scenario.layout = await require('./ticket-12-workspace-ui.cjs').expandPane(context, docker);
    await docker.getByText(fixture.name, { exact: true }).click();
    await docker.getByRole('button', { name: 'Logs', exact: true }).click();
    // Subscribe before Live installs its consumer so marker receive time includes
    // buffer processing and React work, rather than starting after that callback.
    await page.evaluate(() => {
      globalThis.__dockerStream = { chunks: 0, bytes: 0, sequence: null, violations: [], tail: '', events: [] };
      globalThis.__stopDockerObservation = window.electronAPI.docker.onLogsStreamData(event => {
        const receivedAt = performance.now();
        const marker = globalThis.__dockerMarker;
        if (marker && marker.received === null) {
          const bytes = marker.tail + event.data;
          if (bytes.includes(marker.marker)) marker.received = receivedAt;
          marker.tail = bytes.slice(-marker.marker.length);
        }
        const state = globalThis.__dockerStream;
        state.chunks++; state.bytes += event.data.length;
        const bytes = state.tail + event.data;
        for (const match of bytes.matchAll(/DOCKER_LOG (\d{10})[^\n]*\n/g)) {
          const n = Number(match[1]);
          if (state.sequence !== null && n !== state.sequence + 1) state.violations.push({ previous: state.sequence, next: n });
          state.sequence = n;
        }
        state.tail = bytes.slice(bytes.lastIndexOf('\n') + 1);
        state.events.push({ at: receivedAt, bytes: event.data.length });
      });
    });
    await docker.getByRole('button', { name: 'Live', exact: true }).click();
    await docker.getByText('DOCKER_LOG', { exact: false }).first().waitFor();
    const profiler = diagnosticProfiles ? await page.context().newCDPSession(page) : null;
    if (profiler) {
      await profiler.send('Profiler.enable');
      await profiler.send('Profiler.setSamplingInterval', { interval: 1000 });
      await profiler.send('Profiler.start');
    }
    await docker.locator('div.overflow-auto.bg-background').last().evaluate(element => {
      globalThis.__dockerDom = [];
      globalThis.__dockerDomObserver = new MutationObserver(records => globalThis.__dockerDom.push({ at: performance.now(), records: records.length }));
      globalThis.__dockerDomObserver.observe(element, { subtree: true, childList: true, characterData: true });
    });
    await wait(3000);
    if (profiler) {
      const cpuProfile = await profiler.send('Profiler.stop');
      require('node:fs').writeFileSync(require('node:path').join(directory, 'docker-visible-renderer.cpuprofile'), JSON.stringify(cpuProfile.profile));
      await profiler.detach();
    }
    report.scenario.domWork = await page.evaluate(() => { globalThis.__dockerDomObserver.disconnect(); return globalThis.__dockerDom; });
    report.scenario.phases.push({ name: 'visible-live-logs', at: performance.now(), text: await docker.innerText() });
    await fixture.pause(); await wait(500);
    report.scenario.visibleRows = await docker.locator('.font-mono.whitespace-pre').allTextContents();
    report.scenario.fragmentedRows = report.scenario.visibleRows.filter(line => !/^DOCKER_LOG \d{10} deterministic-container-output\.+\s*$/.test(line));
    report.scenario.bufferLabel = await docker.getByText(/1000 lines/).count();
    report.scenario.eventSamples = [];
    for (let index = 0; index < 5; index++) report.scenario.eventSamples.push(await measureLogEvent(context, fixture, docker, index));
    await fixture.resume();
    await wait(500);
    await docker.locator('div.overflow-auto.bg-background').last().evaluate(element => {
      globalThis.__hiddenDockerMutations = [];
      globalThis.__hiddenDockerObserver = new MutationObserver(records => globalThis.__hiddenDockerMutations.push({ at: performance.now(), count: records.length }));
      globalThis.__hiddenDockerObserver.observe(element, { subtree: true, childList: true, characterData: true });
    });
    await docker.getByRole('button', { name: 'Terminal', exact: true }).click();
    await wait(500);
    await page.evaluate(() => { globalThis.__hiddenDockerMutations = []; });
    const hiddenStreamBytes = await page.evaluate(() => globalThis.__dockerStream.bytes);
    const hiddenProfiler = diagnosticProfiles ? await page.context().newCDPSession(page) : null;
    if (hiddenProfiler) {
      await hiddenProfiler.send('Profiler.enable');
      await hiddenProfiler.send('Profiler.setSamplingInterval', { interval: 1000 });
      await hiddenProfiler.send('Profiler.start');
    }
    await wait(2500);
    if (hiddenProfiler) {
      const hiddenCpuProfile = await hiddenProfiler.send('Profiler.stop');
      require('node:fs').writeFileSync(require('node:path').join(directory, 'docker-hidden-renderer.cpuprofile'), JSON.stringify(hiddenCpuProfile.profile));
      await hiddenProfiler.detach();
    }
    report.scenario.hiddenLogWork = await page.evaluate(before => {
      globalThis.__hiddenDockerObserver.disconnect();
      return { mutations: globalThis.__hiddenDockerMutations, streamBytes: globalThis.__dockerStream.bytes - before };
    }, hiddenStreamBytes);
    assert.ok(report.scenario.hiddenLogWork.streamBytes > 100000, 'outer-hidden live task must keep receiving real output');
    await docker.getByRole('button', { name: 'Docker', exact: true }).click();
    await docker.getByRole('button', { name: 'Stop Live', exact: true }).waitFor();
    await wait(500);
    // Editor dialog covers Docker without ending its intentionally live task.
    await measureConcurrentEditor(context, 'docker-logs');
    const observed = await page.evaluate(() => { globalThis.__stopDockerObservation(); return globalThis.__dockerStream; });
    assert.ok(observed.bytes > 100000, 'real Docker log output must overlap input measurements');
    assert.deepEqual(observed.violations, [], 'real Docker log stream must remain ordered');
    report.scenario.stream = observed;
    await docker.getByRole('button', { name: 'Stop Live', exact: true }).click();
    await docker.getByRole('button', { name: 'Console', exact: true }).click();
    await page.evaluate(() => {
      globalThis.__dockerConsole = { bytes: 0, text: '', received: [], sequence: null, violations: [], tail: '' };
      globalThis.__stopConsoleObservation = window.electronAPI.docker.onExecData(event => {
        const state = globalThis.__dockerConsole;
        const data = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        state.bytes += data.length; state.text = (state.text + data).slice(-65536);
        state.received.push({ at: performance.now(), bytes: data.length });
        const bytes = state.tail + data;
        for (const match of bytes.matchAll(/CONSOLE_SEQ (\d{10})\r*\n/g)) {
          const sequence = Number(match[1]);
          if (state.sequence !== null && sequence !== state.sequence + 1) state.violations.push({ previous: state.sequence, next: sequence });
          state.sequence = sequence;
        }
        state.tail = bytes.slice(bytes.lastIndexOf('\n') + 1);
      });
    });
    await docker.getByRole('button', { name: 'Connect', exact: true }).click();
    const consoleInput = docker.locator('.xterm-helper-textarea:visible');
    await consoleInput.waitFor(); await wait(1500); await consoleInput.focus();
    const enter = [{ type: 'keyDown', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }];
    const sendConsole = async command => {
      await consoleInput.focus();
      await app.evaluate(({ clipboard, BrowserWindow }, command) => {
        clipboard.writeText(command);
        BrowserWindow.getAllWindows()[0].webContents.paste();
      }, command);
      await nativeInput(app, enter);
    };
    await sendConsole("(i=0; while :; do j=0; while [ \"$j\" -lt 100 ]; do printf 'CONSOLE_SEQ %010d\\n' \"$i\"; i=$((i+1)); j=$((j+1)); done; sleep 0.1; done) & console_pid=$!");
    await page.waitForFunction(() => globalThis.__dockerConsole.sequence >= 10);
    await sendConsole("printf '%s_%s\\n' CONSOLE REAL_OK");
    await page.waitForFunction(() => globalThis.__dockerConsole.text.includes('CONSOLE_REAL_OK'));
    const consoleProfiler = diagnosticProfiles ? await page.context().newCDPSession(page) : null;
    if (consoleProfiler) {
      await consoleProfiler.send('Profiler.enable');
      await consoleProfiler.send('Profiler.setSamplingInterval', { interval: 1000 });
      await consoleProfiler.send('Profiler.start');
    }
    await wait(3000);
    if (consoleProfiler) {
      const consoleCpuProfile = await consoleProfiler.send('Profiler.stop');
      require('node:fs').writeFileSync(require('node:path').join(directory, 'docker-console-renderer.cpuprofile'), JSON.stringify(consoleCpuProfile.profile));
      await consoleProfiler.detach();
    }
    await measureConcurrentEditor(context, 'docker-console');
    await sendConsole("kill \"$console_pid\"; wait \"$console_pid\"; printf '%s_%s\\n' CONSOLE STOPPED");
    await page.waitForFunction(() => globalThis.__dockerConsole.text.includes('CONSOLE_STOPPED'));
    report.scenario.console = await page.evaluate(() => { globalThis.__stopConsoleObservation(); return globalThis.__dockerConsole; });
    assert.deepEqual(report.scenario.console.violations, [], 'real console output must stay ordered during concurrent native input');
    await page.screenshot({ path: require('node:path').join(directory, 'docker-console.png') });
    report.correctness.dockerConsoleInput = true;
    await docker.getByRole('button', { name: 'Usage', exact: true }).click();
    await wait(6000);
    report.scenario.phases.push({ name: 'usage-visible', at: performance.now(), text: await docker.innerText() });
    const visibleStatsCalls = ssh.events.filter(event => event.type === 'exec' && /^docker stats /.test(event.command)).length;
    assert.ok(visibleStatsCalls >= 2, 'visible Usage must collect fresh real stats');
    await docker.getByRole('button', { name: 'Terminal', exact: true }).click();
    // Allow a stats request already in flight to finish before the hidden window.
    await wait(2500);
    const hiddenAt = performance.now();
    await wait(6000);
    report.scenario.phases.push({ name: 'outer-hidden', at: performance.now() });
    const hiddenStatsCalls = ssh.events.filter(event => event.type === 'exec' && /^docker stats /.test(event.command) && event.at >= hiddenAt).length;
    report.scenario.hiddenStatsCalls = hiddenStatsCalls;
    await docker.getByRole('button', { name: 'Docker', exact: true }).click();
    await wait(3000);
    report.scenario.phases.push({ name: 'outer-visible-again', at: performance.now(), text: await docker.innerText() });
    const refreshedStats = ssh.events.filter(event => event.type === 'exec' && /^docker stats /.test(event.command)).length;
    assert.ok(refreshedStats > visibleStatsCalls + hiddenStatsCalls, 'Usage must resume fresh stats when shown');
    for (const kind of ['typing', 'scroll']) report.summary[kind] = quantiles(report.samples.filter(sample => sample.kind === kind), profile.inputTargetMs);
    await page.screenshot({ path: require('node:path').join(directory, 'docker-final.png') });
    await docker.getByRole('button', { name: 'Logs', exact: true }).click();
    await wait(2500);
    report.scenario.closedStreamResources = ssh.resources();
    assert.equal(ssh.resources().processes, 0, 'internal tab close must release console PTY and no stats pollers may remain');
    report.summary['docker-stream-visible'] = quantiles(report.scenario.eventSamples, Infinity);
    assert.deepEqual(report.scenario.fragmentedRows, [], 'visible log rows must preserve complete ordered container lines across protocol chunks');
    assert.equal(report.scenario.bufferLabel, 1, 'live log buffer must retain its existing 1000-line bound');
    assert.deepEqual(report.scenario.hiddenLogWork.mutations, [], 'outer-hidden logs must retain the stream without repeatedly reconciling hidden rows');
    assert.equal(hiddenStatsCalls, 0, 'outer-hidden Usage must not keep polling real docker stats');
  } catch (error) {
    report.scenario.primaryError = error.stack;
    throw error;
  } finally {
    try { await fixture.close(); report.scenario.containerRemoved = true; }
    catch (error) { report.scenario.cleanupError = error.stack; if (!report.scenario.primaryError) throw error; }
  }
}
if (require.main === module) runProfile(process.argv.includes('--profile') ? process.argv[process.argv.indexOf('--profile') + 1] : 'everyday', scenario).catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { scenario };

async function measureConcurrentEditor(context, prefix) {
  const { app, page, ssh, directory, report } = context;
    const files = pane(page, 1);
    await files.getByRole('button', { name: 'Files', exact: true }).click();
    await files.getByText('editor.txt', { exact: true }).dblclick();
    const content = page.locator('.cm-content');
    await content.waitFor(); await content.focus(); await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home');
    const original = await sftpRead(ssh, '/editor.txt');
    const box = await content.boundingBox(), scroller = await page.locator('.cm-scroller').boundingBox();
    const typingRegion = rect({ x: box.x, y: scroller.y + 5, width: Math.min(880, scroller.x + scroller.width - box.x - 20), height: 18 });
    let inserted = '';
    for (let i = 0; i < schedule.samplesPerAction; i++) {
      const char = String.fromCharCode(65 + i % 26); inserted += char;
      const firstLine = inserted + original.toString('ascii', 0, original.indexOf(10));
      report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `${prefix}-typing-${i}`, kind: 'typing', region: typingRegion, action: () => nativeInput(app, textEvents(char)), outcome: () => page.waitForFunction(value => document.querySelector('.cm-line')?.textContent === value, firstLine) }));
      await wait(schedule.actionIntervalMs);
    }
    const scrollRegion = rect({ x: box.x, y: scroller.y + 100, width: 600, height: 120 });
    for (let i = 0; i < schedule.samplesPerAction; i++) {
      const before = await page.locator('.cm-scroller').evaluate(e => e.scrollTop);
      report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `${prefix}-scroll-${i}`, kind: 'scroll', region: scrollRegion, action: () => nativeWheel(app, scrollRegion.x + 200, scrollRegion.y + 50), outcome: () => page.waitForFunction(previous => document.querySelector('.cm-scroller').scrollTop > previous, before), finalOutcome: async () => { const after = await page.locator('.cm-scroller').evaluate(e => e.scrollTop); assert.ok(after > before); return { before, after }; } }));
      await wait(schedule.actionIntervalMs);
    }
    await page.keyboard.press('Meta+s'); await content.waitFor({ state: 'detached' });
    const reread = await sftpRead(ssh, '/editor.txt');
    assert.deepEqual(reread, Buffer.concat([Buffer.from(inserted), original]));
    report.correctness[`${prefix}ConcurrentEditorSave`] = { bytes: reread.length, sha256: createHash('sha256').update(reread).digest('hex') };
}
