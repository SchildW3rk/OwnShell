'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeInput, textEvents, nativeClick, nativeWheel, sftpRead, measureMixedFrame } = require('./mixed-ui.cjs');
const { quantiles, schedule, text, transferChunk } = require('./workloads.cjs');
const { startDockerFixture } = require('./docker-fixture.cjs');
const { createSQLiteFixture } = require('./ticket-06-fixtures.cjs');
const { expandPane, dragSeparator } = require('./ticket-12-workspace-ui.cjs');
const { exerciseWindowResize, installTransferObserver, transferSnapshot, disposeTransferObserver, terminalViewport, verifyContinuedVisibleOutput } = require('./ticket-12-window-resize.cjs');
const { verifyDownloadEndStates } = require('./ticket-05-sftp.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pane = (page, index) => page.locator('span').filter({ hasText: new RegExp(`^Benchmark ${index}$`) }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) });
const rect = box => ({ x: Math.ceil(box.x), y: Math.ceil(box.y), width: Math.floor(box.width), height: Math.floor(box.height) });
async function until(predicate, description, timeout = 30000) {
  const deadline = performance.now() + timeout;
  while (!(await predicate())) { if (performance.now() > deadline) throw new Error(`Timed out: ${description}`); await wait(50); }
}
async function prepareDockerVisibility(context, docker) {
  const { app, page, ssh, profile, report } = context;
  const feature = pane(page, profile.terminals).first();
  const sidebarToggle = page.locator('header button[title]').first();
  await nativeClick(app, sidebarToggle); await wait(250);
  report.lifecycle.initialFeatureLayout = await expandPane(context, feature);
  for (const name of ['Files', 'Database', 'Docker']) { await feature.getByRole('button', { name, exact: true }).click(); await wait(250); }
  await feature.getByText(docker.name, { exact: true }).waitFor();
  await feature.getByText(docker.name, { exact: true }).click();
  await feature.getByRole('button', { name: 'Usage', exact: true }).waitFor();
  report.correctness.lifecycleUnfocusedVisibleDocker = { passed: false };
  let rowAdjustments = [];
  try {
    await nativeClick(app, feature.getByRole('button', { name: 'Usage', exact: true }));
    const otherSurface = pane(page, 3).locator('.terminal-surface:visible');
    const geometry = () => otherSurface.evaluate(surface => {
      const terminal = surface.querySelector('.xterm'), host = terminal?.parentElement;
      const box = surface.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
      return { surface: box.toJSON(), hostWidth: host?.clientWidth ?? 0, hostHeight: host?.clientHeight ?? 0, centerOwned: !!hit && surface.contains(hit), centerClass: hit?.className };
    });
    const initial = await geometry();
    // Padding-only collapsed tiles can pass locator visibility while their center hits a resize handle.
    // Reverse only the recorded row expansion through the existing public handle, then restore it.
    if (!initial.hostWidth || !initial.hostHeight) rowAdjustments = report.lifecycle.initialFeatureLayout.drags.filter(drag => drag.axis === 'row');
    report.lifecycle.unfocusedFocusAttempt = { initial, rowAdjustments };
    for (const drag of [...rowAdjustments].reverse()) await dragSeparator(app, drag.to, drag.from);
    const actual = await geometry();
    report.lifecycle.unfocusedFocusAttempt.beforeClick = actual;
    assert.ok(actual.hostWidth > 0 && actual.hostHeight > 0 && actual.centerOwned, 'other native terminal must have actual input area and own the native click point');
    await nativeInput(app, [{ type: 'mouseMove', x: Math.round(await page.evaluate(() => innerWidth / 2)), y: 24 }]);
    await otherSurface.click({ trial: true });
    Object.assign(report.lifecycle.unfocusedFocusAttempt, { surface: actual.surface, dispatch: await nativeClick(app, otherSurface) });
    await until(async () => {
      const observation = await pane(page, 3).locator('.xterm-helper-textarea').evaluate(element => ({ rendererAt: performance.now(), focused: document.activeElement === element, activeClass: document.activeElement?.className, box: element.getBoundingClientRect().toJSON() }));
      report.lifecycle.unfocusedFocusAttempt.latest = observation;
      return observation.focused;
    }, 'keyboard focus genuinely moves to the other native pane', 1000);
    assert.ok(await feature.getByRole('button', { name: 'Usage', exact: true }).isVisible(), 'unfocused Docker tile remains actually visible');
    const unfocusedStatsStart = ssh.events.length;
    await until(() => ssh.events.slice(unfocusedStatsStart).filter(event => event.type === 'exec' && /^docker stats /.test(event.command)).length >= 2, 'visible but unfocused Usage continues real stats polling', 8000);
    const otherFocusRetained = await pane(page, 3).locator('.xterm-helper-textarea').evaluate(element => document.activeElement === element);
    const usageVisible = await feature.getByRole('button', { name: 'Usage', exact: true }).isVisible();
    const transferReadsDuringFocus = ['transfer-a.bin', 'transfer-b.bin'].map(name => {
      const reads = ssh.events.slice(unfocusedStatsStart).filter(event => event.type === 'transfer-read' && event.path === `/${name}`);
      return { name, count: reads.length, firstOffset: reads[0]?.offset, lastOffset: reads.at(-1)?.offset };
    });
    report.correctness.lifecycleUnfocusedVisibleDocker = { passed: otherFocusRetained && usageVisible, keyboardFocus: 'Benchmark 3 native textarea', keyboardFocusRetained: otherFocusRetained, usageVisible, commands: ssh.events.slice(unfocusedStatsStart).filter(event => event.type === 'exec' && /^docker stats /.test(event.command)), transferReadsDuringFocus };
  } catch (error) {
    report.correctness.lifecycleUnfocusedVisibleDocker.error = error.stack;
  } finally {
    for (const drag of rowAdjustments) await dragSeparator(app, drag.from, drag.to);
    if (rowAdjustments.length) report.lifecycle.unfocusedFocusAttempt.restoredFeature = await feature.boundingBox();
  }
  return { feature, sidebarToggle };
}
async function lifecycle(context, docker) {
  const { app, page, ssh, profile, root, directory, report } = context;
  const manualOnly = process.argv.includes('--manual-only');
  const visibilityOnly = process.argv.includes('--visibility-only');
  assert.ok(!(manualOnly && visibilityOnly), 'choose either the human-window or visible-Docker supplement');
  report.lifecycle = { cycles: [], snapshots: [], warmupCycles: 3, measuredCycles: 20, cacheExpiryMs: 310000, cachePolicy: 'Inactive TanStack Query data: default gcTime 300000ms; observe 310000ms without clearing caches or forcing GC.', observations: ['CDP heap/DOM/listener counters and Performance metrics', 'Electron process CPU/memory and worker resources', 'main-process EventEmitter listener counts', 'real SSH fixture connections/processes/timers/pending reads when exposed', 'IPC channel counts reveal poll activity; renderer timers are not directly enumerable'] };
  if (manualOnly) {
    Object.assign(report.lifecycle, { mode: 'manual-only-window-supplement', warmupCycles: 0, measuredCycles: 0, cacheExpiryMs: null, cachePolicy: 'Not observed in this focused supplement; retain independent full twenty-cycle/cache evidence.' });
    report.limitations.push('Human-window supplement only: same real full mixed load/editor state, no twenty-cycle/cache/latency or completed-transfer integrity claim. Active synthetic queue tasks are released by normal application quit after this phase.');
  }
  if (visibilityOnly) {
    Object.assign(report.lifecycle, { mode: 'unfocused-visible-docker-supplement', warmupCycles: 0, measuredCycles: 0, cacheExpiryMs: null, cachePolicy: 'Not observed; independent full twenty-cycle/cache reports remain authoritative.' });
    report.limitations.push('Focused visible/unfocused Docker correctness only under the real mixed background workload. No editor/window/latency/twenty-cycle/cache/completed-transfer claim; active synthetic tasks end at normal app quit.');
  }
  await runMixed({ ...context, interactive: true });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  let previousIpc = 0;
  async function snapshot(label) {
    const main = await app.evaluate(({ app, ipcMain }) => {
      const listeners = emitter => Object.fromEntries(emitter.eventNames().map(name => [String(name), emitter.listenerCount(name)]));
      return { at: performance.now(), processes: app.getAppMetrics(), heap: process.memoryUsage(), processListeners: listeners(process), ipcListeners: listeners(ipcMain), latestSample: global.__ownshellBenchmark.metrics().at(-1), ipc: global.__ownshellBenchmark.ipc() };
    });
    const channels = {};
    for (const event of main.ipc.slice(previousIpc)) channels[event.channel] = (channels[event.channel] ?? 0) + 1;
    previousIpc = main.ipc.length; delete main.ipc;
    const item = { label, at: performance.now(), main, ipcSincePrevious: channels, rendererHeap: await cdp.send('Runtime.getHeapUsage'), dom: await cdp.send('Memory.getDOMCounters'), performance: (await cdp.send('Performance.getMetrics')).metrics, fixture: ssh.resources ? ssh.resources() : null, nativeShells: ssh.events.filter(e => e.type === 'shell-open' && e.native).length - ssh.events.filter(e => e.type === 'shell-close' && e.native).length };
    report.lifecycle.snapshots.push(item);
    fs.writeFileSync(path.join(directory, 'lifecycle-progress.json'), JSON.stringify(report.lifecycle, null, 2));
    return item;
  }
  await snapshot('mixed-ready');
  if (visibilityOnly) {
    const eventsStart = ssh.events.length, before = await transferSnapshot(page);
    await prepareDockerVisibility(context, docker);
    assert.equal(report.correctness.lifecycleUnfocusedVisibleDocker.passed, true, 'visible Docker keeps polling while another actual native pane owns keyboard focus');
    const after = await transferSnapshot(page), protocol = ssh.events.slice(eventsStart);
    const reads = [];
    for (const name of ['transfer-a.bin', 'transfer-b.bin']) {
      const original = before.queue.find(task => task.file_name === name);
      assert.ok(original?.status === 'active', `${name} original task active before visibility supplement`);
      assert.ok(after.queue.some(task => task.id === original.id && task.status === 'active'), `${name} same original task active after visibility supplement`);
      assert.ok(!protocol.some(event => event.type === 'file-close' && event.path === `/${name}`), `${name} does not finish during the visibility proof`);
      const events = protocol.filter(event => event.type === 'transfer-read' && event.path === `/${name}`);
      assert.ok(events.length, `${name} makes actual real SFTP progress during the visibility proof`);
      assert.ok(report.correctness.lifecycleUnfocusedVisibleDocker.transferReadsDuringFocus.find(item => item.name === name)?.count > 0, `${name} makes actual reads while the other native pane retains keyboard focus`);
      reads.push({ name, id: original.id, count: events.length, firstOffset: events[0].offset, lastOffset: events.at(-1).offset });
    }
    report.correctness.visibilityOnlyLoad = { before, after, reads, originalIdentityAndActiveEndpointsProved: true };
    await snapshot('visibility-only-proved');
    await cdp.detach();
    return;
  }
  await nativeClick(app, pane(page, 1).getByRole('button', { name: 'Terminal', exact: true }));
  await nativeClick(app, pane(page, 1).locator('.terminal-surface:visible'));
  report.correctness.visibleOutputBeforeWindowResize = await verifyContinuedVisibleOutput(pane(page, 1));
  // Drafts are tested with actual native input, resize/reflow, save and independent SFTP reread.
  await pane(page, 1).getByRole('button', { name: 'Files', exact: true }).click();
  await pane(page, 1).getByText('editor.txt', { exact: true }).dblclick();
  await page.locator('.cm-content:visible').waitFor();
  await page.locator('.cm-content:visible').focus(); await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home');
  const contentBox = await page.locator('.cm-content:visible').boundingBox();
  const scrollBox = await page.locator('.cm-scroller:visible').boundingBox();
  let inserted = '';
  const original = text(profile.textBytes);
  for (let sample = 0; sample < 30; sample++) {
    const char = String.fromCharCode(65 + sample % 26); inserted += char;
    const expected = inserted + original.toString('ascii', 0, 127);
    if (manualOnly) await nativeInput(app, textEvents(char));
    else report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `lifecycle-typing-${sample}`, kind: 'typing', region: rect({ x: contentBox.x, y: scrollBox.y + 5, width: Math.min(880, scrollBox.x + scrollBox.width - contentBox.x - 20), height: 18 }), action: () => nativeInput(app, textEvents(char)), outcome: () => page.waitForFunction(expected => document.querySelector('.cm-line')?.textContent === expected, expected) }));
  }
  await exerciseWindowResize(context, { expectedFirstLine: inserted + original.toString('ascii', 0, 127), outputView: pane(page, 1), outputBefore: report.correctness.visibleOutputBeforeWindowResize.after, manual: manualOnly || process.argv.includes('--manual-window-resize'), manualOnly });
  assert.equal(await page.locator('.cm-line').first().innerText(), inserted + original.toString('ascii', 0, 127), 'whole-window resize restores original draft and baseline geometry before ordinary latency samples');
  for (let sample = 0; !manualOnly && sample < 30; sample++) {
    const previous = await page.locator('.cm-scroller:visible').evaluate(element => element.scrollTop);
    report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `lifecycle-scroll-${sample}`, kind: 'scroll', region: rect({ x: contentBox.x, y: scrollBox.y + 100, width: 600, height: 120 }), action: () => nativeWheel(app, contentBox.x + 200, scrollBox.y + 150), outcome: () => page.waitForFunction(previous => document.querySelector('.cm-scroller').scrollTop > previous, previous), finalOutcome: async () => {
      const scroll = await page.locator('.cm-scroller:visible').evaluate(element => ({ top: element.scrollTop, maximum: element.scrollHeight - element.clientHeight }));
      assert.ok(scroll.top > previous && scroll.top <= scroll.maximum + 1, 'native editor scroll advances within the real full document');
      return scroll;
    } }));
  }
  await page.keyboard.press('Meta+s'); await page.locator('.cm-content').waitFor({ state: 'detached' });
  const saved = await sftpRead(ssh, '/editor.txt');
  assert.deepEqual(saved, Buffer.concat([Buffer.from(inserted), original]));
  report.correctness.lifecycleDraft = { bytes: saved.length, sha256: createHash('sha256').update(saved).digest('hex'), layoutReflowPreserved: true };
  await nativeClick(app, pane(page, 1).getByRole('button', { name: 'Terminal', exact: true }));
  await nativeClick(app, pane(page, 1).locator('.terminal-surface:visible'));
  report.correctness.visibleOutputAfterWindowResize = await verifyContinuedVisibleOutput(pane(page, 1));
  await nativeClick(app, pane(page, 1).getByRole('button', { name: 'Files', exact: true }));
  if (manualOnly) {
    report.correctness.manualOnlyWindowSupplement = { nativeWillResizeObserved: report.lifecycle.windowResize.transitions.some(transition => transition.mode === 'manual' && transition.manualObserved), scope: 'Human native resize and real editor/protocol state only; no full-cycle/cache/latency claim. Operator attestation remains separate.' };
    await snapshot('manual-window-state-proved');
    await cdp.detach();
    return;
  }
  // Warm the actual four feature views before identical measured cycles.
  const { feature, sidebarToggle } = await prepareDockerVisibility(context, docker);
  await feature.getByRole('button', { name: 'Database', exact: true }).click();
  await feature.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Lifecycle SQLite (sqlite)', exact: true }).click();
  await feature.getByRole('button', { name: 'Connect', exact: true }).click();
  await feature.getByRole('button', { name: /^perf_other/ }).waitFor();
  await feature.getByRole('button', { name: /^perf_other/ }).click();
  await feature.getByText('other-table-only', { exact: true }).waitFor();
  await feature.getByRole('button', { name: 'Query', exact: true }).click();
  const queryDraft = "SELECT 'lifecycle-retained' AS label; -- unsaved draft";
  const queryBeforeDraft = await feature.locator('.cm-content:visible').innerText();
  const resetQueryDraft = async () => {
    await feature.locator('.cm-content:visible').focus();
    await page.keyboard.press('Meta+a'); await page.keyboard.insertText(queryDraft);
    await feature.getByRole('button', { name: 'Execute', exact: true }).click();
    await feature.getByText('lifecycle-retained', { exact: true }).waitFor();
  };
  const observeQueryHistory = async () => {
    await feature.locator('.cm-content:visible').focus();
    const undoDispatch = await nativeInput(app, [{ type: 'keyDown', keyCode: 'z', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'z', modifiers: ['meta'] }]);
    await wait(100);
    const afterUndo = await feature.locator('.cm-content:visible').innerText();
    const redoDispatch = await nativeInput(app, [{ type: 'keyDown', keyCode: 'z', modifiers: ['meta', 'shift'] }, { type: 'keyUp', keyCode: 'z', modifiers: ['meta', 'shift'] }]);
    await wait(100);
    const afterRedo = await feature.locator('.cm-content:visible').innerText();
    const observation = { initialText: queryBeforeDraft, draft: queryDraft, afterUndo, afterRedo, undoPreserved: afterUndo === queryBeforeDraft, redoPreserved: afterRedo === queryDraft, undoDispatch, redoDispatch };
    if (afterRedo !== queryDraft) {
      observation.explicitUserDraftRestore = true;
      await resetQueryDraft();
    }
    return observation;
  };
  await resetQueryDraft();
  report.correctness.lifecycleQueryHistoryBeforeCycles = await observeQueryHistory();
  await feature.getByRole('button', { name: 'Terminal', exact: true }).click();
  const stableShellCount = profile.terminals;
  const ownerCloseBaseline = ssh.resources();
  await nativeClick(app, sidebarToggle); await wait(250);
  await page.getByRole('button', { name: 'Benchmark 1', exact: true }).click();
  await nativeClick(app, sidebarToggle); await wait(250);
  const pendingOwner = page.getByTitle('Close pane', { exact: true }).last().locator('xpath=../../..');
  await pendingOwner.locator('.xterm').filter({ hasText: 'password:' }).waitFor();
  await pendingOwner.locator('.xterm-helper-textarea:visible').focus();
  await nativeInput(app, [...textEvents(ssh.password), { type: 'keyDown', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }]);
  await until(() => ssh.events.filter(e => e.type === 'shell-open' && e.native).length - ssh.events.filter(e => e.type === 'shell-close' && e.native).length === stableShellCount + 1, 'same-host pending owner native shell');
  const closeBox = await pendingOwner.getByTitle('Close pane', { exact: true }).boundingBox();
  const pendingStart = ssh.events.length;
  const initializationGate = ssh.holdNextSftpInitialization();
  try {
    await nativeClick(app, pendingOwner.getByRole('button', { name: 'Files', exact: true }));
    await until(() => ssh.events.slice(pendingStart).some(e => e.type === 'sftp-init-held'), 'real owned SFTP subsystem request held before acceptance');
    const pendingSftpInitialization = !ssh.events.slice(pendingStart).some(e => e.type === 'list-start');
    const point = { x: Math.round(closeBox.x + closeBox.width / 2), y: Math.round(closeBox.y + closeBox.height / 2) };
    const closeDispatch = await nativeInput(app, [{ type: 'mouseMove', ...point }, { type: 'mouseDown', button: 'left', clickCount: 1, ...point }, { type: 'mouseUp', button: 'left', clickCount: 1, ...point }]);
    report.correctness.lifecyclePendingOwnerClose = { pendingSftpInitialization, closeDispatch, before: ownerCloseBaseline };
    const ownedHelpers = () => ssh.events.slice(pendingStart).filter(event => event.type === 'process-created' && event.command === null).map(event => event.pid);
    await until(() => ssh.resources().clients === ownerCloseBaseline.clients && ssh.resources().pendingSftpInitializations === 0 && ownedHelpers().every(pid => ssh.events.some(event => event.type === 'process-exit' && event.pid === pid)), 'pending same-host owner releases its exact clients, held subsystem and interactive helper PIDs; unrelated Docker exec counts may vary');
    report.correctness.lifecyclePendingOwnerClose.ownedHelperPids = ownedHelpers();
  } finally {
    initializationGate.release();
    if (report.correctness.lifecyclePendingOwnerClose) report.correctness.lifecyclePendingOwnerClose.after = ssh.resources();
  }
  for (const name of ['transfer-a.bin', 'transfer-b.bin']) {
    assert.ok(!ssh.events.some(e => e.type === 'file-close' && e.path === '/' + name), 'both queue-owned same-host transfers remain active through worker owner close');
    await until(() => ssh.events.slice(pendingStart).some(e => e.type === 'transfer-read' && e.path === '/' + name), 'same-host queue transfer continues after owner close');
  }
  async function cycle(index, measured) {
    const record = { index, measured, completed: false, startedAt: performance.now(), checks: {} };
    report.lifecycle.cycles.push(record);
    await feature.getByRole('button', { name: 'Terminal', exact: true }).click();
    const input = feature.locator('.xterm-helper-textarea:visible'); await input.focus();
    const marker = `lifecycle-${measured ? 'measure' : 'warm'}-${index}`;
    await nativeInput(app, textEvents(marker));
    for (const name of ['Files', 'Database', 'Docker']) {
      await feature.getByRole('button', { name, exact: true }).click(); await wait(100);
      if (name === 'Database') {
        record.checks.databaseDraftPreservedWhileHidden = await feature.locator('.cm-content:visible').innerText() === queryDraft;
        if (!record.checks.databaseDraftPreservedWhileHidden) await resetQueryDraft();
      }
    }
    if (!(await feature.getByRole('button', { name: 'Usage', exact: true }).count())) {
      await feature.getByText(docker.name, { exact: true }).click();
      await feature.getByRole('button', { name: 'Usage', exact: true }).waitFor();
    }
    // Cover, do not close, the live workspace and then return through real overlay controls.
    const settingsButton = page.getByTitle('Settings', { exact: true });
    // Park away from the top-right toast: hovering it pauses its natural expiry.
    await nativeInput(app, [{ type: 'mouseMove', x: Math.round(await page.evaluate(() => innerWidth / 2)), y: 24 }]);
    await settingsButton.click({ trial: true }); // Public actionability only; the real action remains native below.
    await page.evaluate(() => {
      const state = { event: null };
      state.listener = event => { const button = event.target.closest('button'); state.event = { isTrusted: event.isTrusted, at: event.timeStamp, timeOrigin: performance.timeOrigin, clientX: event.clientX, clientY: event.clientY, targetTag: event.target.tagName, buttonTitle: button?.title, buttonText: button?.textContent }; };
      window.__ownshellLifecycleSettingsClick = state;
      addEventListener('click', state.listener, { capture: true, once: true });
    });
    record.settingsPreflight = await settingsButton.evaluate(element => { const box = element.getBoundingClientRect(), target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return { rect: box.toJSON(), receivesPointer: !!target && element.contains(target) }; });
    record.settingsDispatch = await nativeClick(app, settingsButton);
    await wait(75);
    record.settingsClick = await page.evaluate(() => { const state = window.__ownshellLifecycleSettingsClick; removeEventListener('click', state.listener, true); delete window.__ownshellLifecycleSettingsClick; return state.event; });
    await page.getByRole('button', { name: 'Close Settings', exact: true }).waitFor();
    const hiddenStart = ssh.events.length;
    await wait(2200);
    record.hiddenDockerCommands = ssh.events.slice(hiddenStart).filter(e => e.type === 'exec' && /\bdocker\b/.test(e.command)).map(({ at, command }) => ({ at, command }));
    await nativeClick(app, page.getByRole('button', { name: 'Close Settings', exact: true }));
    await feature.getByRole('button', { name: 'Terminal', exact: true }).click();
    await input.focus(); await nativeInput(app, [{ type: 'keyDown', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }]);
    await until(() => ssh.events.some(e => e.type === 'echo' && e.text === marker), 'partially entered command survives feature/overlay hiding');
    record.checks.pendingTerminalInputPreserved = true;
    await feature.locator('.xterm:visible').filter({ hasText: `ECHO ${marker}` }).waitFor();
    // A transient real authenticated native session changes the grid and must be torn down on true close.
    const host = profile.terminals;
    const beforeOpen = ssh.events.filter(e => e.type === 'shell-open' && e.native).length;
    const beforeClose = ssh.events.filter(e => e.type === 'shell-close' && e.native).length;
    const beforeResources = ssh.resources();
    await nativeClick(app, sidebarToggle); await wait(250);
    await page.getByRole('button', { name: `Benchmark ${host}`, exact: true }).click();
    await nativeClick(app, sidebarToggle); await wait(250);
    const transient = page.getByTitle('Close pane', { exact: true }).last().locator('xpath=../../..');
    await transient.locator('.xterm').filter({ hasText: 'password:' }).waitFor();
    await transient.locator('.xterm-helper-textarea:visible').focus();
    await nativeInput(app, [...textEvents(ssh.password), { type: 'keyDown', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }]);
    await until(() => ssh.events.filter(e => e.type === 'shell-open' && e.native).length > beforeOpen, 'transient native session authenticated');
    record.transientLayout = await expandPane(context, transient);
    await transient.getByRole('button', { name: 'Files', exact: true }).click();
    await transient.getByText('editor.txt', { exact: true }).waitFor();
    await transient.getByRole('button', { name: 'Database', exact: true }).click();
    await transient.getByRole('combobox').first().waitFor();
    await transient.getByRole('button', { name: 'Docker', exact: true }).click();
    await transient.getByText(docker.name, { exact: true }).waitFor();
    await snapshot(`${measured ? 'cycle' : 'warmup'}-${index}-open`);
    const separator = page.getByRole('separator').first();
    const separatorBox = await separator.boundingBox();
    if (separatorBox) {
      const x = separatorBox.x + separatorBox.width / 2, y = separatorBox.y + separatorBox.height / 2;
      await nativeInput(app, [{ type: 'mouseMove', x: Math.round(x), y: Math.round(y) }, { type: 'mouseDown', button: 'left', clickCount: 1, x: Math.round(x), y: Math.round(y) }, { type: 'mouseMove', x: Math.round(x + (separatorBox.width < separatorBox.height ? 10 : 0)), y: Math.round(y + (separatorBox.width >= separatorBox.height ? 10 : 0)) }, { type: 'mouseUp', button: 'left', clickCount: 1, x: Math.round(x + (separatorBox.width < separatorBox.height ? 10 : 0)), y: Math.round(y + (separatorBox.width >= separatorBox.height ? 10 : 0)) }]);
    }
    await nativeClick(app, transient.getByTitle('Close pane', { exact: true }));
    await until(() => ssh.events.filter(e => e.type === 'shell-close' && e.native).length > beforeClose, 'true close releases native shell');
    await until(() => ssh.resources().clients === beforeResources.clients, 'true close releases transient native and structured feature connections');
    record.checks.closedFeatureConnectionsReleased = true;
    const remaining = ssh.events.filter(e => e.type === 'shell-open' && e.native).length - ssh.events.filter(e => e.type === 'shell-close' && e.native).length;
    assert.equal(remaining, stableShellCount, 'only intentionally retained native sessions remain');
    record.checks.closedNativeSessionReleased = true;
    record.retainedLayout = await expandPane(context, feature);
    await feature.getByRole('button', { name: 'Docker', exact: true }).click();
    record.checks.dockerSelectionPreservedAcrossLayout = await feature.getByRole('button', { name: 'Usage', exact: true }).isVisible().catch(() => false);
    await feature.getByRole('button', { name: 'Database', exact: true }).click();
    record.checks.databaseDraftPreservedAcrossLayout = await feature.locator('.cm-content:visible').innerText() === queryDraft;
    await feature.getByRole('button', { name: 'Terminal', exact: true }).click();
    await feature.locator('.xterm:visible').filter({ hasText: `ECHO ${marker}` }).waitFor();
    const unprimedStartedAt = performance.now();
    record.unprimedTerminalAfterLayout = { initial: await terminalViewport(feature) };
    let unprimed = record.unprimedTerminalAfterLayout.initial;
    while ((!unprimed.atBottom || !unprimed.rows.join('').includes(`ECHO ${marker}`)) && performance.now() - unprimedStartedAt < 1000) {
      await wait(50);
      unprimed = await terminalViewport(feature);
    }
    record.unprimedTerminalAfterLayout.settled = unprimed;
    record.unprimedTerminalAfterLayout.observedMs = performance.now() - unprimedStartedAt;
    record.checks.terminalVisibleHistoryPreservedAcrossLayout = unprimed.atBottom && unprimed.rows.join('').includes(`ECHO ${marker}`);
    const continued = `continued-${measured ? 'measure' : 'warm'}-${index}`;
    await input.focus();
    await nativeInput(app, [...textEvents(continued), { type: 'keyDown', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }]);
    await until(() => ssh.events.some(event => event.type === 'echo' && event.text === continued), 'same real session replies after layout');
    await feature.locator('.xterm:visible').filter({ hasText: `ECHO ${continued}` }).waitFor();
    const continuedObservationStarted = performance.now();
    record.visibleTerminalAfterLayoutInitial = await terminalViewport(feature);
    record.visibleTerminalAfterLayout = record.visibleTerminalAfterLayoutInitial;
    const continuedVisible = state => state.atBottom && state.cursorVisible && state.rows.join('').includes(`ECHO ${continued}`);
    while (!continuedVisible(record.visibleTerminalAfterLayout) && performance.now() - continuedObservationStarted < 1000) {
      await wait(50);
      record.visibleTerminalAfterLayout = await terminalViewport(feature);
    }
    record.visibleTerminalAfterLayoutObservedMs = performance.now() - continuedObservationStarted;
    record.checks.continuedVisibleTerminalOutputAfterLayout = continuedVisible(record.visibleTerminalAfterLayout);
    if (measured) {
      const surface = await feature.locator('.terminal-surface:visible').boundingBox();
      const region = rect({ x: surface.x + 8, y: surface.y + 8, width: Math.min(700, surface.width - 40), height: Math.min(100, surface.height - 20) });
      const completed = ['transfer-a.bin', 'transfer-b.bin'].filter(name => ssh.events.some(e => e.type === 'file-close' && e.path === '/' + name));
      record.latencyPhase = completed.length ? 'unmeasured-retention-after-natural-transfer-completion' : 'fixed-mixed-load';
      for (const name of completed) {
        const lastRead = ssh.events.findLast(e => e.type === 'transfer-read' && e.path === '/' + name);
        assert.equal(lastRead.offset + lastRead.bytes, schedule.transferBytes, 'only complete natural transfers may enter unmeasured retention');
      }
      for (const name of ['Files', 'Terminal']) {
        const action = () => nativeClick(app, feature.getByRole('button', { name, exact: true }));
        const outcome = () => name === 'Files' ? feature.getByText('editor.txt', { exact: true }).waitFor({ state: 'visible' }) : feature.locator('.xterm:visible').waitFor();
        if (completed.length) { await action(); await outcome(); }
        else report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `lifecycle-${index}-switch-${name}`, kind: 'warm-tab-switch', region, action, outcome }));
      }
    }
    await snapshot(`${measured ? 'cycle' : 'warmup'}-${index}-closed`);
    record.endedAt = performance.now(); record.completed = true;
    console.log(`LIFECYCLE_CYCLE ${report.profile} ${measured ? 'measured' : 'warmup'} ${index}`);
  }
  for (let i = 0; i < 3; i++) await cycle(i, false);
  await snapshot('warmed');
  for (let i = 0; i < 20; i++) await cycle(i, true);
  report.summary.typing = quantiles(report.samples.filter(s => s.kind === 'typing'), profile.inputTargetMs);
  report.summary.scroll = quantiles(report.samples.filter(s => s.kind === 'scroll'), profile.inputTargetMs);
  report.summary['warm-tab-switch'] = quantiles(report.samples.filter(s => s.kind === 'warm-tab-switch'), profile.switchTargetMs);
  report.correctness.lifecycleCycleCount = report.lifecycle.cycles.filter(c => c.measured && c.completed).length;
  report.correctness.lifecycleStreamOrder = await page.evaluate(() => Object.entries(globalThis.__perfTerminalStreams).filter(([, state]) => state.count).map(([sessionId, { tail, ...state }]) => ({ sessionId, ...state })));
  for (const stream of report.correctness.lifecycleStreamOrder) assert.deepEqual(stream.violations, [], 'hiding/layout cycling retains terminal output order');
  report.correctness.unmeasuredDrain = ssh.beginUnmeasuredDrain();
  const complete = name => fs.existsSync(path.join(root, 'downloads', name)) && fs.statSync(path.join(root, 'downloads', name)).size === schedule.transferBytes;
  await until(() => ['transfer-a.bin', 'transfer-b.bin'].every(complete), 'retained hidden transfers complete', 120000);
  const expected = createHash('sha256');
  for (let offset = 0; offset < schedule.transferBytes; offset += 1024 * 1024) expected.update(transferChunk(offset, Math.min(1024 * 1024, schedule.transferBytes - offset)));
  const digest = expected.digest('hex');
  report.correctness.lifecycleTransfers = [];
  for (const name of ['transfer-a.bin', 'transfer-b.bin']) { const hash = createHash('sha256'); for await (const chunk of fs.createReadStream(path.join(root, 'downloads', name))) hash.update(chunk); assert.equal(hash.digest('hex'), digest); report.correctness.lifecycleTransfers.push({ name, bytes: schedule.transferBytes, sha256: digest }); }
  await until(async () => Object.values((await transferSnapshot(page)).latest).filter(event => event.status === 'completed').length === 2, 'both public transfer completion snapshots');
  const finalProgress = await transferSnapshot(page);
  assert.equal(finalProgress.identityViolation, null, 'original two transfer IDs retained through resize, cycles, hidden work and completion');
  await verifyDownloadEndStates(context, Object.values(finalProgress.latest).map(event => ({ ...event, at: event.rendererAt })));
  report.correctness.progressObservation = 'Bounded latest-per-original-task snapshot, not total progress event count; firstAt/lastAt both describe that final observed event.';
  await page.screenshot({ path: path.join(directory, 'lifecycle-after-cycles.png') });
  await snapshot('before-close-all');
  // Deliberately choose older history through genuine user wheel input, then
  // preserve its logical text anchor across grid-to-split/orientation changes.
  const historyBox = await feature.locator('.xterm-scrollable-element:visible').boundingBox();
  const historyBaseline = await terminalViewport(feature);
  await page.evaluate(() => {
    const state = { event: null };
    state.listener = event => { state.event = { isTrusted: event.isTrusted, at: event.timeStamp, timeOrigin: performance.timeOrigin, deltaY: event.deltaY, wheelDeltaY: event.wheelDeltaY, deltaMode: event.deltaMode, clientX: event.clientX, clientY: event.clientY, targetClass: event.target.className }; };
    window.__ownshellLifecycleHistoryWheel = state;
    addEventListener('wheel', state.listener, { capture: true, once: true, passive: true });
  });
  const historyDispatch = await nativeInput(app, [{ type: 'mouseMove', x: Math.round(historyBox.x + historyBox.width / 2), y: Math.round(historyBox.y + historyBox.height / 2) }, { type: 'mouseWheel', x: Math.round(historyBox.x + historyBox.width / 2), y: Math.round(historyBox.y + historyBox.height / 2), deltaX: 0, deltaY: 360, wheelTicksY: 360 / 120, canScroll: true }]);
  await wait(200);
  const historyWheel = await page.evaluate(() => { const state = window.__ownshellLifecycleHistoryWheel; removeEventListener('wheel', state.listener, true); delete window.__ownshellLifecycleHistoryWheel; return state.event; });
  const selectedHistory = await terminalViewport(feature);
  const selectedHistoryAnchor = selectedHistory.rows.map(row => row.trim()).find(row => /^ECHO\s+lifecycle-(warm|measure)-\d+$/.test(row));
  const historyEstablished = !!historyWheel?.isTrusted && !!historyWheel.wheelDeltaY && !selectedHistory.atBottom && !!selectedHistoryAnchor;
  report.correctness.userSelectedTerminalHistory = { initial: historyBaseline, before: selectedHistory, anchor: selectedHistoryAnchor, established: historyEstablished, dispatch: historyDispatch, wheel: historyWheel };
  for (let index = 2; index < profile.terminals; index++) await nativeClick(app, pane(page, index).getByTitle('Close pane', { exact: true }));
  // The standalone transfer pane was added last; transfers have now completed.
  await nativeClick(app, page.getByTitle('Close pane', { exact: true }).last());
  await feature.getByRole('button', { name: 'Database', exact: true }).click();
  report.correctness.lifecycleSplitDraft = { afterGridToSplit: await feature.locator('.cm-content:visible').innerText() === queryDraft };
  for (const title of ['Split Vertical (Stacked)', 'Split Horizontal (Side by Side)']) {
    await nativeClick(app, page.getByTitle(title, { exact: true }));
    report.correctness.lifecycleSplitDraft[title] = await feature.locator('.cm-content:visible').innerText() === queryDraft;
  }
  await feature.getByRole('button', { name: 'Terminal', exact: true }).click();
  const restoredHistory = await terminalViewport(feature);
  report.correctness.userSelectedTerminalHistory.after = restoredHistory;
  report.correctness.lifecycleSplitTerminalHistoryPreserved = historyEstablished && restoredHistory.rows.join('').includes(selectedHistoryAnchor) && !restoredHistory.atBottom;
  await feature.getByRole('button', { name: 'Database', exact: true }).click();
  report.correctness.lifecycleQueryHistoryAfterLayouts = await observeQueryHistory();
  await page.screenshot({ path: path.join(directory, 'lifecycle-split-layout.png') });
  while (await page.getByTitle('Close pane', { exact: true }).count()) await page.getByTitle('Close pane', { exact: true }).last().click();
  await until(() => ssh.events.filter(e => e.type === 'shell-open' && e.native).length === ssh.events.filter(e => e.type === 'shell-close' && e.native).length, 'all closed native sessions release');
  await snapshot('all-panes-closed');
  await app.evaluate(() => global.__ownshellBenchmark.markPhase('lifecycle-cache-expiry'));
  report.lifecycle.cacheActivity = [];
  for (let elapsed = 0; elapsed < 310000; elapsed += 10000) {
    await wait(10000);
    if ((elapsed + 10000) % 120000 === 0) report.lifecycle.cacheActivity.push({ elapsedMs: elapsed + 10000, purpose: 'Non-destructive genuine Shift input keeps the normal security timer active without touching inactive query caches.', dispatch: await nativeInput(app, [{ type: 'keyDown', keyCode: 'Shift' }, { type: 'keyUp', keyCode: 'Shift' }]) });
    await snapshot(`cache-expiry-${elapsed + 10000}`);
  }
  await page.screenshot({ path: path.join(directory, 'lifecycle-cache-expired.png') });
  report.correctness.lifecycleCacheObservedWithoutClearing = true;
  report.correctness.lifecycleLayoutSelections = report.lifecycle.cycles.filter(c => c.measured).map(c => c.checks.dockerSelectionPreservedAcrossLayout);
  report.correctness.lifecycleHiddenDockerCommands = report.lifecycle.cycles.filter(c => c.measured).reduce((count, cycle) => count + cycle.hiddenDockerCommands.length, 0);
  await cdp.detach();
  const queueFiles = ['/transfer-a.bin', '/transfer-b.bin'].map(file => {
    const opens = ssh.events.filter(event => event.type === 'file-open' && event.path === file);
    return { path: file, openCount: opens.length, connectionIds: opens.map(event => event.connectionId) };
  });
  const queueConnectionIds = [...new Set(queueFiles.flatMap(file => file.connectionIds))];
  const closedConnectionIds = new Set(ssh.events.filter(event => event.type === 'client-close').map(event => event.connectionId));
  const retainedConnectionIds = ssh.events.filter(event => event.type === 'client-open' && !closedConnectionIds.has(event.connectionId)).map(event => event.connectionId);
  const closedResources = ssh.resources();
  report.correctness.lifecycleConnectionOwnership = { queueFiles, queueConnectionIds, retainedConnectionIds, closedResources, policy: 'The singleton queue connection manager, not a pane/worker, owns its cached same-host SFTP transport until explicit manager disconnect/application quit. No idle TTL; not the managed-session 15-minute idle policy.' };
  assert.ok(report.correctness.lifecycleLayoutSelections.every(Boolean), 'layout changes retain the selected Docker container detail');
  assert.ok(report.lifecycle.cycles.filter(c => c.measured).every(c => c.checks.databaseDraftPreservedAcrossLayout && c.checks.databaseDraftPreservedWhileHidden), 'hidden/layout changes retain the real database query draft');
  assert.ok(Object.values(report.correctness.lifecycleSplitDraft).every(Boolean), 'grid/split/orientation changes retain the unsaved database draft');
  for (const phase of ['lifecycleQueryHistoryBeforeCycles', 'lifecycleQueryHistoryAfterLayouts']) assert.ok(report.correctness[phase].undoPreserved && report.correctness[phase].redoPreserved, `${phase}: real Undo/Redo preserves original editor history rather than only a copied draft string`);
  assert.equal(report.correctness.lifecycleHiddenDockerCommands, 0, 'fully covered Docker views do not poll while hidden');
  assert.ok(report.correctness.lifecycleUnfocusedVisibleDocker.passed, 'visible but unfocused Docker polls normally without stealing actual native keyboard focus');
  assert.ok(report.correctness.lifecyclePendingOwnerClose.pendingSftpInitialization, 'exercise actual same-host owner close before SFTP listing initialization finishes');
  assert.ok(report.correctness.userSelectedTerminalHistory.established, 'genuine native wheel with nonzero actual ticks establishes an older visible logical terminal-history anchor');
  assert.ok(report.lifecycle.cycles.every(c => c.checks.terminalVisibleHistoryPreservedAcrossLayout), 'old remote output remains inside the actual clip at the live bottom after every layout, before new user input can prime follow');
  assert.ok(report.lifecycle.cycles.every(c => c.checks.continuedVisibleTerminalOutputAfterLayout), 'fresh remote output/current cursor reaches the real visible bottom after every layout without further input or scrolling repair');
  assert.ok(report.correctness.lifecycleSplitTerminalHistoryPreserved, 'grid/split/orientation preserves that user-selected logical history without forcing bottom');
  assert.ok(queueFiles.every(file => file.openCount === 1 && Number.isInteger(file.connectionIds[0])), 'each original transfer opens exactly once on an identified real protocol connection');
  assert.equal(queueConnectionIds.length, 1, 'same-host original transfers share the one application-owned queue transport');
  assert.ok(retainedConnectionIds.every(id => queueConnectionIds.includes(id)), 'every pane/worker-owned transport releases; only the identified original queue transport may remain app-owned');
  assert.equal(closedResources.clients, retainedConnectionIds.length, 'real client count matches identified retained protocol owners');
  assert.equal(closedResources.sockets, retainedConnectionIds.length, 'no unowned accepted socket remains');
  assert.equal(report.lifecycle.snapshots.at(-1).main.latestSample.workers.length, 0, 'true close releases every pane-owned worker');
  for (const resource of ['processes', 'timers', 'pendingReads', 'forwards', 'pendingProcessShells', 'pendingSftpInitializations']) {
    assert.equal(closedResources[resource], 0, `true close releases owned ${resource}`);
  }
  for (const [kind, summary] of Object.entries(report.summary)) {
    assert.ok(summary.n >= 30, `${kind} retains at least thirty real fixed-mixed-load samples`);
    assert.ok(summary.p95 <= summary.targetMs, `${kind} current capture upper-bound p95 ${summary.p95}ms is not within ${summary.targetMs}ms; this alone does not diagnose visible latency`);
  }
}
async function scene(context) {
  const docker = await startDockerFixture(context.root);
  let primaryError;
  try {
    docker.enable(context.ssh);
    const sqlitePath = path.join(context.root, 'lifecycle.sqlite');
    createSQLiteFixture(sqlitePath);
    const config = await context.page.evaluate(async ({ sqlitePath, hostLabel }) => {
      const hosts = await window.electronAPI.hosts.getAll();
      const host = hosts.find(host => host.label === hostLabel);
      if (!host) throw new Error('Synthetic lifecycle host was not created');
      return window.electronAPI.dbConnections.create({ name: 'Lifecycle SQLite', type: 'sqlite', filePath: sqlitePath, connectionMode: 'local', sshHostId: host.id });
    }, { sqlitePath, hostLabel: `Benchmark ${context.profile.terminals}` });
    assert.equal(config.success, true, config.error);
    await context.page.reload();
    await context.page.getByRole('button', { name: 'Unlock', exact: true }).waitFor();
    await context.page.locator('input[type="password"]').fill('Benchmark-Only-2026!');
    await nativeClick(context.app, context.page.getByRole('button', { name: 'Unlock', exact: true }));
    await context.page.getByRole('button', { name: 'Servers', exact: true }).waitFor();
    await installTransferObserver(context.page);
    context.report.lifecycleDocker = { id: docker.id, name: docker.name, image: docker.image, workload: docker.workload };
    await lifecycle(context, docker);
  } catch (error) {
    primaryError = error;
    try { await context.page.screenshot({ path: path.join(context.directory, 'lifecycle-failure.png'), timeout: 5000 }); }
    catch (captureError) { context.report.lifecycleFailureCaptureError = captureError.message; }
    throw error;
  } finally {
    let observerCleanupError;
    try { await disposeTransferObserver(context.page); }
    catch (error) {
      context.report.lifecycleTransferObserverCleanupError = error.stack;
      observerCleanupError = error;
    }
    try { await docker.close(); }
    catch (error) {
      context.report.lifecycleDockerCleanupError = error.stack;
      if (!primaryError && !observerCleanupError) throw error;
    }
    if (!primaryError && observerCleanupError) throw observerCleanupError;
  }
}
function verifyApplicationShutdown(directory) {
  const reportBytes = fs.readFileSync(path.join(directory, 'report.json'));
  const traceBytes = fs.readFileSync(path.join(directory, 'fixture-events.json'));
  const report = JSON.parse(reportBytes), events = JSON.parse(traceBytes);
  const disposal = events.find(event => event.type === 'fixture-close-start');
  const queueFiles = ['/transfer-a.bin', '/transfer-b.bin'].map(file => ({ path: file, opens: events.filter(event => event.type === 'file-open' && event.path === file).map(event => event.connectionId) }));
  const queueConnectionIds = [...new Set(queueFiles.flatMap(file => file.opens))];
  const closedBeforeDisposal = new Set(events.filter(event => event.type === 'client-close' && disposal && event.at < disposal.at).map(event => event.connectionId));
  const unclosedBeforeDisposal = events.filter(event => event.type === 'client-open' && !closedBeforeDisposal.has(event.connectionId)).map(event => event.connectionId);
  const proof = { sourceReportSha256: createHash('sha256').update(reportBytes).digest('hex'), sourceProtocolTraceSha256: createHash('sha256').update(traceBytes).digest('hex'), method: 'Observe canonical actual Electron quit before fixture-close-start; no fixture-forced close counts as application release.', electronExited: report.safety.cleanup.electronExited, queueFiles, queueConnectionIds, queueClosedBeforeDisposal: queueConnectionIds.every(id => closedBeforeDisposal.has(id)), unclosedBeforeDisposal, fixtureDisposalStart: disposal };
  proof.passed = proof.electronExited && queueFiles.every(file => file.opens.length === 1 && Number.isInteger(file.opens[0])) && queueConnectionIds.length === 1 && proof.queueClosedBeforeDisposal && unclosedBeforeDisposal.length === 0 && disposal?.clients === 0 && disposal?.sockets === 0;
  fs.writeFileSync(path.join(directory, 'lifecycle-application-quit.json'), JSON.stringify(proof, null, 2) + '\n');
  assert.ok(proof.passed, 'actual application quit releases the identified app-owned queue transport and all sockets BEFORE fixture disposal');
}
if (require.main === module) (async () => {
  let directory, primaryError;
  try {
    await runProfile(process.argv.includes('--profile') ? process.argv[process.argv.indexOf('--profile') + 1] : 'everyday', async context => { directory = context.directory; await scene(context); });
  } catch (error) { primaryError = error; }
  if (directory) {
    try { verifyApplicationShutdown(directory); }
    catch (error) { if (primaryError) console.error('Independent application-quit proof failed:', error); else primaryError = error; }
  }
  if (primaryError) throw primaryError;
})().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scene };
