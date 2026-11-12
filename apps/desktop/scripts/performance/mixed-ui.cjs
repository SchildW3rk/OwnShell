'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Client } = require('ssh2');
const { measure: measureFrame } = require('./measure.cjs');
const { schedule, quantiles, text, transferChunk } = require('./workloads.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const integerRect = box => ({ x: Math.ceil(box.x), y: Math.ceil(box.y), width: Math.floor(box.width), height: Math.floor(box.height) });
function terminalOutputRowRegion(box) {
  return integerRect({ x: box.x, y: box.y, width: Math.min(700, box.width - 24), height: box.height });
}
async function nativeInput(app, events) { return app.evaluate((_electron, events) => global.__ownshellBenchmark.input(events), events); }
function textEvents(text) {
  return [...text].flatMap(char => {
    const modifiers = /[A-Z]/.test(char) ? ['shift'] : [];
    return [{ type: 'keyDown', keyCode: char.toUpperCase(), modifiers }, { type: 'char', keyCode: char, modifiers }, { type: 'keyUp', keyCode: char.toUpperCase(), modifiers }];
  });
}
async function nativeClick(app, locator) {
  const box = await locator.boundingBox();
  const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  return nativeInput(app, [{ type: 'mouseMove', ...point }, { type: 'mouseDown', button: 'left', clickCount: 1, ...point }, { type: 'mouseUp', button: 'left', clickCount: 1, ...point }]);
}
function nativeWheel(app, x, y, options) {
  const wheel = { type: 'mouseWheel', x: Math.round(x), y: Math.round(y), deltaX: 0, deltaY: -180, canScroll: true };
  if (options?.wheelTicksY !== undefined) wheel.wheelTicksY = options.wheelTicksY;
  return nativeInput(app, [{ type: 'mouseMove', x: wheel.x, y: wheel.y }, wheel]);
}
async function until(predicate, description, timeout = 30000) {
  const deadline = performance.now() + timeout;
  while (!(await predicate())) { if (performance.now() > deadline) throw new Error(`Timed out: ${description}`); await wait(50); }
}
async function scrollSnapshot(locator, rows) {
  return locator.evaluate((element, rows) => {
    const viewport = element.getBoundingClientRect();
    const top = viewport.top + (rows === 'tbody tr' ? element.querySelector('thead')?.getBoundingClientRect().height ?? 0 : 0);
    const row = [...element.querySelectorAll(rows)].find(row => { const box = row.getBoundingClientRect(); return box.bottom > top + 1 && box.top < viewport.bottom; });
    const anchor = row?.textContent.trim() ?? '';
    const match = anchor.match(/(?:LINE |file-)(\d+)/);
    return { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, anchor, index: match ? Number(match[1]) : -1 };
  }, rows);
}
async function verifyFinalScroll(locator, rows, before, count) {
  const after = await scrollSnapshot(locator, rows);
  assert.ok(after.scrollTop > before.scrollTop, 'native scroll must move downward');
  assert.ok(after.scrollTop >= 0 && after.scrollTop <= after.scrollHeight - after.clientHeight + 1, 'native scroll must stay within valid bounds');
  assert.ok(after.index > before.index && after.index < count, 'expected numbered document/row anchor must advance');
  return { before, after, requestedNativeDeltaY: -180 };
}
function pane(page, index) { return page.locator('span').filter({ hasText: new RegExp(`^Benchmark ${index}$`) }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) }); }
async function selectHost(page, index) {
  if (await pane(page, index).count()) await pane(page, index).locator('span').filter({ hasText: new RegExp(`^Benchmark ${index}$`) }).click();
  else await page.getByRole('button', { name: `Benchmark ${index}`, exact: true }).click();
}
async function terminal(page, index) { await pane(page, index).getByRole('button', { name: 'Terminal', exact: true }).click(); return pane(page, index).locator('.xterm-helper-textarea:visible'); }
async function connectHost(page, ssh, index) {
  await selectHost(page, index);
  const input = await terminal(page, index);
  await pane(page, index).locator('.xterm').filter({ hasText: 'password:' }).waitFor();
  await input.focus(); await page.keyboard.type(ssh.password); await page.keyboard.press('Enter');
  await until(() => ssh.events.filter(e => e.type === 'shell-open' && e.native).length >= index, `native terminal ${index} shell`);
  await page.keyboard.type(`marker-${index}`); await page.keyboard.press('Enter');
  if (index <= ssh.profile.outputTerminals) { await page.keyboard.type('bench-output'); await page.keyboard.press('Enter'); }
}
async function sftpRead(ssh, remotePath) {
  const client = new Client();
  try {
    await new Promise((resolve, reject) => { client.once('ready', resolve).once('error', reject).connect({ host: '127.0.0.1', port: ssh.port, username: 'benchmark', password: ssh.password }); });
    const sftp = await new Promise((resolve, reject) => client.sftp((error, sftp) => error ? reject(error) : resolve(sftp)));
    return await new Promise((resolve, reject) => sftp.readFile(remotePath, (error, bytes) => error ? reject(error) : resolve(bytes)));
  } finally { client.end(); }
}
async function queueTransfers(page, root) {
  const view = pane(page, 1);
  await view.getByRole('button', { name: 'Files', exact: true }).click();
  await view.getByText('editor.txt', { exact: true }).waitFor();
  // Navigate the real local filesystem UI to the isolated destination before queuing.
  for (const part of fs.realpathSync(path.join(root, 'downloads')).split('/').filter(Boolean)) {
    await view.locator('table').first().getByText(part, { exact: true }).dblclick();
    await wait(60);
  }
  for (const name of ['transfer-a.bin', 'transfer-b.bin']) {
    await view.getByText(name, { exact: true }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Copy to other pane', exact: true }).click();
  }
  await page.getByRole('button', { name: /^Transfers/ }).click();
  await page.getByText('transfer-a.bin', { exact: true }).last().waitFor();
  await page.getByText('transfer-b.bin', { exact: true }).last().waitFor();
  await page.screenshot({ path: path.join(root, 'transfers-active.png') });
  await page.getByRole('button', { name: /^Transfers/ }).click();
}
async function openEditor(page, report, repetition) {
  await selectHost(page, 1);
  await pane(page, 1).getByRole('button', { name: 'Files', exact: true }).click();
  const start = performance.now();
  await pane(page, 1).getByText('editor.txt', { exact: true }).dblclick();
  await page.locator('.cm-content').waitFor();
  await page.waitForFunction(() => document.querySelector('.cm-content')?.textContent.includes('LINE 00000000'));
  report.loads.push({ kind: repetition ? 'warm-editor-open' : 'cold-editor-open', repetition, durationMs: performance.now() - start });
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Meta+ArrowUp');
  await page.keyboard.press('Home');
}
async function withMixedTransferGuard({ ssh }, action, intervalOf) {
  const background = ['transfer-a.bin', 'transfer-b.bin'].map(name => {
    const remotePath = '/' + name;
    const last = ssh.events.findLast(e => e.type === 'transfer-read' && e.path === remotePath);
    assert.ok(last && performance.now() - last.at < 2000, `transfer ${name} must be doing real background work`);
    assert.ok(!ssh.events.some(e => e.type === 'file-close' && e.path === remotePath), `transfer ${name} must remain active throughout samples`);
    return { name, lastReadAt: last.at, lastOffset: last.offset };
  });
  const result = await action();
  const interval = intervalOf(result);
  const completionKind = 'completedAt' in interval ? 'completion' : 'presentation';
  const completedAt = completionKind === 'completion' ? interval.completedAt : interval.presentedAt;
  for (const transfer of background) {
    const path = '/' + transfer.name;
    const first = ssh.events.find(e => e.type === 'transfer-read' && e.path === path);
    const closed = ssh.events.find(e => e.type === 'file-close' && e.path === path);
    assert.ok(first && first.at <= interval.inputAt, `${transfer.name} must already be transferring at actual input`);
    assert.ok(!closed || closed.at > completedAt, `${transfer.name} must not complete during any input-to-${completionKind} interval`);
    transfer.lifecycleOverlap = { ...interval, firstReadAt: first.at, closedAt: closed?.at ?? null };
  }
  return { ...result, background };
}
async function measureMixedFrame(context, options) {
  const { report } = context;
  return withMixedTransferGuard(context, () => measureFrame(options), result => ({
    inputAt: result.inputAt + report.runtime.timeOrigin - report.driverTimeOrigin,
    presentedAt: result.presentedCaptureAt + report.runtime.timeOrigin - report.driverTimeOrigin,
  }));
}
async function measureTerminalEcho(context, repetition) {
  const { app, page, ssh, directory, report } = context;
  await terminal(page, 3);
  const rows = pane(page, 3).locator('.xterm-rows:visible');
  report.echoMeasurement = { target: 'Rendered fixture ECHO output row', excludes: 'Independently blinking cursor on the following active prompt and native scrollbar chrome; cursor/scrollbar behavior is unchanged' };
  for (let sample = 0; sample < schedule.terminalEchoSamplesPerRepetition; sample++) {
    const command = `echo-${repetition}-${sample}`;
    await nativeClick(app, pane(page, 3).locator('.xterm-screen:visible'));
    await rows.locator('.xterm-cursor').waitFor({ state: 'attached' });
    const target = await rows.evaluate(element => {
      const rows = [...element.children];
      const cursor = element.querySelector('.xterm-cursor');
      const current = rows.findIndex(row => row.contains(cursor));
      if (current < 0 || rows.length < 2) throw new Error('Fixture echo needs a rendered terminal cursor and output row');
      const index = Math.min(current + 1, rows.length - 2);
      const box = rows[index].getBoundingClientRect();
      return { index, x: box.x, y: box.y, width: box.width, height: box.height };
    });
    const result = await measureMixedFrame(context, {
      app, page, directory, id: `r${repetition}-terminal-echo-${sample}`, kind: 'terminal-remote-echo', region: terminalOutputRowRegion(target),
      action: () => nativeInput(app, [...textEvents(command), { type: 'keyDown', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }]),
      outcome: async () => {
        await until(() => ssh.events.some(event => event.type === 'echo' && event.text === command), 'real remote shell command echo');
        await until(async () => (await rows.locator(':scope > div').nth(target.index).textContent()).includes(`ECHO ${command}`), 'rendered fixture echo output row');
      },
    });
    result.echoOutputRow = target.index;
    report.samples.push(result);
  }
}

async function runMixed(context) {
  const { app, page, ssh, profile, root, directory, report, interactive } = context;
  ssh.profile = profile;
  await page.evaluate(() => {
    globalThis.__perfLongTasks = []; globalThis.__perfEvents = [];
    new PerformanceObserver(list => globalThis.__perfLongTasks.push(...list.getEntries().map(e => ({ startTime: e.startTime, duration: e.duration, name: e.name })))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(list => globalThis.__perfEvents.push(...list.getEntries().map(e => ({ name: e.name, startTime: e.startTime, duration: e.duration, processingStart: e.processingStart, processingEnd: e.processingEnd, interactionId: e.interactionId })))).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    globalThis.__perfTrusted = [];
    for (const type of ['keydown', 'wheel', 'pointerdown']) addEventListener(type, e => globalThis.__perfTrusted.push({ type, isTrusted: e.isTrusted, at: e.timeStamp, observedAt: performance.now(), timeOrigin: performance.timeOrigin }), { capture: true, passive: true });
    globalThis.__perfTerminalStreams = {};
    globalThis.__perfStopTerminalObserver = window.electronAPI.localPty.onData(event => {
      const state = globalThis.__perfTerminalStreams[event.sessionId] ??= { tail: '', first: null, last: null, count: 0, violations: [] };
      const bytes = state.tail + event.data;
      let consumed = 0;
      for (const match of bytes.matchAll(/BENCH (\d{10}) /g)) {
        const sequence = Number(match[1]);
        if (state.last !== null && sequence !== state.last + 1 && state.violations.length < 10) state.violations.push({ previous: state.last, next: sequence });
        state.first ??= sequence; state.last = sequence; state.count++;
        consumed = match.index + match[0].length;
      }
      state.tail = bytes.slice(consumed).slice(-128);
    });
  });
  for (let index = 1; index <= profile.terminals; index++) await connectHost(page, ssh, index);
  // The standalone transfer surface owns the queue's real SFTP connection.
  const priorListings = ssh.events.filter(e => e.type === 'list-start').length;
  await page.getByRole('button', { name: 'File Transfer', exact: true }).click();
  await page.getByRole('button', { name: 'Benchmark 1', exact: true }).click();
  await until(() => ssh.events.filter(e => e.type === 'list-start').length > priorListings, 'standalone SFTP fixture readiness');
  await page.getByRole('button', { name: 'Servers', exact: true }).click();
  await selectHost(page, 1); await queueTransfers(page, root);
  await until(() => ['transfer-a.bin', 'transfer-b.bin'].every(name => ssh.events.some(e => e.type === 'transfer-read' && e.path === '/' + name)), 'both real queued transfers active');
  await selectHost(page, 2); await pane(page, 2).getByRole('button', { name: 'Files', exact: true }).click();
  const listingStart = performance.now();
  await pane(page, 2).getByText('listing', { exact: true }).dblclick();
  await pane(page, 2).getByText('file-000000.txt', { exact: true }).waitFor();
  await until(() => ssh.events.some(e => e.type === 'list-end' && e.path === '/listing' && e.entries === profile.entries), 'complete real protocol listing', 120000);
  report.loads.push({ kind: 'cold-directory-open', entries: profile.entries, endpoint: 'listing complete and first row ready, not paint', durationMs: performance.now() - listingStart });
  const listingScroller = pane(page, 2).locator('table').last().locator('..');
  report.correctness.listingAnchors = [];
  for (const [fraction, index] of [[0, 0], [.5, Math.floor(profile.entries / 2)], [1, profile.entries - 1]]) {
    await listingScroller.evaluate((element, fraction) => element.scrollTo({ top: (element.scrollHeight - element.clientHeight) * fraction, behavior: 'instant' }), fraction);
    const name = `file-${String(index).padStart(6, '0')}.txt`;
    const entry = pane(page, 2).getByText(name, { exact: true });
    await entry.waitFor({ state: 'attached' });
    await entry.scrollIntoViewIfNeeded();
    await until(async () => {
      const item = await entry.boundingBox(), viewport = await listingScroller.boundingBox();
      return item && viewport && item.y + item.height > viewport.y && item.y < viewport.y + viewport.height;
    }, `visible listing anchor ${name}`);
    report.correctness.listingAnchors.push(name);
  }
  await listingScroller.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: path.join(directory, 'directory-loaded.png') });
  await pane(page, 3).getByRole('button', { name: 'Files', exact: true }).click();
  await pane(page, 3).getByText('editor.txt', { exact: true }).waitFor();
  await terminal(page, 3);
  await app.evaluate(() => global.__ownshellBenchmark.markPhase('mixed-warmup'));
  await wait(schedule.warmupMs);
  console.log(`WORKLOAD_READY ${report.profile}`);
  if (interactive) return;
  const measure = options => measureMixedFrame(context, options);
  let expected = text(profile.textBytes);
  for (let repetition = 0; repetition < schedule.repetitions; repetition++) {
    await app.evaluate((_electron, phase) => global.__ownshellBenchmark.markPhase(phase), `mixed-measurement-${repetition}`);
    await openEditor(page, report, repetition);
    let inserted = '';
    const content = await page.locator('.cm-content').boundingBox();
    const scroller = await page.locator('.cm-scroller').boundingBox();
    const typingRegion = integerRect({ x: content.x, y: scroller.y + 5, width: Math.min(880, scroller.x + scroller.width - content.x - 20), height: 18 });
    for (let sample = 0; sample < schedule.samplesPerAction; sample++) {
      const char = String.fromCharCode(65 + sample % 26); inserted += char;
      const firstLine = inserted + expected.toString('ascii', 0, expected.indexOf(10));
      report.samples.push(await measure({ app, page, directory, id: `r${repetition}-typing-${sample}`, kind: 'typing', region: typingRegion, action: () => nativeInput(app, textEvents(char)), outcome: () => page.waitForFunction(firstLine => document.querySelector('.cm-line')?.textContent === firstLine, firstLine) }));
      await wait(schedule.actionIntervalMs);
    }
    const scrollRegion = integerRect({ x: content.x, y: scroller.y + 100, width: 600, height: 120 });
    await page.mouse.move(scrollRegion.x + 200, scrollRegion.y + 50);
    for (let sample = 0; sample < schedule.samplesPerAction; sample++) {
      const beforeScroll = await scrollSnapshot(page.locator('.cm-scroller'), '.cm-line');
      const previous = beforeScroll.scrollTop;
      report.samples.push(await measure({ app, page, directory, id: `r${repetition}-scroll-${sample}`, kind: 'scroll', region: scrollRegion, action: () => nativeWheel(app, scrollRegion.x + 200, scrollRegion.y + 50), outcome: () => page.waitForFunction(previous => document.querySelector('.cm-scroller').scrollTop > previous, previous), finalOutcome: () => verifyFinalScroll(page.locator('.cm-scroller'), '.cm-line', beforeScroll, profile.textBytes / 128) }));
      await wait(schedule.actionIntervalMs);
    }
    expected = Buffer.concat([Buffer.from(inserted), expected]);
    await page.keyboard.press('Meta+s');
    await page.locator('.cm-content').waitFor({ state: 'detached' });
    const reread = await sftpRead(ssh, '/editor.txt');
    assert.deepEqual(reread, expected, 'saved remote bytes must survive actual SFTP reread');
    report.correctness[`editorSave${repetition}`] = { bytes: reread.length, sha256: createHash('sha256').update(reread).digest('hex'), transport: 'independent actual SFTP read' };
    const directoryScroller = pane(page, 2).locator('table').last().locator('..');
    const listingBox = await directoryScroller.boundingBox();
    const directoryRegion = integerRect({ x: listingBox.x + 6, y: listingBox.y + 36, width: listingBox.width - 22, height: Math.max(12, Math.min(80, listingBox.height - 46)) });
    await page.mouse.move(directoryRegion.x + 20, listingBox.y + 10);
    for (let sample = 0; sample < schedule.samplesPerAction; sample++) {
      const beforeScroll = await scrollSnapshot(directoryScroller, 'tbody tr');
      const previous = beforeScroll.scrollTop;
      report.samples.push(await measure({ app, page, directory, id: `r${repetition}-directory-scroll-${sample}`, kind: 'directory-scroll', region: directoryRegion, action: () => nativeWheel(app, directoryRegion.x + 20, listingBox.y + 10), outcome: () => until(() => directoryScroller.evaluate((e, previous) => e.scrollTop > previous, previous), 'directory scroll'), finalOutcome: () => verifyFinalScroll(directoryScroller, 'tbody tr', beforeScroll, profile.entries) }));
      assert.ok(await directoryScroller.evaluate((e, previous) => e.scrollTop > previous, previous), 'directory actually scrolled');
      await wait(schedule.actionIntervalMs);
    }
    await selectHost(page, 3); await terminal(page, 3);
    const surface = await pane(page, 3).locator('.terminal-surface:visible').boundingBox();
    const switchRegion = integerRect({ x: surface.x + 8, y: surface.y + 8, width: Math.min(700, surface.width - 40), height: Math.min(220, surface.height - 20) });
    let selected = 'Terminal';
    for (let sample = 0; sample < schedule.samplesPerAction; sample++) {
      selected = selected === 'Terminal' ? 'Files' : 'Terminal';
      const target = selected;
      report.samples.push(await measure({ app, page, directory, id: `r${repetition}-switch-${sample}`, kind: 'warm-tab-switch', region: switchRegion, action: () => nativeClick(app, pane(page, 3).getByRole('button', { name: target, exact: true })), outcome: () => target === 'Files' ? pane(page, 3).getByText('editor.txt', { exact: true }).waitFor({ state: 'visible' }) : pane(page, 3).locator('.xterm:visible').waitFor() }));
      await wait(schedule.actionIntervalMs);
    }
    await measureTerminalEcho(context, repetition);
    assert.equal(ssh.events.filter(e => e.type === 'shell-open' && e.native).length, profile.terminals, 'warm switching must not reconnect native sessions');
    assert.equal(ssh.events.filter(e => e.type === 'output-start').length, profile.outputTerminals);
    console.log(`REPETITION_COMPLETE ${report.profile} ${repetition + 1}`);
  }
  assert.equal(report.samples.length, schedule.repetitions * (4 * schedule.samplesPerAction + schedule.terminalEchoSamplesPerRepetition));
  report.measurement = { firstInputAt: report.samples[0].inputAt, lastPresentedAt: report.samples.at(-1).presentedCaptureAt, durationMs: report.samples.at(-1).presentedCaptureAt - report.samples[0].inputAt };
  for (const kind of ['typing', 'scroll', 'directory-scroll', 'warm-tab-switch']) report.summary[kind] = quantiles(report.samples.filter(s => s.kind === kind), kind === 'warm-tab-switch' ? profile.switchTargetMs : profile.inputTargetMs);
  report.summary['terminal-remote-echo'] = quantiles(report.samples.filter(s => s.kind === 'terminal-remote-echo'), Infinity);
  report.correctness.terminals = ssh.events.filter(e => e.type === 'shell-open' && e.native).length;
  report.correctness.structuredHelperShells = ssh.events.filter(e => e.type === 'shell-open' && !e.native).length;
  report.correctness.outputTerminals = ssh.events.filter(e => e.type === 'output-start').length;
  report.correctness.directoryEntries = profile.entries;
  await app.evaluate(() => global.__ownshellBenchmark.markPhase('transfer-drain-and-integrity'));
  report.correctness.measurementBackgroundOverlap = ['transfer-a.bin', 'transfer-b.bin'].map(name => {
    const events = ssh.events.filter(e => e.type === 'transfer-read' && e.path === '/' + name);
    return { name, firstRead: events[0]?.at, latestRead: events.at(-1)?.at, bytesRead: events.reduce((n, e) => n + e.bytes, 0) };
  });
  await selectHost(page, 1); await terminal(page, 1); await wait(300);
  const output = await pane(page, 1).locator('.xterm:visible').innerText();
  const sequences = [...output.matchAll(/BENCH (\d+)/g)].map(m => Number(m[1]));
  assert.ok(sequences.length > 0, 'continuous output must be visible within the real tiled terminal viewport');
  assert.ok(sequences.every((n, i) => !i || n === sequences[i - 1] + 1), 'visible terminal output order');
  report.correctness.visibleOutputSequence = { first: sequences[0], last: sequences.at(-1), count: sequences.length, contiguous: true };
  report.correctness.terminalStreams = await page.evaluate(() => Object.entries(globalThis.__perfTerminalStreams).filter(([, state]) => state.count).map(([sessionId, { tail, ...state }]) => ({ sessionId, ...state })));
  assert.equal(report.correctness.terminalStreams.length, profile.outputTerminals);
  for (const stream of report.correctness.terminalStreams) {
    assert.equal(stream.first, 0, 'observe continuous output from its first real received sequence');
    assert.ok(stream.count >= 1000, 'retain a substantial ordered stream observation independent of viewport height');
    assert.deepEqual(stream.violations, [], 'real PTY-to-renderer output must not drop or reorder sequence numbers');
  }
  const transferComplete = name => fs.existsSync(path.join(root, 'downloads', name)) && fs.statSync(path.join(root, 'downloads', name)).size === schedule.transferBytes;
  report.correctness.unmeasuredDrain = ssh.beginUnmeasuredDrain();
  await until(() => ['transfer-a.bin', 'transfer-b.bin'].every(transferComplete), 'two full queued transfers complete', 120000);
  const expectedHash = createHash('sha256');
  for (let offset = 0; offset < schedule.transferBytes; offset += 1024 * 1024) expectedHash.update(transferChunk(offset, Math.min(1024 * 1024, schedule.transferBytes - offset)));
  const expectedDigest = expectedHash.digest('hex');
  report.correctness.transfers = [];
  for (const name of ['transfer-a.bin', 'transfer-b.bin']) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(path.join(root, 'downloads', name))) hash.update(chunk);
    const sha256 = hash.digest('hex'); assert.equal(sha256, expectedDigest, `complete transfer integrity ${name}`);
    report.correctness.transfers.push({ name, bytes: schedule.transferBytes, sha256 });
  }
  await page.getByRole('button', { name: /^Transfers/ }).click();
  await page.getByText('No transfers in queue', { exact: true }).waitFor();
  await pane(page, 1).getByRole('button', { name: 'Files', exact: true }).click();
  const localFiles = pane(page, 1).locator('table').first();
  for (const name of ['transfer-a.bin', 'transfer-b.bin']) await localFiles.getByText(name, { exact: true }).waitFor();
  report.correctness.transferUI = { queueEmptyAfterDrain: true, completedLocalFilesVisible: 2 };
  await page.screenshot({ path: path.join(directory, 'transfers-complete.png') });
  report.longTasks = await page.evaluate(() => globalThis.__perfLongTasks);
  report.eventTimings = await page.evaluate(() => globalThis.__perfEvents);
  report.trustedInputs = await page.evaluate(() => globalThis.__perfTrusted);
  assert.ok(report.trustedInputs.length > 0 && report.trustedInputs.every(e => e.isTrusted), 'real trusted input events');
}
module.exports = { runMixed, sftpRead, nativeInput, textEvents, nativeClick, nativeWheel, measureMixedFrame, withMixedTransferGuard, scrollSnapshot, verifyFinalScroll, measureTerminalEcho, connectHost, terminalOutputRowRegion };
