'use strict';

// Real Electron/SFTP regression. Uses the shared isolated launcher and fixture;
// assertions concern visible rows, queue state and complete destination bytes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeInput, nativeClick, nativeWheel, textEvents, measureMixedFrame, sftpRead, connectHost, scrollSnapshot, verifyFinalScroll } = require('./mixed-ui.cjs');
const { schedule, quantiles, transferChunk } = require('./workloads.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pane = (page, index) => page.locator('span').filter({ hasText: new RegExp(`^Benchmark ${index}$`) }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) });
const standalonePane = page => page.locator('span').filter({ hasText: /^SFTP: Benchmark 1$/ }).locator('xpath=../../..');
async function until(predicate, label, timeout = 120000) {
  const deadline = performance.now() + timeout;
  while (!(await predicate())) { if (performance.now() > deadline) throw new Error(`Timed out: ${label}`); await delay(50); }
}
async function localDestination(page, view, root) {
  for (const part of fs.realpathSync(path.join(root, 'downloads')).split('/').filter(Boolean)) {
    await view.locator('table:visible').first().getByText(part, { exact: true }).dblclick();
    await delay(60);
  }
}
async function queueSSHDownloads(context) {
  const { page, ssh, root, report } = context;
  await page.getByRole('button', { name: 'Benchmark 1', exact: true }).click();
  const view = pane(page, 1);
  const terminal = view.locator('.xterm-helper-textarea:visible');
  await view.locator('.xterm').filter({ hasText: 'password:' }).waitFor();
  await terminal.focus(); await page.keyboard.type(ssh.password); await page.keyboard.press('Enter');
  await until(() => ssh.events.some(e => e.type === 'shell-open' && e.native), 'native SSH session');
  await view.getByRole('button', { name: 'Files', exact: true }).click();
  await view.getByText('transfer-a.bin', { exact: true }).waitFor();
  await localDestination(page, view, root);
  for (const name of ['transfer-a.bin', 'transfer-b.bin']) {
    await view.getByText(name, { exact: true }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Copy to other pane', exact: true }).click();
  }
  await page.getByRole('button', { name: /^Transfers/ }).click();
  await until(async () => {
    const failed = await page.evaluate(() => globalThis.__sftpProgress.find(event => event.status === 'failed'));
    if (failed) {
      report.correctness.sshFilesQueueFailure = failed;
      await page.screenshot({ path: path.join(context.directory, 'ssh-queue-failure.png') });
      assert.fail(`SSH Files Copy-to-other-pane failed without standalone File Transfer: ${failed.error}`);
    }
    return ['transfer-a.bin', 'transfer-b.bin'].every(name => ssh.events.some(e => e.type === 'transfer-read' && e.path === '/' + name));
  }, 'both SSH Files transfers doing real protocol work');
  report.correctness.sshFilesQueueWithoutStandalone = true;
}
async function transferControls({ page, ssh, report, directory }, direction = 'download') {
  const names = direction === 'download' ? ['transfer-a.bin', 'transfer-b.bin'] : ['upload-a.bin', 'upload-b.bin'];
  const [first, second] = names;
  const ioEvent = direction === 'download' ? 'transfer-read' : 'write';
  const queuePanel = page.getByRole('button', { name: /^Transfers/ }).locator('..');
  const row = name => queuePanel.getByRole('row').filter({ has: page.getByText(name, { exact: true }) });
  await until(() => names.every(name => ssh.events.some(event => event.type === ioEvent && event.path === '/' + name)), `both ${direction} attempts doing real SFTP work`, 10000);
  const beforeB = ssh.events.findLast(event => event.type === ioEvent && event.path === '/' + second);
  const previousAOpens = ssh.events.filter(event => event.type === 'file-open' && event.path === '/' + first).length;
  const previousBOpens = ssh.events.filter(event => event.type === 'file-open' && event.path === '/' + second).length;
  await row(first).getByRole('button', { name: 'Pause', exact: true }).click();
  await row(first).getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await page.screenshot({ path: path.join(directory, `${direction}-paused.png`) });
  await row(first).getByRole('button', { name: 'Resume', exact: true }).click();
  await row(first).getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await until(async () => {
    const state = await page.evaluate(({ second, direction }) => ({
      failed: globalThis.__sftpProgress.find(event => event.type === direction && event.fileName === second && event.status === 'failed'),
      completed: globalThis.__sftpProgress.some(event => event.type === direction && event.fileName === second && event.status === 'completed'),
    }), { second, direction });
    assert.ok(!state.failed, `pausing A must not fail concurrent B: ${state.failed?.error}`);
    const latestB = ssh.events.findLast(event => event.type === ioEvent && event.path === '/' + second);
    return state.completed || latestB && latestB.offset > beforeB.offset;
  }, 'concurrent B survives A pause/resume', 10000);
  await until(() => {
    const opens = ssh.events.filter(event => event.type === 'file-open' && event.path === '/' + first);
    if (opens.length <= previousAOpens) return false;
    const resumed = opens.at(-1);
    assert.ok(ssh.events.some(event => event.type === 'file-close' && event.path === '/' + first && event.at < resumed.at), 'old owned file closes before resume opens its replacement');
    return ssh.events.some(event => event.type === ioEvent && event.path === '/' + first && event.offset === 0 && event.at > resumed.at);
  }, 'resumed A restarts with real offset-zero SFTP I/O', 10000);
  await row(first).getByRole('button', { name: 'Cancel', exact: true }).click();
  await row(first).waitFor({ state: 'detached' });
  const history = await page.evaluate(() => window.electronAPI.sftpTransfer.getHistory());
  assert.ok(history.success);
  const cancelled = history.history.find(item => item.file_name === first && item.type === direction && item.status === 'cancelled');
  assert.ok(cancelled, 'cancelled end state persists after its visible queue row is removed');
  const beforeRetryOpens = ssh.events.filter(event => event.type === 'file-open' && event.path === '/' + first).length;
  await page.getByRole('button', { name: /^Transfers/ }).click();
  if (direction === 'download') {
    await pane(page, 1).getByText(first, { exact: true }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Copy to other pane', exact: true }).click();
  } else {
    const local = pane(page, 1).locator('table').first();
    await local.getByRole('row').filter({ has: page.getByText(first, { exact: true }) }).getByRole('checkbox').click();
    await pane(page, 1).getByRole('button', { name: 'Upload Selected (1)', exact: true }).click();
  }
  await until(() => {
    const opens = ssh.events.filter(event => event.type === 'file-open' && event.path === '/' + first);
    if (opens.length <= beforeRetryOpens) return false;
    const previous = opens.at(-2), next = opens.at(-1);
    assert.ok(ssh.events.some(event => event.type === 'file-close' && event.path === '/' + first && event.at > previous.at && event.at < next.at), 'cancelled owned file closes before retry opens its replacement');
    return true;
  }, 'fresh attempt after cancellation', 10000);
  assert.equal(ssh.events.filter(event => event.type === 'file-open' && event.path === '/' + second).length, previousBOpens, 'B is not silently restarted by A controls');
  report.correctness[direction === 'download' ? 'pauseResumeCancel' : 'uploadPauseResumeCancel'] = {
    controlled: first, uninterrupted: second, pausedVisible: true, resumedVisible: true,
    concurrentBPreserved: true, resumedFromOffsetZero: true, ownedHandlesClosedBeforeReplacement: true,
    cancelledRemovedFromQueue: true, cancelled: { id: cancelled.id, status: cancelled.status, transferred: cancelled.transferred },
    requeued: true, semantics: 'cooperative abort and restart, not byte-range transport resume, instantaneous network pause, or partial-file rollback',
  };
}
async function activeQueueSnapshot({ page, ssh }) {
  const names = ['transfer-a.bin', 'transfer-b.bin'];
  const files = names.map(name => {
    const read = ssh.events.findLast(event => event.type === 'transfer-read' && event.path === '/' + name);
    assert.ok(read && read.offset > 0 && read.offset < schedule.transferBytes, `${name} is active before owner close`);
    return { name, offset: read.offset, opens: ssh.events.filter(event => event.type === 'file-open' && event.path === '/' + name).length };
  });
  const ids = await page.evaluate(() => Object.fromEntries(['transfer-a.bin', 'transfer-b.bin'].map(name => [name, globalThis.__sftpProgress.findLast(event => event.fileName === name && event.status === 'active')?.transferId])));
  assert.ok(names.every(name => ids[name]), 'both original public transfer IDs observed');
  return { files, ids };
}
async function queueContinues({ page, ssh }, snapshot, afterAt) {
  await until(async () => {
    const failures = await page.evaluate(() => globalThis.__sftpProgress.filter(event => ['transfer-a.bin', 'transfer-b.bin'].includes(event.fileName) && event.status === 'failed'));
    assert.deepEqual(failures, [], 'owner close must not fail the original queue transfers');
    return snapshot.files.every(({ name, offset }) => ssh.events.some(event => event.type === 'transfer-read' && event.path === '/' + name && event.at > afterAt && event.offset > offset));
  }, 'both original queue streams continue after owner release', 10000);
}
async function verifyOriginalQueue(context, snapshot) {
  await drainAndVerify(context);
  for (const { name, completed } of context.report.correctness.progress) {
    assert.equal(completed.transferId, snapshot.ids[name], 'owner close does not replace the original queue attempt');
    assert.equal(context.ssh.events.filter(event => event.type === 'file-open' && event.path === '/' + name).length, snapshot.files.find(item => item.name === name).opens, 'owner close does not silently reopen either queue file');
  }
}
async function closeStandaloneOwner(context) {
  const { page, app, ssh, report, directory } = context;
  const snapshot = await activeQueueSnapshot(context);
  const previousCloses = ssh.events.filter(event => event.type === 'client-close' && !event.native).length;
  const owner = standalonePane(page);
  await page.screenshot({ path: path.join(directory, 'standalone-before-close.png') });
  const dispatch = await nativeClick(app, owner.getByRole('button', { name: 'Close pane', exact: true }));
  await owner.waitFor({ state: 'detached' });
  await until(() => ssh.events.filter(event => event.type === 'client-close' && !event.native).length > previousCloses, 'standalone owner releases its real SSH client', 10000);
  const closedAt = ssh.events.findLast(event => event.type === 'client-close' && !event.native).at;
  await queueContinues(context, snapshot, closedAt);
  await page.screenshot({ path: path.join(directory, 'standalone-after-close.png') });
  await verifyOriginalQueue(context, snapshot);
  report.correctness.standaloneOwnerClose = { dispatch, closedAt, snapshot, originalAttemptsCompleted: true, ownedClientReleased: true };
}
async function closeWorkerOwners(context) {
  const { page, app, ssh, report, directory } = context;
  const snapshot = await activeQueueSnapshot(context);
  const before = ssh.resources();
  const shells = () => ssh.events.filter(event => event.type === 'shell-open' && event.native).length - ssh.events.filter(event => event.type === 'shell-close' && event.native).length;
  const nativeShells = shells();
  const owner = pane(page, 1);
  const initializedDispatch = await nativeClick(app, owner.getByRole('button', { name: 'Close pane', exact: true }));
  await owner.waitFor({ state: 'detached' });
  await until(() => {
    const resources = ssh.resources();
    return resources.clients === before.clients - 3 && resources.sockets === before.sockets - 3 && shells() === nativeShells - 1;
  }, 'initialized owner releases native, structured-worker and owned SFTP transports', 10000);
  await queueContinues(context, snapshot, performance.now());
  const initializedAfter = ssh.resources();
  await page.getByRole('button', { name: 'Servers', exact: true }).click();
  await connectHost(page, ssh, 1);
  const pendingOwner = pane(page, 1);
  const closeBox = await pendingOwner.getByRole('button', { name: 'Close pane', exact: true }).boundingBox();
  const pendingStart = ssh.events.length;
  const gate = ssh.holdNextSftpInitialization();
  let pendingDispatch, heldAt, pendingAfter;
  try {
    await nativeClick(app, pendingOwner.getByRole('button', { name: 'Files', exact: true }));
    await until(() => ssh.events.slice(pendingStart).some(event => event.type === 'sftp-init-held'), 'real new SFTP subsystem held before acceptance', 10000);
    await gate.started;
    assert.equal(ssh.resources().pendingSftpInitializations, 1, 'initialization is actually held, not already completed');
    heldAt = ssh.events.findLast(event => event.type === 'sftp-init-held').at;
    const point = { x: Math.round(closeBox.x + closeBox.width / 2), y: Math.round(closeBox.y + closeBox.height / 2) };
    pendingDispatch = await nativeInput(app, [{ type: 'mouseMove', ...point }, { type: 'mouseDown', button: 'left', clickCount: 1, ...point }, { type: 'mouseUp', button: 'left', clickCount: 1, ...point }]);
    await pendingOwner.waitFor({ state: 'detached' });
    await until(() => {
      const resources = ssh.resources();
      return resources.clients === initializedAfter.clients && resources.sockets === initializedAfter.sockets && resources.pendingSftpInitializations === 0 && shells() === nativeShells - 1;
    }, 'pending owner releases its own transports and held initialization', 10000);
    assert.ok(!ssh.events.slice(pendingStart).some(event => event.type === 'sftp-init-released'), 'pending owner closes before its subsystem is accepted');
    pendingAfter = ssh.resources();
    await queueContinues(context, snapshot, performance.now());
  } finally {
    gate.release();
  }
  await page.screenshot({ path: path.join(directory, 'worker-owners-closed.png') });
  await verifyOriginalQueue(context, snapshot);
  report.correctness.workerOwnerClose = { initializedDispatch, before, initializedAfter, pendingDispatch, heldAt, pendingAfter, snapshot, originalAttemptsCompleted: true, ownedResourcesReleased: true };
}
async function closeTransferTransport(context) {
  const { page, ssh, root, report, directory } = context;
  const snapshot = await activeQueueSnapshot(context);
  await ssh.close();
  await until(() => page.evaluate(ids => Object.values(ids).every(id => globalThis.__sftpProgress.some(event => event.transferId === id && event.status === 'failed')), snapshot.ids), 'lost transport settles both original queue attempts as failed', 10000);
  const progress = await page.evaluate(() => globalThis.__sftpProgress);
  fs.writeFileSync(path.join(directory, 'transport-loss-progress.json'), JSON.stringify(progress, null, 2));
  const queue = await page.evaluate(() => window.electronAPI.sftpTransfer.getQueue());
  const history = await page.evaluate(() => window.electronAPI.sftpTransfer.getHistory());
  assert.ok(queue.success && history.success);
  assert.equal(queue.queue.length, 0, 'lost transport leaves no permanently active queue rows');
  const failures = [];
  for (const { name, opens } of snapshot.files) {
    const id = snapshot.ids[name];
    const failed = progress.findLast(event => event.transferId === id);
    assert.equal(failed.status, 'failed');
    assert.ok(failed.error, 'failure preserves its actual transport error');
    assert.equal(failed.fileSize, schedule.transferBytes);
    assert.ok(failed.transferred >= 0 && failed.transferred < schedule.transferBytes);
    assert.equal(failed.percentage, Math.round((failed.transferred / schedule.transferBytes) * 100), 'failed end state retains its reported partial byte percentage');
    const item = history.history.find(item => item.id === id);
    assert.ok(item && item.status === 'failed' && item.error, 'failure end state and error persist in public history');
    assert.equal(item.transferred, failed.transferred);
    assert.equal(item.file_size, schedule.transferBytes);
    assert.equal(ssh.events.filter(event => event.type === 'file-open' && event.path === '/' + name).length, opens, 'transport loss does not silently retry the file');
    const partialBytes = (await fs.promises.stat(path.join(root, 'downloads', name))).size;
    assert.ok(partialBytes <= failed.transferred, 'failed progress is not a partial-file rollback guarantee');
    failures.push({ name, failed, history: { id: item.id, status: item.status, error: item.error, transferred: item.transferred, fileSize: item.file_size }, partialBytes });
  }
  const emptyQueue = page.getByText('No transfers in queue', { exact: true });
  if (!(await emptyQueue.isVisible())) await page.getByRole('button', { name: /^Transfers/ }).click();
  await emptyQueue.waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(directory, 'transport-loss-settled.png') });
  const resources = ssh.resources();
  for (const [resource, count] of Object.entries(resources)) assert.equal(count, 0, `closed real SSH fixture releases ${resource}`);
  report.correctness.transportLoss = { snapshot, failures, resources, originalAttemptsSettled: true };
}
async function verifyDownloadEndStates(context, progress) {
  const { page, report } = context;
  if (progress === undefined) {
    await until(() => page.evaluate(() => ['transfer-a.bin', 'transfer-b.bin'].every(name => globalThis.__sftpProgress.some(event => event.fileName === name && event.status === 'completed'))), 'both visible-boundary completion events');
    progress = await page.evaluate(() => globalThis.__sftpProgress);
  }
  fs.writeFileSync(path.join(context.directory, 'transfer-progress.json'), JSON.stringify(progress, null, 2));
  report.correctness.progress = ['transfer-a.bin', 'transfer-b.bin'].map(name => {
    const events = progress.filter(event => event.fileName === name);
    const completed = events.findLast(event => event.status === 'completed');
    assert.ok(completed, `${name} emits completed end state`);
    assert.equal(completed.percentage, 100, `${name} completes at 100%`);
    assert.equal(completed.transferred, schedule.transferBytes, `${name} final transferred bytes`);
    assert.equal(completed.fileSize, schedule.transferBytes, `${name} final total bytes`);
    return { name, events: events.length, firstAt: events[0]?.at, lastAt: events.at(-1)?.at, completed };
  });
  const queue = await page.evaluate(() => window.electronAPI.sftpTransfer.getQueue());
  assert.ok(queue.success);
  assert.equal(queue.queue.length, 0, 'both completed transfers leave the public queue');
  const history = await page.evaluate(() => window.electronAPI.sftpTransfer.getHistory());
  assert.ok(history.success);
  report.correctness.transferHistory = report.correctness.progress.map(({ completed }) => {
    const item = history.history.find(item => item.id === completed.transferId);
    assert.ok(item && item.status === 'completed', 'completed state persists in public transfer history');
    assert.equal(item.transferred, schedule.transferBytes);
    assert.equal(item.file_size, schedule.transferBytes);
    return { id: item.id, status: item.status, transferred: item.transferred, fileSize: item.file_size };
  });
}
async function drainAndVerify(context) {
  const { page, ssh, root, report } = context;
  report.unmeasuredDrain = ssh.beginUnmeasuredDrain();
  const expected = createHash('sha256');
  for (let offset = 0; offset < schedule.transferBytes; offset += 1024 * 1024) expected.update(transferChunk(offset, Math.min(1024 * 1024, schedule.transferBytes - offset)));
  const digest = expected.digest('hex');
  report.correctness.transfers = [];
  for (const name of ['transfer-a.bin', 'transfer-b.bin']) {
    const file = path.join(root, 'downloads', name);
    await until(() => fs.existsSync(file) && fs.statSync(file).size === schedule.transferBytes && ssh.events.some(e => e.type === 'file-close' && e.path === '/' + name), `complete ${name}`, 180000);
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    assert.equal(hash.digest('hex'), digest, `${name} complete deterministic contents`);
    report.correctness.transfers.push({ name, bytes: schedule.transferBytes, sha256: digest });
  }
  await verifyDownloadEndStates(context);
  const emptyQueue = page.getByText('No transfers in queue', { exact: true });
  if (!(await emptyQueue.isVisible())) await page.getByRole('button', { name: /^Transfers/ }).click();
  await emptyQueue.waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(context.directory, 'transfers-complete.png') });
  report.correctness.transferQueueVisible = await page.locator('body').innerText();
  await page.getByRole('button', { name: /^Transfers/ }).click();
}
async function measureListing(context) {
  const { page, app, profile, report, directory } = context;
  const view = pane(page, 2);
  const scroller = view.locator('table').last().locator('..');
  const box = await scroller.boundingBox();
  const region = { x: Math.ceil(box.x + 6), y: Math.ceil(box.y + 36), width: Math.floor(box.width - 22), height: Math.floor(Math.max(12, Math.min(80, box.height - 46))) };
  let expectedEditor = await sftpRead(context.ssh, '/editor.txt');
  for (let repetition = 0; repetition < schedule.repetitions; repetition++) {
    await view.getByRole('button', { name: 'Files', exact: true }).click();
    await scroller.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
    for (let sample = 0; sample < schedule.samplesPerAction; sample++) {
      const before = await scrollSnapshot(scroller, 'tbody tr');
      const previous = before.scrollTop;
      report.samples.push(await measureMixedFrame(context, {
        app, page, directory, id: `sftp-r${repetition}-scroll-${sample}`, kind: 'directory-scroll', region,
        action: () => nativeWheel(app, region.x + 20, box.y + 10),
        outcome: () => until(() => scroller.evaluate((element, previous) => element.scrollTop > previous, previous), 'native listing scroll'),
        finalOutcome: () => verifyFinalScroll(scroller, 'tbody tr', before, profile.entries),
      }));
      await delay(schedule.actionIntervalMs);
    }
    const surface = await view.boundingBox();
    const switchRegion = { x: Math.ceil(surface.x + 8), y: Math.ceil(box.y + 8), width: Math.floor(Math.min(700, surface.width - 40)), height: Math.floor(Math.min(100, box.height - 20)) };
    let selected = 'Files';
    for (let sample = 0; sample < schedule.samplesPerAction; sample++) {
      selected = selected === 'Files' ? 'Terminal' : 'Files';
      const target = selected;
      report.samples.push(await measureMixedFrame(context, {
        app, page, directory, id: `sftp-r${repetition}-switch-${sample}`, kind: 'warm-tab-switch', region: switchRegion,
        action: () => nativeClick(app, view.getByRole('button', { name: target, exact: true })),
        outcome: () => target === 'Files' ? scroller.waitFor({ state: 'visible' }) : view.locator('.xterm:visible').waitFor(),
      }));
      await delay(schedule.actionIntervalMs);
    }
    await pane(page, 1).getByRole('button', { name: 'Files', exact: true }).click();
    await pane(page, 1).getByText('editor.txt', { exact: true }).dblclick();
    await page.locator('.cm-content').waitFor();
    await page.locator('.cm-content').focus();
    await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home');
    const content = await page.locator('.cm-content').boundingBox();
    const editor = await page.locator('.cm-scroller').boundingBox();
    const typingRegion = { x: Math.ceil(content.x), y: Math.ceil(editor.y + 5), width: Math.floor(Math.min(880, editor.x + editor.width - content.x - 20)), height: 18 };
    let prefix = '';
    for (let sample = 0; sample < schedule.samplesPerAction; sample++) {
      const character = String.fromCharCode(65 + sample % 26); prefix += character;
      const expectedPrefix = prefix;
      report.samples.push(await measureMixedFrame(context, {
        app, page, directory, id: `sftp-r${repetition}-typing-${sample}`, kind: 'typing', region: typingRegion,
        action: () => nativeInput(app, textEvents(character)),
        outcome: () => page.waitForFunction(prefix => document.querySelector('.cm-line')?.textContent.startsWith(prefix), expectedPrefix),
      }));
      await delay(schedule.actionIntervalMs);
    }
    await page.keyboard.press('Meta+s');
    await page.locator('.cm-content').waitFor({ state: 'detached' });
    const bytes = await sftpRead(context.ssh, '/editor.txt');
    expectedEditor = Buffer.concat([Buffer.from(prefix), expectedEditor]);
    assert.deepEqual(bytes, expectedEditor, 'complete control editor contents survive mixed-load save');
    report.correctness[`editorControl${repetition}`] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  for (const kind of ['directory-scroll', 'warm-tab-switch', 'typing']) report.summary[kind] = quantiles(report.samples.filter(sample => sample.kind === kind), kind === 'warm-tab-switch' ? profile.switchTargetMs : profile.inputTargetMs);
}
async function observeTransferUpdateLoad({ app, page, report }) {
  const { firstInputAt, lastPresentedAt, durationMs } = report.measurement;
  const renderer = await page.evaluate(() => ({ origin: performance.timeOrigin, progress: globalThis.__sftpProgress }));
  const progress = renderer.progress.filter(event => {
    const at = event.at + renderer.origin - report.runtime.timeOrigin;
    return at >= firstInputAt && at <= lastPresentedAt;
  });
  const ipc = await app.evaluate(() => global.__ownshellBenchmark.ipc());
  report.sftpUpdateLoad = {
    interval: report.measurement,
    progressEvents: progress.length,
    progressEventsPerSecond: progress.length / (durationMs / 1000),
    polling: ['sftp:transfer:get-queue', 'sftp:transfer:get-stats'].map(channel => {
      const calls = ipc.filter(event => event.channel === channel && event.start >= firstInputAt && event.start <= lastPresentedAt);
      return { channel, calls: calls.length, handlerMsTotal: calls.reduce((total, event) => total + event.durationMs, 0), handlerMsMax: calls.length ? Math.max(...calls.map(event => event.durationMs)) : 0 };
    }),
    interpretation: 'Observed real notifications and existing main-handler polling durations, not causal renderer CPU attribution. No notification or polling rate reduction is applied.',
  };
}
async function listInteractions(context) {
  const { page, profile, report } = context;
  const actionStartedAt = performance.now();
  const background = ['transfer-a.bin', 'transfer-b.bin'].map(name => {
    const latest = context.ssh.events.findLast(event => event.type === 'transfer-read' && event.path === '/' + name);
    assert.ok(latest && !context.ssh.events.some(event => event.type === 'file-close' && event.path === '/' + name), `${name} active before list operations`);
    return { name, beforeOffset: latest.offset };
  });
  const view = pane(page, 2);
  await view.getByRole('button', { name: 'Files', exact: true }).click();
  const scroller = view.locator('table').last().locator('..');
  await scroller.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
  const last = `file-${String(profile.entries - 1).padStart(6, '0')}.txt`;
  const filtered = `file-${String(Math.floor(profile.entries / 2)).padStart(6, '0')}.txt`;
  await view.getByRole('button', { name: 'Name', exact: true }).click();
  await view.getByText(last, { exact: true }).waitFor({ state: 'visible' });
  await view.getByRole('button', { name: 'Search', exact: true }).click();
  const search = view.getByRole('searchbox', { name: 'Search', exact: true });
  await search.fill(filtered);
  await view.getByText(filtered, { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await view.getByText(last, { exact: true }).count(), 0, 'filter removes the previously visible nonmatch');
  await view.getByText(filtered, { exact: true }).click({ button: 'right' });
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  const renamed = filtered.replace('.txt', '-renamed.txt');
  const dialogInput = page.locator('input:visible:not([type="search"])').last();
  await dialogInput.fill(renamed); await page.keyboard.press('Enter');
  await until(() => context.ssh.events.some(event => event.type === 'rename' && event.oldPath === '/listing/' + filtered && event.newPath === '/listing/' + renamed), 'offscreen entry actual protocol rename');
  await search.fill(renamed);
  await view.getByText(renamed, { exact: true }).waitFor();
  await view.getByText(renamed, { exact: true }).click({ button: 'right' });
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await dialogInput.fill(filtered); await page.keyboard.press('Enter');
  await until(() => context.ssh.events.some(event => event.type === 'rename' && event.oldPath === '/listing/' + renamed && event.newPath === '/listing/' + filtered), 'offscreen entry restored through actual protocol rename');
  await search.fill('');
  await view.getByRole('button', { name: 'Name', exact: true }).click();
  await view.getByText('file-000000.txt', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'File Transfer', exact: true }).click();
  const sftpView = standalonePane(page);
  const rootRemote = sftpView.locator('table:visible').last();
  const originalFirst = await rootRemote.getByText('editor.txt', { exact: true }).boundingBox();
  const originalSecond = await rootRemote.getByText('listing', { exact: true }).boundingBox();
  assert.ok(originalFirst && originalSecond && originalFirst.y < originalSecond.y, 'standalone default retains real server entry order until a sort is requested');
  const sizeOrders = [
    ['listing', 'editor.txt', 'transfer-a.bin', 'transfer-b.bin'],
    ['listing', 'transfer-b.bin', 'transfer-a.bin', 'editor.txt'],
  ];
  for (const order of sizeOrders) {
    await rootRemote.getByRole('button', { name: 'Size', exact: true }).click();
    const positions = await Promise.all(order.map(async name => (await rootRemote.getByText(name, { exact: true }).boundingBox())?.y));
    assert.ok(positions.every((position, index) => position !== undefined && (index === 0 || position > positions[index - 1])), 'actual differing file sizes sort in both directions with directories first');
  }
  await rootRemote.getByRole('button', { name: 'Name', exact: true }).click();
  await rootRemote.getByText('listing', { exact: true }).dblclick();
  const remote = sftpView.locator('table:visible').last();
  await remote.getByText('file-000000.txt', { exact: true }).waitFor();
  await remote.getByRole('checkbox').first().click();
  await sftpView.getByRole('button', { name: `Download Selected (${profile.entries})`, exact: true }).waitFor();
  const standaloneScroller = remote.locator('..');
  await standaloneScroller.evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  const lastRow = remote.getByRole('row').filter({ hasText: last });
  await lastRow.getByRole('checkbox').waitFor();
  assert.equal(await lastRow.getByRole('checkbox').getAttribute('aria-checked'), 'true', 'select all includes the offscreen final entry');
  await lastRow.getByRole('checkbox').click();
  await sftpView.getByRole('button', { name: `Download Selected (${profile.entries - 1})`, exact: true }).waitFor();
  await remote.getByRole('button', { name: 'Search', exact: true }).click();
  const standaloneSearch = standaloneScroller.getByRole('searchbox', { name: 'Search', exact: true });
  await standaloneSearch.fill(last);
  await remote.getByRole('checkbox').first().click();
  await sftpView.getByRole('button', { name: `Download Selected (${profile.entries})`, exact: true }).waitFor();
  await remote.getByRole('checkbox').first().click();
  await sftpView.getByRole('button', { name: `Download Selected (${profile.entries - 1})`, exact: true }).waitFor();
  await standaloneSearch.fill('');
  assert.equal(await remote.getByRole('row').filter({ hasText: 'file-000000.txt' }).getByRole('checkbox').getAttribute('aria-checked'), 'true', 'filtered selection preserves unrelated offscreen selection');
  await sftpView.getByRole('button', { name: 'Clear', exact: true }).click();
  report.correctness.fullListingInteractions = { entries: profile.entries, descendingAnchor: last, filteredAnchor: filtered, renamedAndRestored: filtered, selectedAll: profile.entries, deselectedLast: profile.entries - 1 };
  report.correctness.fullListingInteractions.sizeOrders = sizeOrders;
  report.correctness.fullListingInteractions.background = background.map(transfer => {
    const latest = context.ssh.events.findLast(event => event.type === 'transfer-read' && event.path === '/' + transfer.name);
    assert.ok(latest && latest.at >= actionStartedAt && latest.offset > transfer.beforeOffset, `${transfer.name} does real work across listing operations`);
    assert.ok(!context.ssh.events.some(event => event.type === 'file-close' && event.path === '/' + transfer.name), `${transfer.name} remains active throughout list operations`);
    return { ...transfer, afterOffset: latest.offset, latestReadAt: latest.at };
  });
  await page.getByRole('button', { name: 'Servers', exact: true }).click();
}
async function verifyUploads(context, standalone) {
  const { page, root, ssh, report } = context;
  let view = pane(page, 1);
  if (standalone) {
    await page.getByRole('button', { name: 'File Transfer', exact: true }).click();
    view = standalonePane(page);
    const remote = view.locator('table:visible').last();
    await remote.getByText('..', { exact: true }).dblclick();
    await localDestination(page, view, root);
  }
  const local = view.locator('table:visible').first();
  for (const name of ['upload-a.bin', 'upload-b.bin']) await local.getByRole('row').filter({ has: page.getByText(name, { exact: true }) }).getByRole('checkbox').click();
  const controlUploads = !standalone && process.argv.includes('--controls');
  if (controlUploads) await page.getByRole('button', { name: /^Transfers/ }).click();
  await view.getByRole('button', { name: 'Upload Selected (2)', exact: true }).click();
  if (controlUploads) await transferControls(context, 'upload');
  await until(() => page.evaluate(() => ['upload-a.bin', 'upload-b.bin'].every(name => globalThis.__sftpProgress.some(event => event.fileName === name && event.status === 'completed'))), 'both actual uploads completed');
  report.correctness.uploads = [];
  for (const name of ['upload-a.bin', 'upload-b.bin']) {
    const expected = fs.readFileSync(path.join(root, 'downloads', name));
    const actual = await sftpRead(ssh, '/' + name);
    assert.deepEqual(actual, expected, `${name} complete upload contents via independent SFTP reread`);
    const completion = await page.evaluate(name => globalThis.__sftpProgress.findLast(event => event.fileName === name && event.status === 'completed'), name);
    assert.equal(completion.transferred, expected.length);
    assert.equal(completion.percentage, 100);
    report.correctness.uploads.push({ name, bytes: actual.length, sha256: createHash('sha256').update(actual).digest('hex'), surface: standalone ? 'File Transfer' : 'SSH Files', completion });
  }
  if (standalone) {
    const remote = view.locator('table:visible').last();
    await remote.getByRole('button', { name: 'Search', exact: true }).click();
    await remote.locator('..').getByRole('searchbox', { name: 'Search', exact: true }).fill('upload-');
    await remote.getByText('upload-b.bin', { exact: true }).waitFor();
    await remote.getByRole('checkbox').first().click();
    for (const name of ['upload-a.bin', 'upload-b.bin']) fs.unlinkSync(path.join(root, 'downloads', name));
    await view.getByRole('button', { name: 'Download Selected (2)', exact: true }).click();
    await until(() => page.evaluate(() => ['upload-a.bin', 'upload-b.bin'].every(name => globalThis.__sftpProgress.some(event => event.type === 'download' && event.fileName === name && event.status === 'completed'))), 'standalone selected downloads completed');
    for (const item of report.correctness.uploads) {
      const downloaded = fs.readFileSync(path.join(root, 'downloads', item.name));
      assert.equal(downloaded.length, item.bytes);
      assert.equal(createHash('sha256').update(downloaded).digest('hex'), item.sha256, 'standalone download preserves full uploaded contents');
    }
    report.correctness.standaloneSelectedDownloads = true;
  }
}

async function scenario(context) {
  context.report.scenario = 'ticket-05-sftp';
  context.report.build.sourceCommit = process.env.OWNSHELL_PERF_SOURCE ?? null;
  const controlUploads = process.argv.includes('--ssh-only') && process.argv.includes('--controls');
  const uploadBytes = controlUploads ? 16 * 1024 * 1024 : 1024 * 1024;
  context.report.workload.correctnessUploads = { aBytes: uploadBytes, bBytes: uploadBytes + 19, timed: false };
  fs.writeFileSync(path.join(context.root, 'downloads', 'upload-a.bin'), transferChunk(0, uploadBytes));
  fs.writeFileSync(path.join(context.root, 'downloads', 'upload-b.bin'), transferChunk(77, uploadBytes + 19));
  await context.page.evaluate(() => {
    globalThis.__sftpProgress = [];
    window.electronAPI.sftpTransfer.onProgress(event => globalThis.__sftpProgress.push({ ...event, at: performance.now() }));
    globalThis.__sftpListTimings = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (entry.name.startsWith('sftp:list:')) globalThis.__sftpListTimings.push({ kind: entry.name, durationMs: entry.duration, entries: entry.detail?.entries, startTime: entry.startTime, endpoint: entry.name.endsWith(':render') ? 'component render through DOM commit, not paint' : 'local CPU phase' });
    }).observe({ entryTypes: ['measure'] });
  });
  await context.app.evaluate(() => {
    const { PerformanceObserver } = process.getBuiltinModule('node:perf_hooks');
    global.__ticket05ListTimings = [];
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (entry.name.startsWith('sftp:list:')) global.__ticket05ListTimings.push({ kind: entry.name, durationMs: entry.duration, entries: entry.detail?.entries, startTime: entry.startTime, endpoint: 'main adapter entry preparation after real READDIR completes' });
    });
    observer.observe({ entryTypes: ['measure'] });
    global.__ticket05ListObserver = observer;
  });
  if (process.argv.includes('--ssh-only')) {
    context.report.scenario = controlUploads ? 'ticket-05-sftp-ssh-controls' : 'ticket-05-sftp-ssh-only';
    context.report.limitations.push('SSH-only correctness scene uses one native SSH session and two queue transfers, not the full mixed latency workload.');
    await queueSSHDownloads(context);
    if (process.argv.includes('--controls')) await transferControls(context);
    await drainAndVerify(context);
    await verifyUploads(context, false);
    return;
  }
  const cdp = await pageSession(context.page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  await runMixed({ ...context, interactive: true });
  const { profile: cpu } = await cdp.send('Profiler.stop');
  fs.writeFileSync(path.join(context.directory, 'listing-load.cpuprofile'), JSON.stringify(cpu));
  const listingEnd = context.ssh.events.findLast(event => event.type === 'list-end' && event.path === '/listing');
  const listingStart = context.ssh.events.findLast(event => event.type === 'list-start' && event.path === '/listing' && event.at < listingEnd.at);
  context.report.loads.push({ kind: 'sftp-list-service', entries: context.profile.entries, durationMs: listingEnd.at - listingStart.at, endpoint: 'real OPENDIR through complete READDIR EOF; excludes renderer preparation/rendering' });
  context.report.loads.push(...await context.page.evaluate(() => globalThis.__sftpListTimings), ...await context.app.evaluate(() => global.__ticket05ListTimings));
  if (process.argv.includes('--transport-close')) {
    context.report.scenario = 'ticket-05-sftp-transport-close';
    context.report.limitations.push('Controlled real SSH service shutdown checks failure end states, not mixed-workload latency or successful full-file completion.');
    await closeTransferTransport(context);
    return;
  }
  const workerOwnerClose = process.argv.includes('--worker-owner-close');
  if (process.argv.includes('--owner-close') || workerOwnerClose) {
    context.report.scenario = workerOwnerClose ? 'ticket-05-sftp-worker-owner-close' : 'ticket-05-sftp-owner-close';
    context.report.limitations.push('Owner-close correctness scene starts the fixed mixed workload, then deliberately closes owners; it makes no latency percentile claim.');
    await (workerOwnerClose ? closeWorkerOwners : closeStandaloneOwner)(context);
    return;
  }
  if (process.argv.includes('--load-only')) {
    context.report.scenario = 'ticket-05-sftp-load-only';
    for (const kind of ['sftp:list:prepare', 'sftp:list:sort', 'sftp:list:render']) assert.ok(context.report.loads.some(load => load.kind === kind && load.entries === context.profile.entries), `complete listing ${kind} phase observed`);
    context.report.limitations.push('Load-only scene stops after full mixed warm-up; no latency percentile or transfer-integrity claim.');
    return;
  }
  if (process.argv.includes('--actions-only')) {
    context.report.scenario = 'ticket-05-sftp-actions-only';
    context.report.limitations.push('Actions-only scene verifies complete listing operations and real transfers under mixed load, without latency percentile claims.');
  } else {
    await measureListing(context);
    context.report.measurement = { firstInputAt: context.report.samples[0].inputAt, lastPresentedAt: context.report.samples.at(-1).presentedCaptureAt, durationMs: context.report.samples.at(-1).presentedCaptureAt - context.report.samples[0].inputAt };
    await observeTransferUpdateLoad(context);
  }
  context.report.longTasks = await context.page.evaluate(() => globalThis.__perfLongTasks);
  context.report.eventTimings = await context.page.evaluate(() => globalThis.__perfEvents);
  context.report.trustedInputs = await context.page.evaluate(() => globalThis.__perfTrusted);
  const failures = [];
  for (const check of [listInteractions, drainAndVerify]) {
    try { await check(context); }
    catch (error) { failures.push({ phase: check.name, error }); }
  }
  if (failures.length) {
    context.report.verificationErrors = failures.map(({ phase, error }) => ({ phase, error: String(error), stack: error.stack }));
    if (failures.length === 1) throw failures[0].error;
    throw new AggregateError(failures.map(({ error }) => error), context.report.verificationErrors.map(({ phase, error }) => `${phase}: ${error}`).join('\n'));
  }
  await verifyUploads(context, true);
  if (!process.argv.includes('--actions-only')) {
    for (const kind of ['directory-scroll', 'warm-tab-switch', 'typing']) {
      const summary = context.report.summary[kind];
      assert.equal(summary.n, schedule.repetitions * schedule.samplesPerAction, `${kind} retains every prescribed sample`);
      assert.ok(summary.p95 <= summary.targetMs, `${kind} input-to-capture upper-bound p95 ${summary.p95}ms exceeds ${summary.targetMs}ms; this alone does not diagnose visible application latency`);
    }
  }
}
async function pageSession(page) { return page.context().newCDPSession(page); }

if (require.main === module) runProfile(process.argv.includes('--stress') ? 'stress' : 'everyday', scenario).catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { scenario, verifyDownloadEndStates };
