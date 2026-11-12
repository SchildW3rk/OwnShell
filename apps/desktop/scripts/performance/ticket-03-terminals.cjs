'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeInput, textEvents, nativeClick, nativeWheel, measureMixedFrame, withMixedTransferGuard, terminalOutputRowRegion, sftpRead } = require('./mixed-ui.cjs');
const { schedule, quantiles, text } = require('./workloads.cjs');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const terminalPath = option('--terminal-path', 'native');
const captureAfterOutcome = args.includes('--capture-after-outcome');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const enter = [{ type: 'keyDown', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }];
async function until(predicate, description, timeout = 30000) {
  const end = performance.now() + timeout;
  while (!await predicate()) { if (performance.now() > end) throw new Error(`Timed out: ${description}`); await wait(25); }
}
function pane(page, label) {
  return page.locator('span').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) });
}
async function command(app, view, text) {
  await view.locator('.xterm-helper-textarea:visible').focus();
  return nativeInput(app, [...textEvents(text), ...enter]);
}
async function waitForChangedRowsFrame(surface, before) {
  await surface.locator('.xterm-rows').evaluate((rows, before) => new Promise((resolve, reject) => {
    let ready = false, raf;
    const cleanup = () => { observer.disconnect(); clearTimeout(timer); if (raf) cancelAnimationFrame(raf); };
    const changed = () => {
      if (ready || rows.textContent === before) return;
      ready = true;
      observer.disconnect();
      raf = requestAnimationFrame(() => { cleanup(); resolve(); });
    };
    const observer = new MutationObserver(changed);
    const timer = setTimeout(() => { cleanup(); reject(new Error('Real terminal rows did not change within10s')); }, 10000);
    observer.observe(rows, { childList: true, subtree: true, characterData: true });
    changed();
  }), before);
}
async function fill(page, label, value) {
  return page.locator('label').filter({ hasText: label }).first().locator('..').locator('input').fill(value);
}
async function addJump(page, ssh) {
  await page.getByRole('button', { name: 'Servers', exact: true }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  for (const [label, value] of [['Label', 'Benchmark Jump'], ['Hostname / IP', '127.0.0.1'], ['Port', String(ssh.port)], ['Username', 'benchmark'], ['Password', ssh.password]]) await fill(page, label, value);
  await page.locator('#jump-host-select').click();
  await page.getByRole('option', { name: 'Benchmark 1 (127.0.0.1)', exact: true }).click();
  await page.getByRole('button', { name: 'Add Host', exact: true }).click();
  await page.getByRole('button', { name: 'Benchmark Jump', exact: true }).click();
  await pane(page, 'Benchmark Jump').locator('.xterm').filter({ hasText: 'benchmark-real$' }).waitFor();
  return pane(page, 'Benchmark Jump');
}
function seedCommands(root) {
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin, { recursive: true });
  const script = body => `#!${process.execPath}\n'use strict';\n${body}\n`;
  for (let index = 1; index <= 8; index++) fs.writeFileSync(path.join(bin, `marker-${index}`), script(`process.stdout.write('ECHO marker-${index}\\n');`), { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'bench-output'), script("let sequence=0;setInterval(()=>{let bytes='';for(let i=0;i<10;i++)bytes+=('BENCH '+String(sequence++).padStart(10,'0')+' ').padEnd(126,'.')+'\\n';process.stdout.write(bytes);},100);"), { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'bench-bulk'), script("let sequence=0;function write(){while(sequence<16384){const line=('FINITE '+String(sequence++).padStart(8,'0')+' ').padEnd(126,'.')+'\\n';if(!process.stdout.write(line)){process.stdout.once('drain',write);return;}}process.stdout.write('FINITE-END\\n');}write();"), { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'bench-lines'), script("for(let i=0;i<1000;i++)process.stdout.write('SCROLL '+String(i).padStart(6,'0')+'\\n');process.stdout.write('SCROLL-END\\n');"), { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'bench-hidden'), script("const name=process.argv[2];let input='';process.stdin.on('data',bytes=>{input+=bytes.toString();if(!input.includes('\\n'))return;if(input.trim()!=='release')throw new Error('Unexpected hidden-output fixture input');process.stdin.pause();process.stdout.write('\\n'+name+'-HIDDEN-ALIVE\\n');});process.stdout.write('\\n'+name+'-READY\\n');"), { mode: 0o700 });
  return { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, PS1: 'benchmark-real$ ', ENV: '/dev/null' };
}
async function observeProtocol(page) {
  await page.evaluate(() => {
    globalThis.__terminalProtocol = { events: [], streams: {} };
    globalThis.__terminalPasteEvents = [];
    addEventListener('paste', event => globalThis.__terminalPasteEvents.push({ isTrusted: event.isTrusted, at: performance.now(), target: event.target?.tagName }), { capture: true });
    const observe = path => event => {
      const state = globalThis.__terminalProtocol.streams[`${path}:${event.sessionId}`] ??= { path, sessionId: event.sessionId, text: '', markers: {} };
      const text = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
      const at = performance.now();
      const previousLength = state.text.length;
      state.text += text;
      for (const match of state.text.slice(Math.max(0, previousLength - 80)).matchAll(/(?:^|\r?\n)(E[0-9]{2}|WORKER-ECHO-[0-9]+)\r?\n/g)) state.markers[match[1]] ??= at;
      globalThis.__terminalProtocol.events.push({ path, sessionId: event.sessionId, at, bytes: new TextEncoder().encode(text).length });
    };
    globalThis.__stopTerminalProtocol = [window.electronAPI.localPty.onData(observe('pty')), window.electronAPI.ssh.onData(observe('ssh2'))];
  });
}
async function streamFor(page, marker) {
  return page.evaluate(marker => Object.values(globalThis.__terminalProtocol.streams).find(state => state.text.includes(marker)), marker);
}
function verifyFiniteText(text) {
  const start = text.indexOf('FINITE 00000000 ');
  const end = text.indexOf('FINITE-END\r\n', start);
  assert.ok(start >= 0 && end > start, 'finite output has both independent boundary records');
  const body = text.slice(start, end);
  assert.equal(Buffer.byteLength(body), 2097152, 'all 2 MiB of normalized real PTY output arrive');
  const lines = body.slice(0, -2).split('\r\n');
  assert.equal(lines.length, 16384);
  lines.forEach((line, index) => { assert.match(line, /^FINITE \d{8} \.{110}$/); assert.equal(Number(line.slice(7, 15)), index, 'finite output order'); });
  return { records: lines.length, first: 0, last: 16383, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') };
}
async function compactViewport(surface) {
  const text = await surface.innerText();
  const rows = text.split('\n');
  const headerRow = rows.findIndex(row => /^SCROLL \d{6}/.test(row));
  return { sequence: headerRow < 0 ? null : Number(rows[headerRow].match(/\d{6}/)[0]), headerRow, text };
}
function viewportAdvanced(before, after) {
  return after.sequence !== null && before.sequence !== null &&
    (after.sequence > before.sequence || after.sequence === before.sequence && after.headerRow < before.headerRow);
}
async function verifyMixedSurfaces({ page, profile, report }) {
  assert.equal(await page.locator('.terminal-surface').count(), profile.terminals, 'every profile terminal surface remains mounted');
  await pane(page, 'Benchmark 2').getByText('file-000000.txt', { exact: true }).waitFor();
  report.correctness.mixedSurfaceReady = { terminalSurfaces: profile.terminals, listingStillVisible: true, entries: profile.entries };
}
async function verifyContinuousOutput({ page, ssh, profile, report }) {
  const streams = await page.evaluate(() => Object.entries(globalThis.__perfTerminalStreams).filter(([, state]) => state.count).map(([sessionId, { tail, ...state }]) => ({ sessionId, ...state })));
  assert.equal(streams.length, profile.outputTerminals);
  const offset = report.runtime.timeOrigin - report.scenario.rendererTimeOrigin;
  const intervals = report.workerEcho
    ? report.workerEcho.map(sample => ({ id: sample.marker, inputAt: sample.sentAtRenderer, endAt: sample.completedAtRenderer, endpoint: 'protocol-completedAt' }))
    : report.samples.map(sample => ({ id: sample.id, inputAt: sample.inputAt + offset, endAt: sample.presentedCaptureAt + offset, endpoint: 'presented-capture-upper-bound' }));
  const rendererToDriver = report.scenario.rendererTimeOrigin - report.driverTimeOrigin;
  const firstInputAt = intervals[0].inputAt + rendererToDriver;
  const lastOutcomeAt = intervals.at(-1).endAt + rendererToDriver;
  const nativeEvents = ssh.events.filter(event => event.native && (event.type === 'shell-open' || event.type === 'shell-close'));
  const activeAtFirstInput = nativeEvents.reduce((count, event) => event.at <= firstInputAt ? count + (event.type === 'shell-open' ? 1 : -1) : count, 0);
  const expectedNative = terminalPath === 'local' || terminalPath === 'jump' ? profile.terminals - 1 : profile.terminals;
  assert.equal(activeAtFirstInput, expectedNative, 'all remaining native profile shells are genuinely open at the first timed action');
  assert.ok(!nativeEvents.some(event => event.at > firstInputAt && event.at <= lastOutcomeAt), 'native profile shells neither close nor reconnect during timed actions');
  report.correctness.nativeShellLifetime = { expectedNative, activeAtFirstInput, firstInputAtDriver: firstInputAt, lastOutcomeAtDriver: lastOutcomeAt, noTransitions: true };
  report.protocolObservations = await page.evaluate(() => globalThis.__terminalProtocol.events);
  report.correctness.continuousStreams = streams;
  report.correctness.outputActivityBrackets = [];
  for (const stream of streams) {
    assert.equal(stream.first, 0);
    assert.deepEqual(stream.violations, []);
    assert.ok(stream.count >= 1000, 'real continuous process emits at least the ten-second warmup output');
    const events = report.protocolObservations.filter(event => event.path === 'pty' && event.sessionId === stream.sessionId);
    for (const interval of intervals) {
      const before = events.findLast(event => event.at <= interval.inputAt);
      const after = events.find(event => event.at >= interval.endAt);
      assert.ok(before && after && interval.inputAt - before.at < 2000 && after.at - interval.endAt < 2000, 'every timed action is bracketed by fresh real continuous output');
      report.correctness.outputActivityBrackets.push({ sessionId: stream.sessionId, ...interval, lastBeforeInputAtRenderer: before.at, firstAfterEndpointAtRenderer: after.at });
    }
  }
}
async function finiteIntegrity(app, page, view, report) {
  await command(app, view, 'bench-bulk');
  await until(async () => (await streamFor(page, 'FINITE 00000000 '))?.text.includes('FINITE-END\r\n'), 'complete finite process output', 60000);
  const stream = await streamFor(page, 'FINITE 00000000 ');
  const finite = verifyFiniteText(stream.text);
  await view.locator('.xterm').filter({ hasText: 'FINITE-END' }).waitFor();
  report.correctness.finite = { ...finite, sessionId: stream.sessionId, protocol: stream.path, visibleEnd: true, scrollbackLimit: 5000 };
}
async function pasteAndInterrupt(app, page, view, report) {
  const paste = "printf 'PASTE-%s\\n' 'alpha beta'; printf 'PASTE-DONE\\n'\n";
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), paste);
  try {
    await view.locator('.xterm-helper-textarea:visible').focus();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.focus(); window.webContents.focus();
      window.webContents.paste();
    });
    await view.locator('.xterm').filter({ hasText: 'PASTE-alpha beta' }).waitFor();
  } finally { await app.evaluate(({ clipboard }) => clipboard.clear()); }
  await command(app, view, "sleep 60; printf 'INTERRUPT-STATUS:%s\\n' \"$?\"");
  await wait(150);
  await nativeInput(app, [{ type: 'keyDown', keyCode: 'C', modifiers: ['control'] }, { type: 'keyUp', keyCode: 'C', modifiers: ['control'] }]);
  await until(async () => (await streamFor(page, 'PASTE-alpha beta'))?.text.includes('\r\nINTERRUPT-STATUS:130\r\n'), 'real foreground process exits from SIGINT');
  await command(app, view, "printf 'INTERRUPT-OK\\n'");
  await until(async () => (await streamFor(page, 'PASTE-alpha beta'))?.text.includes('\r\nINTERRUPT-OK\r\n'), 'Ctrl-C permits the next real foreground command');
  await view.locator('.xterm-rows > div').filter({ hasText: /^INTERRUPT-OK\s*$/ }).waitFor();
  const stream = await streamFor(page, 'PASTE-alpha beta');
  assert.ok(stream.text.includes('PASTE-DONE\r\n'));
  assert.ok(stream.text.includes('\r\nINTERRUPT-STATUS:130\r\n'), 'Ctrl-C interrupts the real foreground process with SIGINT status');
  const trustedPasteObserved = await page.evaluate(() => globalThis.__terminalPasteEvents.some(event => event.isTrusted));
  assert.equal(trustedPasteObserved, true, 'real Electron editing command produces a trusted paste event');
  report.correctness.pasteAndCtrlC = { pasteAction: 'Electron webContents.paste()', trustedPasteObserved, commandsPreserved: true, realForegroundInterrupted: true };
}
async function terminalIsExposed(view) {
  const surface = view.locator('.xterm-screen');
  if (!await surface.isVisible()) return false;
  return surface.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    const terminal = element.closest('.terminal-surface');
    return !!terminal && !!hit && terminal.contains(hit);
  });
}
async function verifyHiddenOutput({ app, page, ssh, report, directory }, view, { name, hide, show }) {
  const ready = `${name}-READY`, marker = `${name}-HIDDEN-ALIVE`;
  assert.ok(await terminalIsExposed(view), 'the real target terminal is exposed before hiding');
  await command(app, view, `bench-hidden ${name}`);
  await until(async () => !!await streamFor(page, `\r\n${ready}\r\n`), 'real producer waits for hidden-output fixture release');
  const opened = ssh.events.filter(event => event.type === 'shell-open').length;
  await hide();
  await until(async () => !await terminalIsExposed(view), 'actual UI hides or covers the terminal');
  const hiddenAtRenderer = await page.evaluate(() => performance.now());
  assert.equal(!!await streamFor(page, `\r\n${marker}\r\n`), false, 'real producer has not emitted before the hidden-state fixture release');
  const fixtureReleaseAtRenderer = await page.evaluate(({ sessionId, protocol }) => {
    const at = performance.now();
    if (protocol === 'pty') window.electronAPI.localPty.write(sessionId, 'release\r');
    else window.electronAPI.ssh.send(sessionId, 'release\r');
    return at;
  }, report.correctness.finite);
  await until(async () => !!await streamFor(page, `\r\n${marker}\r\n`), 'real process emits output while the UI is hidden');
  const outputConfirmedAtRenderer = await page.evaluate(() => performance.now());
  assert.ok(!await terminalIsExposed(view), 'output is confirmed before the UI returns');
  await page.screenshot({ path: path.join(directory, `${terminalPath}-${name.toLowerCase()}-hidden.png`) });
  await show();
  await until(() => terminalIsExposed(view), 'actual UI exposes the original terminal again');
  await view.locator('.xterm-rows > div').filter({ hasText: new RegExp(`^${marker}\\s*$`) }).waitFor();
  await view.locator('.xterm').filter({ hasText: ready }).waitFor();
  assert.equal(ssh.events.filter(event => event.type === 'shell-open').length, opened, 'temporary UI hiding never reconnects a terminal');
  return { sameSession: true, backgroundOutputRetained: true, preHideOutputRetained: true, hiddenAtRenderer, fixtureReleaseAtRenderer, outputConfirmedAtRenderer, controlSeam: `${report.correctness.finite.protocol} public stdin releases a real waiting producer; untimed fixture control, not keyboard or paint latency` };
}
async function resizeAndLifecycle(context, view) {
  const { app, page, ssh, report, directory } = context;
  // Keep real stty stdout in one result frame; shell diagnostics remain visible.
  await command(app, view, "printf 'LIFEPID:%s\\nLIFESIZE:%s\\n' \"$$\" \"$(stty size)\"");
  await until(async () => /LIFEPID:\d+\r\n/.test((await streamFor(page, 'LIFEPID:'))?.text ?? ''), 'actual shell identity');
  const initial = (await streamFor(page, 'LIFEPID:')).text;
  const pid = initial.match(/LIFEPID:(\d+)\r\n/)[1];
  assert.equal(Number(pid), report.correctness.timedShellPid, 'the real target shell survives every timed action before layout changes');
  const size = initial.match(/LIFESIZE:(\d+) (\d+)\r\n/);
  assert.ok(size, 'real PTY reports its initial size');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1100, 850));
  await wait(250);
  await command(app, view, "printf 'RESIZED:%s\\n' \"$(stty size)\"");
  await until(async () => /RESIZED:\d+ \d+\r\n/.test((await streamFor(page, 'LIFEPID:'))?.text ?? ''), 'real PTY resized dimensions');
  const resized = (await streamFor(page, 'LIFEPID:')).text.match(/RESIZED:(\d+) (\d+)\r\n/);
  assert.notEqual(`${size[1]} ${size[2]}`, `${resized[1]} ${resized[2]}`, 'native resize reaches the actual child PTY');
  await command(app, view, "(sleep 1; printf '\\nHIDDEN-ALIVE\\n') &");
  // Only after timed fixed-workload samples, cross real grid/three/split layouts.
  const targetTitle = await view.locator('span.truncate.font-medium').first().innerText();
  const headers = page.getByTitle('Close pane', { exact: true });
  while (await headers.count() > 2) {
    let closed = false;
    for (const button of await headers.all()) {
      const owner = button.locator('xpath=../../..');
      if (!await owner.locator('span').filter({ hasText: new RegExp(`^${targetTitle}$`) }).count()) { await button.click(); closed = true; break; }
    }
    assert.ok(closed, 'find a distinct real pane to close');
  }
  for (const title of ['Split Vertical (Stacked)', 'Split Horizontal (Side by Side)']) await page.getByTitle(title, { exact: true }).click();
  await until(async () => (await streamFor(page, 'LIFEPID:'))?.text.includes('HIDDEN-ALIVE\r\n'), 'same shell continues during layout changes');
  await command(app, view, "printf 'AFTERPID:%s\\n' \"$$\"");
  await until(async () => (await streamFor(page, 'LIFEPID:'))?.text.includes(`AFTERPID:${pid}\r\n`), 'layout retains the original real shell');
  await view.locator('.xterm-rows > div').filter({ hasText: /^HIDDEN-ALIVE\s*$/ }).waitFor();
  await view.locator('.xterm').filter({ hasText: `LIFEPID:${pid}` }).waitFor();
  report.correctness.lifecycle = { pid, size: [Number(size[1]), Number(size[2])], resized: [Number(resized[1]), Number(resized[2])], sameShellAfterLayout: true, backgroundOutputRetained: true, preLayoutOutputRetained: true };
  await page.screenshot({ path: path.join(directory, `${terminalPath}-layout-preserved.png`) });
  report.correctness.beforeClose = ssh.resources();
  await view.getByTitle('Close pane', { exact: true }).click();
  await view.waitFor({ state: 'detached' });
  await until(() => { try { process.kill(Number(pid), 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } }, 'true close releases the real shell process');
  if (terminalPath === 'jump') await until(() => ssh.resources().forwards === 0, 'true close releases the real Jump Host forwarding socket');
  report.correctness.afterClose = ssh.resources();
  report.correctness.lifecycle.closedPidExited = true;
}
async function workerProtocol(context) {
  const { page, ssh, report } = context;
  const workersBefore = await context.app.evaluate(() => global.__ownshellBenchmark.metrics().at(-1)?.workers.length ?? 0);
  const result = await page.evaluate(async () => {
    const host = (await window.electronAPI.hosts.getAll()).find(host => host.label === 'Benchmark 3');
    const response = await window.electronAPI.ssh.connect({ hostId: host.id, hostname: host.hostname, port: host.port, username: host.username, authType: 'password' });
    if (!response.success) throw new Error(JSON.stringify(response));
    return response;
  });
  try {
    await until(async () => (await context.app.evaluate(() => global.__ownshellBenchmark.metrics().at(-1)?.workers.length ?? 0)) > workersBefore, 'real worker thread resource starts');
    await page.evaluate(sessionId => window.electronAPI.ssh.send(sessionId, 'bench-bulk\r'), result.sessionId);
    await until(async () => (await page.evaluate(id => globalThis.__terminalProtocol.streams[`ssh2:${id}`]?.text, result.sessionId))?.includes('FINITE-END\r\n'), 'direct ssh2 worker complete finite output', 60000);
    const data = await page.evaluate(id => globalThis.__terminalProtocol.streams[`ssh2:${id}`], result.sessionId);
    const finite = verifyFiniteText(data.text);
    report.correctness.worker = { ...finite, sessionId: result.sessionId, ordered: true, seam: 'public ssh.connect/send/onData; not terminal UI or pixel timing' };
    await page.evaluate(id => window.electronAPI.ssh.send(id, "printf 'WORKER-PASTE:%s\\n' 'alpha beta'\r"), result.sessionId);
    await until(() => page.evaluate(id => globalThis.__terminalProtocol.streams[`ssh2:${id}`]?.text.includes('\r\nWORKER-PASTE:alpha beta\r\n'), result.sessionId), 'worker full paste contents');
    await page.evaluate(id => window.electronAPI.ssh.send(id, "sleep 60; printf 'WORKER-INTERRUPT-STATUS:%s\\n' \"$?\"\r"), result.sessionId);
    await wait(150);
    const interruptOffset = await page.evaluate(id => globalThis.__terminalProtocol.streams[`ssh2:${id}`].text.length, result.sessionId);
    await page.evaluate(id => window.electronAPI.ssh.send(id, '\x03'), result.sessionId);
    await until(() => page.evaluate(({ id, offset }) => globalThis.__terminalProtocol.streams[`ssh2:${id}`]?.text.slice(offset).includes('benchmark-real$ '), { id: result.sessionId, offset: interruptOffset }), 'worker real shell prompt after Ctrl-C');
    await page.evaluate(id => window.electronAPI.ssh.send(id, "printf 'WORKER-INTERRUPT-OK\\n'\r"), result.sessionId);
    await until(() => page.evaluate(id => globalThis.__terminalProtocol.streams[`ssh2:${id}`]?.text.includes('\r\nWORKER-INTERRUPT-OK\r\n'), result.sessionId), 'worker real foreground Ctrl-C');
    await page.evaluate(id => window.electronAPI.ssh.resize(id, 93, 31), result.sessionId);
    await page.evaluate(id => window.electronAPI.ssh.send(id, "printf 'WORKER-SIZE:%s\\n' \"$(stty size)\"\r"), result.sessionId);
    await until(() => page.evaluate(id => globalThis.__terminalProtocol.streams[`ssh2:${id}`]?.text.includes('WORKER-SIZE:31 93\r\n'), result.sessionId), 'worker resize reaches real PTY');
    const semanticText = await page.evaluate(id => globalThis.__terminalProtocol.streams[`ssh2:${id}`].text, result.sessionId);
    assert.ok(semanticText.includes('\r\nWORKER-INTERRUPT-STATUS:130\r\n'), 'real worker foreground process exits from SIGINT');
    Object.assign(report.correctness.worker, { pastePreserved: true, realForegroundInterrupted: true, actualResizedRows: 31, actualResizedCols: 93 });
    report.workerEcho = [];
    for (let sample = 0; sample < 30; sample++) {
      const marker = `WORKER-ECHO-${sample}`;
      const echo = await withMixedTransferGuard(context, async () => {
        const at = await page.evaluate(({ sessionId, marker }) => { const at = performance.now(); window.electronAPI.ssh.send(sessionId, `printf '${marker}\\n'\r`); return at; }, { sessionId: result.sessionId, marker });
        await until(() => page.evaluate(({ sessionId, marker }) => globalThis.__terminalProtocol.streams[`ssh2:${sessionId}`]?.markers[marker] !== undefined, { sessionId: result.sessionId, marker }), 'real worker echo');
        const completedAt = await page.evaluate(({ sessionId, marker }) => globalThis.__terminalProtocol.streams[`ssh2:${sessionId}`].markers[marker], { sessionId: result.sessionId, marker });
        return { marker, sentAtRenderer: at, completedAtRenderer: completedAt, durationMs: completedAt - at, method: 'renderer public send to first public protocol callback containing complete echo; includes network/remote shell/main/worker scheduling, no paint claim' };
      }, sample => ({
        inputAt: sample.sentAtRenderer + report.scenario.rendererTimeOrigin - report.driverTimeOrigin,
        completedAt: sample.completedAtRenderer + report.scenario.rendererTimeOrigin - report.driverTimeOrigin,
      }));
      report.workerEcho.push(echo);
      await wait(schedule.actionIntervalMs);
    }
  } finally { await page.evaluate(id => window.electronAPI.ssh.disconnect(id), result.sessionId); }
  await until(() => ssh.resources().processes === report.processesBeforeWorker, 'worker process closes');
  report.correctness.worker.closedProcessReleased = true;
  await until(async () => (await context.app.evaluate(() => global.__ownshellBenchmark.metrics().at(-1)?.workers.length ?? 0)) <= workersBefore, 'real worker thread resource terminates');
  report.correctness.worker.workerThreadsBefore = workersBefore;
  report.correctness.worker.workerThreadsAfter = await context.app.evaluate(() => global.__ownshellBenchmark.metrics().at(-1).workers.length);
  report.summary['worker-protocol-echo'] = quantiles(report.workerEcho, Infinity);
  const messages = await context.app.evaluate(() => global.__ownshellBenchmark.workerMessages());
  assert.ok(messages.some(message => message.type === 'send' && message.direction === 'send'), 'direct ssh2 path sends through the real worker');
  report.correctness.worker.workerSchedulingObserved = true;
}
async function terminalScenario(context) {
  const { app, page, ssh, profile, root, directory, report } = context;
  report.scenario = { issue: 3, terminalPath, output: 'real local PTY-backed /bin/sh; bench-output real process: 10 x 128-byte PTY lines / 100ms', finite: '16384 numbered records; no artificial output replies', transferBytes: schedule.transferBytes, samplesPerAction: 30 };
  report.scenario.rendererTimeOrigin = await page.evaluate(() => performance.timeOrigin);
  report.scenario.scrollTimingDataset = '1000 existing compact SCROLL lines in the same buffer; wrapped 2 MiB integrity and retained history checked separately, not wrapped-line latency';
  report.scenario.frameAcquisition = terminalPath === 'worker' ? 'public protocol only; no frame measurement' : captureAfterOutcome ? 'v2 sequential4ms plus one semantic-outcome readback per UI action; mode=sequential-plus-outcome v1; actual native callback timestamps' : 'v2 sequential4ms';
  if (captureAfterOutcome && terminalPath !== 'worker') report.limitations.push('Optional outcome-correlated frame sampling is a different observer mode from pure sequential v2; no cross-observer product speedup is claimed. Native input, region, dataset, matcher and targets are unchanged.');
  if (terminalPath === 'jump') report.scenario.jumpTopology = 'Two separate real SSH handshakes to one loopback listener, connected through direct-tcpip forwarding; no worker or simulated target.';
  if (terminalPath === 'worker') report.scenario.additionalProtocolProbeShells = 1;
  const env = seedCommands(root);
  ssh.enableProcessCommands({ cwd: root, env });
  ssh.allowForwardTo(ssh.port);
  await observeProtocol(page);
  await runMixed({ ...context, interactive: true });
  // Mirror the global baseline's terminal-switch state: the real profile-sized
  // editor has been edited/saved/closed, not omitted from renderer load.
  const editorReads = ssh.events.length;
  const editorStarted = performance.now();
  await pane(page, 'Benchmark 1').getByRole('button', { name: 'Files', exact: true }).click();
  await pane(page, 'Benchmark 1').getByText('editor.txt', { exact: true }).dblclick();
  await page.locator('.cm-content').waitFor();
  await page.waitForFunction(() => document.querySelector('.cm-line')?.textContent.includes('LINE 00000000'));
  const editorBytes = ssh.events.slice(editorReads).filter(event => event.type === 'file-read' && event.path === '/editor.txt').reduce((sum, event) => sum + event.bytes, 0);
  assert.equal(editorBytes, profile.textBytes, 'full profile-sized real editor read');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home');
  await nativeInput(app, textEvents('X'));
  await page.waitForFunction(() => document.querySelector('.cm-line')?.textContent.startsWith('XLINE 00000000'));
  await nativeInput(app, [{ type: 'keyDown', keyCode: 'S', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'S', modifiers: ['meta'] }]);
  await page.locator('.cm-content').waitFor({ state: 'detached' });
  const saved = await sftpRead(ssh, '/editor.txt');
  assert.deepEqual(saved, Buffer.concat([Buffer.from('X'), text(profile.textBytes)]), 'real full editor save/reread before terminal measurement');
  report.correctness.preparationEditSave = { bytes: saved.length, sha256: createHash('sha256').update(saved).digest('hex') };
  report.loads.push({ kind: 'profile-editor-edit-save-close', bytes: editorBytes, durationMs: performance.now() - editorStarted, endpoint: 'real editor edited/saved/reread then closed; not paint timing or concurrently visible editor' });
  if (terminalPath === 'worker') {
    await verifyMixedSurfaces(context);
    await app.evaluate(() => global.__ownshellBenchmark.markPhase('worker-protocol'));
    report.processesBeforeWorker = ssh.resources().processes;
    await workerProtocol(context);
    await verifyContinuousOutput(context);
    return;
  }
  let view = pane(page, 'Benchmark 3');
  if (terminalPath === 'local' || terminalPath === 'jump') {
    await view.getByTitle('Close pane', { exact: true }).click();
    if (terminalPath === 'local') {
      await page.getByRole('button', { name: 'Local', exact: true }).click();
      view = pane(page, 'Local Terminal');
      await view.locator('.xterm').filter({ hasText: 'benchmark-local$' }).waitFor();
    } else {
      const startedAt = ssh.events.length;
      view = await addJump(page, ssh);
      const forwarding = ssh.events.slice(startedAt).find(event => event.type === 'forward-open' && event.port === ssh.port);
      assert.ok(forwarding, 'Jump Host UI creates a real direct-tcpip channel');
      report.correctness.jumpRouting = { actualDirectTcpip: true, destination: '127.0.0.1', port: forwarding.port, openedAt: forwarding.at };
    }
  } else {
    await view.getByRole('button', { name: 'Terminal', exact: true }).click();
  }
  await verifyMixedSurfaces(context);
  await app.evaluate((_electron, phase) => global.__ownshellBenchmark.markPhase(phase), `${terminalPath}-finite-paste-signal-correctness`);
  await finiteIntegrity(app, page, view, report);
  assert.equal(report.correctness.finite.protocol, terminalPath === 'jump' ? 'ssh2' : 'pty', 'finite output traverses the actual shipped terminal backend');
  await pasteAndInterrupt(app, page, view, report);
  await command(app, view, "printf 'TIMEDPID:%s\\n' \"$$\"");
  await until(async () => /TIMEDPID:\d+\r\n/.test((await streamFor(page, 'TIMEDPID:'))?.text ?? ''), 'real target shell identity before timed actions');
  report.correctness.timedShellPid = Number((await streamFor(page, 'TIMEDPID:')).text.match(/TIMEDPID:(\d+)\r\n/)[1]);
  await command(app, view, 'bench-lines');
  await view.locator('.xterm').filter({ hasText: 'SCROLL-END' }).waitFor();
  const surface = view.locator('.xterm-screen');
  const scrollBox = await surface.boundingBox();
  // xterm 6 owns a custom scrollable element; the legacy viewport's DOM
  // scrollTop does not move its buffer. Navigate through real wheel input.
  await nativeInput(app, [
    { type: 'mouseMove', x: Math.round(scrollBox.x + 30), y: Math.round(scrollBox.y + 40) },
    { type: 'mouseWheel', x: Math.round(scrollBox.x + 30), y: Math.round(scrollBox.y + 40), deltaX: 0, deltaY: 100000, wheelTicksY: 100000 / 120, canScroll: true },
  ]);
  await until(async () => /FINITE \d{8}/.test(await surface.innerText()), 'native wheel reaches retained finite scrollback');
  report.correctness.scrollbackStart = await surface.innerText();
  assert.match(report.correctness.scrollbackStart, /FINITE \d{8}/, 'real xterm scrollback retains numbered finite output before later commands');
  await command(app, view, "printf 'SCROLL-ANCHOR\\n'");
  await view.locator('.xterm-rows > div').filter({ hasText: /^SCROLL-ANCHOR\s*$/ }).waitFor();
  await nativeInput(app, [
    { type: 'mouseMove', x: Math.round(scrollBox.x + 30), y: Math.round(scrollBox.y + 40) },
    { type: 'mouseWheel', x: Math.round(scrollBox.x + 30), y: Math.round(scrollBox.y + 40), deltaX: 0, deltaY: 15000, wheelTicksY: 15000 / 120, canScroll: true },
  ]);
  await until(async () => {
    const anchor = await compactViewport(surface);
    return anchor.sequence !== null && anchor.sequence < 800;
  }, 'native wheel reaches compact numbered history with room for all samples');
  report.correctness.compactScrollStart = await compactViewport(surface);
  await app.evaluate((_electron, phase) => global.__ownshellBenchmark.markPhase(phase), `${terminalPath}-scroll`);
  const box = await surface.boundingBox();
  const region = { x: Math.ceil(box.x + 2), y: Math.ceil(box.y + 20), width: Math.floor(Math.min(350, box.width - 10)), height: Math.floor(Math.min(90, box.height - 30)) };
  for (let sample = 0; sample < 30; sample++) {
    const beforeAnchor = await compactViewport(surface);
    assert.notEqual(beforeAnchor.sequence, null, 'visible numbered scrollback anchor before native wheel');
    const beforeRows = captureAfterOutcome ? await surface.locator('.xterm-rows').textContent() : null;
    const result = await measureMixedFrame(context, { app, page, directory, id: `${terminalPath}-scroll-${sample}`, kind: 'scroll', region, captureAfterOutcome,
      action: () => nativeWheel(app, box.x + 30, box.y + 40, { wheelTicksY: -1.5 }),
      outcome: async () => {
        if (captureAfterOutcome) await waitForChangedRowsFrame(surface, beforeRows);
        await until(async () => viewportAdvanced(beforeAnchor, await compactViewport(surface)), 'native terminal scroll advances numbered physical rows');
      },
      finalOutcome: async () => {
        const afterAnchor = await compactViewport(surface);
        assert.ok(viewportAdvanced(beforeAnchor, afterAnchor) && afterAnchor.sequence < 1000, 'native wheel advances the existing compact numbered output');
        return { beforeAnchor, afterAnchor };
      },
    });
    result.terminalPath = terminalPath; report.samples.push(result); await wait(schedule.actionIntervalMs);
  }
  if (terminalPath !== 'local') {
    await app.evaluate((_electron, phase) => global.__ownshellBenchmark.markPhase(phase), `${terminalPath}-warm-tab-switch`);
    await view.getByRole('button', { name: 'Files', exact: true }).click();
    await view.getByText('editor.txt', { exact: true }).waitFor();
    await view.getByRole('button', { name: 'Terminal', exact: true }).click();
    const surfaceBox = await view.locator('.terminal-surface:visible').boundingBox();
    const switchRegion = { x: Math.ceil(surfaceBox.x + 5), y: Math.ceil(surfaceBox.y + 5), width: Math.floor(Math.min(350, surfaceBox.width - 15)), height: Math.floor(Math.min(100, surfaceBox.height - 15)) };
    for (let sample = 0; sample < 30; sample++) {
      const target = sample % 2 ? 'Terminal' : 'Files';
      const result = await measureMixedFrame(context, { app, page, directory, id: `${terminalPath}-switch-${sample}`, kind: 'warm-tab-switch', region: switchRegion,
        action: () => nativeClick(app, view.getByRole('button', { name: target, exact: true })),
        outcome: () => target === 'Terminal' ? view.locator('.xterm:visible').waitFor() : view.getByText('editor.txt', { exact: true }).waitFor(),
      });
      result.terminalPath = terminalPath; report.samples.push(result); await wait(schedule.actionIntervalMs);
    }
  }
  await view.getByRole('button', { name: 'Terminal', exact: true }).click();
  await command(app, view, "printf 'ECHO-READY\\n'");
  await view.locator('.xterm-rows > div').filter({ hasText: /^ECHO-READY\s*$/ }).waitFor();
  const rows = view.locator('.xterm-rows > div');
  const echoBox = await rows.nth(await rows.count() - 2).boundingBox();
  // The response row precedes the final prompt: exclude its blinking cursor.
  const echoRegion = terminalOutputRowRegion(echoBox);
  const echoKind = terminalPath === 'local' ? 'terminal-local-process-echo' : 'terminal-remote-echo';
  await app.evaluate((_electron, phase) => global.__ownshellBenchmark.markPhase(phase), `${terminalPath}-echo`);
  for (let sample = 0; sample < 30; sample++) {
    const marker = `E${String(sample).padStart(2, '0')}`;
    const result = await measureMixedFrame(context, { app, page, directory, id: `${terminalPath}-echo-${sample}`, kind: echoKind, region: echoRegion,
      action: () => command(app, view, `printf '${marker}\\n'`),
      outcome: () => view.locator('.xterm-rows > div').filter({ hasText: new RegExp(`^${marker}\\s*$`) }).waitFor(),
    });
    const stream = await streamFor(page, `\r\n${marker}\r\n`);
    assert.ok(stream?.markers[marker], 'complete remote response is observed independently of its displayed command');
    const rendererOrigin = await page.evaluate(() => performance.timeOrigin);
    const receivedAt = stream.markers[marker] + rendererOrigin - report.runtime.timeOrigin;
    const observedAt = result.trustedInput.timeOrigin + result.trustedInput.observedAt - report.runtime.timeOrigin;
    result.stages = { nativeDispatchToDomListenerMs: observedAt - result.inputAt, domEventQueueMs: result.trustedInput.observedAt - result.trustedInput.at, dispatchToCompleteProtocolEchoMs: receivedAt - result.inputAt, protocolReceiptToPresentedUpperBoundMs: result.presentedCaptureAt - receivedAt };
    result.terminalPath = terminalPath; report.samples.push(result);
    await wait(schedule.actionIntervalMs);
  }
  if (captureAfterOutcome) {
    for (const sample of report.samples) {
      assert.equal(sample.captureStats.mode, 'sequential-plus-outcome', `${sample.id}: requested observer mode is actually active`);
      assert.equal(sample.captureStats.modeVersion, 1, `${sample.id}: supported outcome observer version`);
      assert.equal(sample.captureStats.outcomeReadbacks, 1, `${sample.id}: exactly one actual outcome readback`);
    }
  }
  report.summary.scroll = quantiles(report.samples.filter(s => s.kind === 'scroll'), profile.inputTargetMs);
  report.summary['warm-tab-switch'] = terminalPath === 'local'
    ? { applicable: false, reason: 'Local has no Files tab; Docker is intentionally not opened against unrelated daemon data.' }
    : quantiles(report.samples.filter(s => s.kind === 'warm-tab-switch'), profile.switchTargetMs);
  report.summary[echoKind] = quantiles(report.samples.filter(s => s.kind === echoKind), Infinity);
  await verifyContinuousOutput(context);
  report.longTasks = await page.evaluate(() => globalThis.__perfLongTasks);
  report.limitations.push('Direct ssh2 worker terminal is not selectable in the shipped direct-host UI: its public protocol correctness/echo evidence is separate, never terminal pixel timing.');
  report.limitations.push('Protocol-receipt to presented image combines renderer buffering, xterm parsing/rendering and compositor/capture; no unsupported pure-xterm or pure-network latency is inferred.');
  await app.evaluate((_electron, phase) => global.__ownshellBenchmark.markPhase(phase), `${terminalPath}-hidden-output-correctness`);
  if (terminalPath !== 'local') {
    report.correctness.featureHide = await verifyHiddenOutput(context, view, {
      name: 'FEATURE',
      hide: async () => {
        await nativeClick(app, view.getByRole('button', { name: 'Files', exact: true }));
        await view.getByText('editor.txt', { exact: true }).waitFor();
      },
      show: () => nativeClick(app, view.getByRole('button', { name: 'Terminal', exact: true })),
    });
  }
  report.correctness.workspaceHide = await verifyHiddenOutput(context, view, {
    name: 'WORKSPACE',
    hide: async () => {
      await nativeClick(app, page.getByTitle('Settings', { exact: true }));
      await page.getByRole('button', { name: 'Close Settings', exact: true }).waitFor();
    },
    show: () => nativeClick(app, page.getByRole('button', { name: 'Close Settings', exact: true })),
  });
  await app.evaluate((_electron, phase) => global.__ownshellBenchmark.markPhase(phase), `${terminalPath}-resize-layout-close`);
  await resizeAndLifecycle(context, view);
  for (const [kind, summary] of Object.entries(report.summary)) {
    if (!Number.isFinite(summary.targetMs)) continue;
    assert.ok(summary.p95 <= summary.targetMs, `${terminalPath} ${report.profile} ${kind} p95 ${summary.p95}ms exceeds ${summary.targetMs}ms`);
  }
}
async function scenario(context) {
  try { return await terminalScenario(context); }
  finally {
    try {
      context.report.protocolObservations = await context.page.evaluate(() => globalThis.__terminalProtocol?.events);
      context.report.terminalDiagnostics = await context.page.evaluate(() => ({
        activeElement: { tag: document.activeElement?.tagName, className: document.activeElement?.className },
        streams: Object.values(globalThis.__terminalProtocol?.streams ?? {}).map(({ path, sessionId, text }) => ({ path, sessionId, bytes: new TextEncoder().encode(text).length, tail: text.slice(-2048) })),
      }));
      context.report.longTasks = await context.page.evaluate(() => globalThis.__perfLongTasks);
      context.report.eventTimings = await context.page.evaluate(() => globalThis.__perfEvents);
      context.report.trustedInputs = await context.page.evaluate(() => globalThis.__perfTrusted);
      await context.page.screenshot({ path: path.join(context.directory, 'terminal-final.png') });
    } catch (error) { context.report.terminalDiagnosticsError = error.message; }
  }
}
if (require.main === module) {
  (async () => {
    assert.ok(['native', 'local', 'jump', 'worker'].includes(terminalPath), 'choose a shipped terminal path');
    for (const profile of option('--profile', 'all') === 'all' ? ['everyday', 'stress'] : [option('--profile')]) await runProfile(profile, scenario);
  })().catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { scenario };
