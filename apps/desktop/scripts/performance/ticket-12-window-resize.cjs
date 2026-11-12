'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nativeInput, nativeWheel, textEvents, scrollSnapshot } = require('./mixed-ui.cjs');
const { quantiles } = require('./workloads.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Observe only the two approved queue tasks. Retain the latest public event, not
// an unbounded event stream that would itself invalidate the retention scene.
async function installTransferObserver(page) {
  await page.evaluate(() => {
    const state = { latest: {}, firstIds: {}, identityViolation: null };
    const names = new Set(['transfer-a.bin', 'transfer-b.bin']);
    const unsubscribe = window.electronAPI.sftpTransfer.onProgress(event => {
      if (!names.has(event.fileName)) return;
      const first = state.firstIds[event.fileName];
      if (first && first !== event.transferId && !state.identityViolation) state.identityViolation = { first, next: event.transferId, fileName: event.fileName };
      state.firstIds[event.fileName] ??= event.transferId;
      state.latest[event.fileName] = { ...event, rendererAt: performance.now() };
    });
    window.__ownshellLifecycleTransfers = { state, unsubscribe };
  });
}
async function transferSnapshot(page) {
  return page.evaluate(async () => {
    const result = await window.electronAPI.sftpTransfer.getQueue();
    if (!result.success) throw new Error(result.error || 'Public transfer queue unavailable');
    return { ...window.__ownshellLifecycleTransfers.state, queue: result.queue };
  });
}
async function disposeTransferObserver(page) {
  await page.evaluate(() => {
    window.__ownshellLifecycleTransfers?.unsubscribe();
    delete window.__ownshellLifecycleTransfers;
  });
}

// Ticket-owned full-content observation, not a replacement latency matcher.
// Unlike a fixed editor ROI, capturePage() without a rectangle follows the real
// current native window content dimensions throughout enlargement/shrinkage.
async function collectTransition(context, specification) {
  const directory = path.join(context.directory, 'window-resize', specification.id);
  fs.mkdirSync(directory, { recursive: true });
  let announced = false;
  const readinessWatcher = specification.mode === 'manual' ? fs.watch(directory, (_event, filename) => {
    if (filename !== 'manual-readiness.json' || announced) return;
    try {
      const ready = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
      if (ready.state === 'ready-for-human-corner-drag') { announced = true; console.log(`WINDOW_RESIZE_READY ${JSON.stringify(ready)}`); }
    } catch { /* A subsequent filesystem change delivers the completed write. */ }
  }) : null;
  try {
  return await context.app.evaluate(async ({ BrowserWindow, screen, app }, { directory, specification }) => {
    const fs = process.getBuiltinModule('fs');
    const path = process.getBuiltinModule('path');
    const window = BrowserWindow.getAllWindows()[0];
    const now = () => performance.now();
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const policy = { api: 'webContents.capturePage() full content', cooldownMs: 4, windowMs: 5000, maximumDistinctFrames: 96, largestRepresentationBytesGuard: 1024 * 1024 * 1024 };
    const frames = [], readbacks = [], events = [], commands = [];
    let previousBitmap, retainedBytes = 0, stopped = false, task, captureError, stopReason = 'controller-finished';
    let captureStart, interactionStart, interactionEnd, resolveManual;
    const state = () => {
      const bounds = window.getBounds(), display = screen.getDisplayMatching(bounds);
      return { bounds, contentSize: window.getContentSize(), maximized: window.isMaximized(), display: { id: display.id, scaleFactor: display.scaleFactor, workArea: display.workArea } };
    };
    const listeners = {
      resize: () => events.push({ type: 'resize', at: now(), ...state() }),
      move: () => events.push({ type: 'move', at: now(), ...state() }),
      maximize: () => events.push({ type: 'maximize', at: now(), ...state() }),
      unmaximize: () => events.push({ type: 'unmaximize', at: now(), ...state() }),
      'will-resize': (_event, newBounds, details) => {
        events.push({ type: 'will-resize', at: now(), newBounds, details, ...state() });
        resolveManual?.();
      },
    };
    const initialListenerCounts = Object.fromEntries(Object.keys(listeners).map(name => [name, window.listenerCount(name)]));
    for (const [name, listener] of Object.entries(listeners)) window.on(name, listener);
    const initial = state();
    const cpuStart = process.cpuUsage(), memoryBefore = process.memoryUsage(), appMetricsBefore = app.getAppMetrics();
    async function take(kind) {
      const requestedAt = now(), requested = state();
      const image = await window.webContents.capturePage();
      const at = now(), completed = state();
      if (image.isEmpty()) throw new Error('Full-content capture returned an empty NativeImage');
      const metadataStart = now();
      const scaleFactors = image.getScaleFactors();
      const scaleFactor = Math.max(...scaleFactors, 1);
      const size = image.getSize(scaleFactor);
      const bitmap = image.toBitmap({ scaleFactor });
      const last = frames.at(-1);
      const repeated = last && last.size.width === size.width && last.size.height === size.height && last.scaleFactor === scaleFactor && previousBitmap?.equals(bitmap);
      if (repeated) { last.lastObservedAt = at; last.observations++; }
      else {
        frames.push({ image, at, lastObservedAt: at, observations: 1, size, scaleFactor, scaleFactors, bitmapBytes: bitmap.length, requested, completed });
        retainedBytes += bitmap.length;
      }
      previousBitmap = bitmap;
      readbacks.push({ kind, requestedAt, at, durationMs: at - requestedAt, metadataMs: now() - metadataStart, frameIndex: frames.length - 1, requested, completed, imageSize: size, scaleFactor });
      // Keep the triggering frame too: never silently drop a captured image.
      if (frames.length >= policy.maximumDistinctFrames) { stopped = true; stopReason = 'distinct-frame-guard'; }
      if (retainedBytes >= policy.largestRepresentationBytesGuard) { stopped = true; stopReason = 'observer-byte-guard'; }
    }
    async function loop() {
      try {
        while (!stopped) {
          if (now() - captureStart >= policy.windowMs) { stopReason = 'window-limit'; stopped = true; break; }
          await take('transition');
          if (!stopped) await wait(policy.cooldownMs);
        }
      } catch (error) { captureError = String(error.stack || error); stopped = true; stopReason = 'capture-error'; }
    }
    async function waitFor(predicate, label) {
      const deadline = now() + 2000;
      while (!predicate()) { if (now() > deadline) throw new Error(`Native window did not ${label}`); await wait(10); }
    }
    function setSize(width, height) {
      const bounds = window.getBounds(), content = window.getContentSize();
      const workArea = screen.getDisplayMatching(bounds).workArea;
      const outerWidth = width + bounds.width - content[0], outerHeight = height + bounds.height - content[1];
      const x = Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - outerWidth);
      const y = Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - outerHeight);
      window.setPosition(Math.round(x), Math.round(y), false);
      const requestedAt = now();
      window.setContentSize(width, height, false);
      commands.push({ type: 'setContentSize', requestedAt, requestedContentSize: [width, height], returnedAt: now(), ...state() });
    }
    let actionError, manualObserved = false;
    try {
      await take('initial-reference');
      if (specification.mode === 'manual') {
        const ready = { state: 'ready-for-human-corner-drag', token: `ticket12-${window.id}-${Date.now()}`, windowId: window.id, window: initial, readyAt: Date.now(), deadline: Date.now() + specification.readinessMs, instruction: 'Resize only this OwnShell window corner for 1–2 seconds, then release. No Accessibility permission changes or OS input automation.' };
        fs.writeFileSync(path.join(directory, 'manual-readiness.json'), JSON.stringify(ready, null, 2));
        let timer;
        const observed = await new Promise(resolve => {
          resolveManual = () => resolve(true);
          timer = setTimeout(() => resolve(false), specification.readinessMs);
        });
        clearTimeout(timer); resolveManual = undefined; manualObserved = observed;
        if (observed) {
          captureStart = interactionStart = now(); task = loop();
          while (now() - interactionStart < 3000 && (now() - interactionStart < 1500 || now() - (events.filter(event => event.type === 'resize').at(-1)?.at ?? interactionStart) < 750)) await wait(20);
          interactionEnd = now();
        }
        fs.writeFileSync(path.join(directory, 'manual-readiness.json'), JSON.stringify({ ...ready, state: observed ? 'observed-native-will-resize' : 'expired-without-native-will-resize', endedAt: Date.now() }, null, 2));
      } else {
        captureStart = interactionStart = now(); task = loop();
        if (specification.mode === 'maximize') {
          commands.push({ type: 'maximize', requestedAt: now() }); window.maximize();
          await waitFor(() => window.isMaximized(), 'maximize');
        } else if (specification.mode === 'restore') {
          commands.push({ type: 'unmaximize', requestedAt: now() }); window.unmaximize();
          await waitFor(() => !window.isMaximized(), 'restore');
        } else {
          const from = window.getContentSize(), to = specification.target;
          for (let step = 1; step <= 12; step++) {
            setSize(Math.round(from[0] + (to[0] - from[0]) * step / 12), Math.round(from[1] + (to[1] - from[1]) * step / 12));
            await wait(16); // Requested controller cadence, never an FPS claim.
          }
        }
        interactionEnd = now(); await wait(250);
      }
    } catch (error) { actionError = String(error.stack || error); }
    finally {
      stopped = true;
      if (task) await task;
      for (const [name, listener] of Object.entries(listeners)) window.removeListener(name, listener);
    }
    const captureEnd = now();
    const cpuDuringCapture = process.cpuUsage(cpuStart), memoryAfterCapture = process.memoryUsage(), appMetricsAfterCapture = app.getAppMetrics();
    const final = state();
    const finalListenerCounts = Object.fromEntries(Object.keys(listeners).map(name => [name, window.listenerCount(name)]));
    // Every PNG is encoded/written after the observation timestamps. Retain all
    // distinct content images plus all repeated-readback metadata, not endpoints.
    const encodingStart = now();
    const encoded = [];
    try {
      for (let index = 0; index < frames.length; index++) {
        const frame = frames[index], filename = `frame-${String(index).padStart(3, '0')}.png`;
        const started = now();
        const png = frame.image.toPNG({ scaleFactor: frame.scaleFactor });
        const encodedAt = now();
        fs.writeFileSync(path.join(directory, filename), png);
        const { image, ...metadata } = frame;
        encoded.push({ ...metadata, filename, pngWidth: png.readUInt32BE(16), pngHeight: png.readUInt32BE(20), pngBytes: png.length, encodingMs: encodedAt - started, writingMs: now() - encodedAt });
        frame.image = null;
      }
    } finally { for (const frame of frames) frame.image = null; previousBitmap = undefined; }
    return { id: specification.id, mode: specification.mode, policy, timeOrigin: performance.timeOrigin, initial, final, captureStart, captureEnd, interactionStart, interactionEnd, manualObserved, actionError, captureError, stopReason, readbacks, frames: encoded, commands, nativeEvents: events, retainedLargestRepresentationBitmapBytes: retainedBytes, encodingAndWritingMs: now() - encodingStart, initialListenerCounts, finalListenerCounts, cpuDuringCapture, cpuIncludingEncoding: process.cpuUsage(cpuStart), memoryBefore, memoryAfterCapture, memoryAfterEncoding: process.memoryUsage(), appMetricsBefore, appMetricsAfterCapture };
  }, { directory, specification });
  } finally { readinessWatcher?.close(); }
}

async function terminalViewport(view) {
  return view.locator('.xterm:visible').evaluate(element => {
    const viewport = element.querySelector('.xterm-scrollable-element');
    const legacy = element.querySelector('.xterm-viewport');
    const track = viewport.querySelector(':scope > .scrollbar.vertical');
    const thumb = track.querySelector('.slider');
    const box = viewport.getBoundingClientRect();
    const clip = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(style.overflowX)) { clip.left = Math.max(clip.left, rect.left); clip.right = Math.min(clip.right, rect.right); }
      if (/hidden|clip|auto|scroll/.test(style.overflowY)) { clip.top = Math.max(clip.top, rect.top); clip.bottom = Math.min(clip.bottom, rect.bottom); }
    }
    const inside = rect => rect.width > 0 && rect.height > 0 && rect.left >= clip.left - 1 && rect.right <= clip.right + 1 && rect.top >= clip.top - 1 && rect.bottom <= clip.bottom + 1;
    const rowElements = [...element.querySelectorAll('.xterm-rows > div')];
    const allRows = rowElements.map(row => row.textContent);
    const rows = rowElements.map(row => {
      const rect = row.getBoundingClientRect();
      if (rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1) return '';
      return [...row.querySelectorAll('span')].filter(span => !span.children.length && inside(span.getBoundingClientRect())).map(span => span.textContent).join('');
    });
    const sequences = [...rows.join('').matchAll(/BENCH\s+(\d{10})/g)].map(match => Number(match[1]));
    const surface = element.closest('.terminal-surface') ?? element;
    const hit = document.elementFromPoint((clip.left + clip.right) / 2, (clip.top + clip.bottom) / 2);
    const trackBox = track.getBoundingClientRect(), thumbBox = thumb.getBoundingClientRect();
    const bottomSlack = trackBox.bottom - thumbBox.bottom;
    const cursor = element.querySelector('.xterm-cursor');
    const cursorBox = cursor?.getBoundingClientRect();
    const cursorVisible = !!cursorBox && inside(cursorBox);
    const host = element.parentElement, hostStyle = getComputedStyle(host);
    return { rendererAt: performance.now(), legacyViewport: legacy ? { scrollTop: legacy.scrollTop, scrollHeight: legacy.scrollHeight, clientHeight: legacy.clientHeight, interpretation: 'Screen dimensions only; custom scrollbar owns actual scroll state.' } : null, surface: surface.getBoundingClientRect().toJSON(), fitHost: { box: host.getBoundingClientRect().toJSON(), cssWidth: hostStyle.width, cssHeight: hostStyle.height, padding: { top: hostStyle.paddingTop, right: hostStyle.paddingRight, bottom: hostStyle.paddingBottom, left: hostStyle.paddingLeft } }, viewport: box.toJSON(), clip, scrollbar: { track: trackBox.toJSON(), thumb: thumbBox.toJSON(), bottomSlack }, atBottom: trackBox.height > 0 && thumbBox.height > 0 && Math.abs(bottomSlack) <= 2, cursor: cursorBox?.toJSON() ?? null, cursorVisible, exposed: !!hit && surface.contains(hit), rows, allRows, firstSequence: sequences[0] ?? null, lastSequence: sequences.at(-1) ?? null };
  });
}
async function terminalPresentation(view) {
  const visible = await view.locator('.xterm:visible').count();
  return visible ? { state: 'visible', viewport: await terminalViewport(view) } : { state: 'feature-hidden', mountedElements: await view.locator('.xterm').count(), interpretation: 'The unchanged mixed profile shows Files/editor/listing; hidden viewport dimensions cannot prove bottom-follow. Verify through actual Terminal reveal after save.' };
}
async function verifyContinuedVisibleOutput(view) {
  const deadline = performance.now() + 5000;
  let before;
  do { before = await terminalViewport(view); if (before.exposed && before.lastSequence !== null && before.cursorVisible) break; await delay(50); } while (performance.now() < deadline);
  assert.ok(before.exposed && before.atBottom && before.cursorVisible && before.lastSequence !== null, `Actual emitting tile must show current visible output/cursor and bottom indicator before observing progress: ${JSON.stringify(before)}`);
  const progressDeadline = performance.now() + 5000;
  let after;
  do { await delay(100); after = await terminalViewport(view); } while (after.lastSequence <= before.lastSequence && performance.now() < progressDeadline);
  assert.ok(after.exposed && after.atBottom && after.cursorVisible && after.lastSequence > before.lastSequence, `Real remote output must continue visibly without scrolling to repair follow state: ${JSON.stringify(after)}`);
  return { before, after, observation: 'Untimed public DOM/hit-test correctness; no forced scrolling or physical-frame latency claim.' };
}

async function editorState(page) {
  const scroll = await scrollSnapshot(page.locator('.cm-scroller:visible'), '.cm-line');
  const visible = await page.locator('.cm-scroller:visible').evaluate(element => {
    const viewport = element.getBoundingClientRect();
    return { focused: !!document.activeElement?.closest('.cm-content'), lines: [...element.querySelectorAll('.cm-line')].filter(line => { const box = line.getBoundingClientRect(); return box.bottom > viewport.top + 1 && box.top < viewport.bottom - 1; }).map(line => ({ text: line.textContent, index: Number(line.textContent.match(/LINE (\d+)/)?.[1] ?? -1) })) };
  });
  return { scroll, ...visible };
}
async function copySelection(context) {
  // Never read a pre-existing personal clipboard. Blank our own test clipboard,
  // then use the actual native Copy command to inspect the synthetic selection.
  await context.app.evaluate(({ clipboard }) => clipboard.writeText(''));
  await context.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.copy());
  const deadline = performance.now() + 2000;
  let value = '';
  while (!value && performance.now() < deadline) { value = await context.app.evaluate(({ clipboard }) => clipboard.readText()); if (!value) await delay(20); }
  return value;
}
function summarize(values) { return values.length ? { ...quantiles(values.map(durationMs => ({ durationMs }))), maximum: Math.max(...values) } : { n: 0 }; }
function differences(values) { return values.slice(1).map((value, index) => value - values[index]); }

async function exerciseWindowResize(context, { expectedFirstLine, outputView, outputBefore, manual = false, manualOnly = false }) {
  const { app, page, ssh, report, directory } = context;
  const geometry = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0], bounds = window.getBounds(), content = window.getContentSize();
    return { bounds, normalBounds: window.getNormalBounds(), content, minimum: window.getMinimumSize(), maximized: window.isMaximized(), maximizable: window.isMaximizable(), display: screen.getDisplayMatching(bounds) };
  });
  const result = report.lifecycle.windowResize = { geometry, transitions: [], method: 'Public native BrowserWindow geometry APIs; full webContents.capturePage() sequence, not DOM dispatch or pane resize.', interpretation: 'Readback cadence/CPU/layout observations only, not physical display presentation, OS corner-drag proof or a numeric jank-free/FPS verdict.', manualRequested: manual, clipboardPolicy: 'Blank then native Copy of owned synthetic marker; never reads pre-existing clipboard.' };
  result.manualOnly = manualOnly;
  if (manualOnly) result.method = 'Human-only native resize supplement under the same fixed mixed load; real will-resize/full content capture, no scripted bounds commands during the gesture. Operator attestation is still required.';
  report.lifecycle.windowContentDIP = { width: geometry.content[0], height: geometry.content[1] };
  fs.mkdirSync(path.join(directory, 'window-resize'), { recursive: true });
  assert.ok(geometry.minimum[0] <= geometry.display.workArea.width && geometry.minimum[1] <= geometry.display.workArea.height, 'Display work area must accommodate the existing native window minimum');
  const insets = [geometry.bounds.width - geometry.content[0], geometry.bounds.height - geometry.content[1]];
  const clamp = ([width, height]) => [Math.max(geometry.minimum[0] - insets[0], Math.min(width, geometry.display.workArea.width - insets[0])), Math.max(geometry.minimum[1] - insets[1], Math.min(height, geometry.display.workArea.height - insets[1]))].map(Math.round);
  const sizes = [[1440, 960], [1024, 720], [1664, 1040], [1200, 800], [1536, 1000], [1024, 720]].map(clamp);
  assert.ok(sizes[0].some((value, index) => value > sizes[1][index]), 'Display/minimum geometry must permit actual native enlargement and shrinkage');
  result.requestedContentSizes = manualOnly ? [] : sizes;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const protocolStart = ssh.events.length;
  const streams = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__perfTerminalStreams ?? {})));
  const nativeOwners = () => ssh.events.filter(event => event.type === 'shell-open' && event.native).length - ssh.events.filter(event => event.type === 'shell-close' && event.native).length;
  const ownersBefore = nativeOwners(), streamsBefore = await streams();
  result.outputViewportBefore = outputBefore;
  result.outputPresentationDuringEditor = await terminalPresentation(outputView);
  assert.ok(outputBefore.atBottom, 'actual unmodified emitting tile followed bottom before Files/editor hiding');
  let rendererObserverInstalled = false;
  let primaryError;
  try {
    if (geometry.maximized) await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
    await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home');
    await delay(600);
    const marker = 'RESIZEUNDO';
    await nativeInput(app, textEvents(marker));
    await nativeInput(app, Array.from({ length: marker.length }, () => [{ type: 'keyDown', keyCode: 'Left', modifiers: ['shift'] }, { type: 'keyUp', keyCode: 'Left', modifiers: ['shift'] }]).flat());
    assert.equal(await copySelection(context), marker, 'synthetic editor selection established through native input and Copy');
    const box = await page.locator('.cm-scroller:visible').boundingBox();
    await nativeWheel(app, box.x + Math.min(300, box.width / 2), box.y + Math.min(180, box.height / 2));
    await delay(200);
    const baseline = await editorState(page);
    result.editorBaseline = baseline;
    assert.ok(baseline.scroll.index >= 0, 'actual visible logical LINE anchor available');
    await page.evaluate(() => {
      const state = { resize: [], longTasks: [] };
      const listener = () => state.resize.push({ at: performance.now(), width: innerWidth, height: innerHeight });
      window.addEventListener('resize', listener);
      const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) state.longTasks.push({ startTime: entry.startTime, duration: entry.duration }); });
      observer.observe({ type: 'longtask' });
      window.__ownshellWindowResize = { state, listener, observer };
    });
    rendererObserverInstalled = true;
    const before = await transferSnapshot(page);
    result.initialTransfers = before;
    const identities = Object.fromEntries(before.queue.map(item => [item.file_name, item.id]));
    for (const name of ['transfer-a.bin', 'transfer-b.bin']) assert.ok(before.queue.some(item => item.file_name === name && item.status === 'active'), `${name} actually active before native resize`);
    const plan = manualOnly ? [] : sizes.map((target, index) => ({ id: `bounds-${index}`, mode: 'bounds', target }));
    if (!manualOnly && geometry.maximizable) plan.push({ id: 'native-maximize', mode: 'maximize' }, { id: 'native-restore', mode: 'restore' });
    if (manual) plan.push({ id: 'human-corner-drag', mode: 'manual', readinessMs: 120000 });
    plan.push({ id: 'restore-baseline-size', mode: 'bounds', target: geometry.content });
    for (const specification of plan) {
      const startEvents = ssh.events.length, fixtureBefore = ssh.resources(), queueBefore = await transferSnapshot(page), metricsBefore = await cdp.send('Performance.getMetrics');
      for (const name of Object.keys(identities)) assert.ok(queueBefore.queue.some(item => item.id === identities[name] && item.status === 'active'), `${name} remains actually active at ${specification.id} start`);
      const transition = await collectTransition(context, specification);
      result.transitions.push(transition);
      transition.fixtureBefore = fixtureBefore; transition.fixtureAfter = ssh.resources();
      transition.performanceBefore = metricsBefore.metrics;
      transition.performanceAfter = (await cdp.send('Performance.getMetrics')).metrics;
      transition.editor = await editorState(page);
      transition.transfers = await transferSnapshot(page);
      transition.outputPresentation = await terminalPresentation(outputView);
      transition.protocolEvents = ssh.events.slice(startEvents).filter(event => ['window-change', 'pty-request', 'shell-open', 'shell-close', 'transfer-read', 'file-close'].includes(event.type));
      const observedFrames = transition.frames.filter(frame => frame.lastObservedAt >= transition.interactionStart);
      const transitionReadbacks = transition.readbacks.filter(item => item.kind === 'transition');
      transition.leadingReadbackMs = transitionReadbacks.length ? transitionReadbacks[0].at - transition.interactionStart : null;
      transition.readbackGapsIncludingLeading = summarize(differences([transition.interactionStart, ...transitionReadbacks.map(item => item.at), transition.captureEnd]));
      transition.cadence = { readbackDurationMs: summarize(transition.readbacks.map(item => item.durationMs)), readbackGapMs: summarize(differences(transition.readbacks.filter(item => item.kind === 'transition').map(item => item.at))), distinctFrameGapMs: summarize(differences(observedFrames.map(item => Math.max(item.at, transition.interactionStart)))), repeatedImageSpansMs: observedFrames.filter(item => item.observations > 1).map(item => ({ at: Math.max(item.at, transition.interactionStart), duration: item.lastObservedAt - Math.max(item.at, transition.interactionStart), observations: item.observations })) };
      fs.writeFileSync(path.join(directory, 'window-resize', specification.id, 'transition.json'), JSON.stringify(transition, null, 2));
      try {
      assert.equal(transition.actionError, undefined, transition.actionError);
      assert.equal(transition.captureError, undefined, transition.captureError);
      if (specification.mode === 'restore') assert.deepEqual(transition.final.contentSize, result.transitions.find(item => item.mode === 'maximize').initial.contentSize, 'native Restore returns the exact pre-Maximize content geometry');
      assert.equal(transition.stopReason, 'controller-finished', 'observer guard makes transition evidence incomplete, never successful');
      assert.deepEqual(transition.finalListenerCounts, transition.initialListenerCounts, 'ticket-owned native observers released');
      assert.ok(transition.editor.focused, 'native window geometry preserves actual editor focus');
      assert.ok(transition.editor.lines.some(line => line.index === baseline.scroll.index), 'original logical scroll anchor remains visible when wrapping changes; pixel scrollTop need not match');
      assert.equal(await copySelection(context), marker, 'native window geometry preserves synthetic editor selection');
      assert.equal(transition.transfers.identityViolation, null, 'resize never replaces a transfer identity');
      for (const name of Object.keys(identities)) {
        const old = queueBefore.queue.find(item => item.id === identities[name]);
        const current = transition.transfers.queue.find(item => item.id === identities[name]);
        assert.ok(current?.status === 'active' && current.transferred >= old.transferred, `${name} retains identity and nondecreasing public progress throughout ${specification.id}`);
        const from = transition.timeOrigin + transition.interactionStart, to = transition.timeOrigin + transition.captureEnd;
        const readsDuringObservation = ssh.events.slice(startEvents).filter(event => event.type === 'transfer-read' && event.path === `/${name}` && performance.timeOrigin + event.at >= from && performance.timeOrigin + event.at <= to);
        transition.transferProtocolOverlap ??= [];
        transition.transferProtocolOverlap.push({ name, driverTimeOrigin: performance.timeOrigin, mainTimeOrigin: transition.timeOrigin, from, to, reads: readsDuringObservation.length, firstOffset: readsDuringObservation[0]?.offset, lastOffset: readsDuringObservation.at(-1)?.offset });
        if (specification.mode !== 'manual' || transition.manualObserved) assert.ok(readsDuringObservation.length, `${name} has actual real SFTP reads during the timestamped capture interval, not just later encoding`);
        assert.ok(!ssh.events.slice(startEvents).some(event => event.type === 'file-close' && event.path === `/${name}`), `${name} does not naturally finish during claimed fixed-load resize`);
      }
      assert.equal(nativeOwners(), ownersBefore, 'native window geometry retains original native SSH owners');
      assert.ok(!ssh.events.slice(startEvents).some(event => ['shell-open', 'shell-close'].includes(event.type) && event.native), 'no native shell reconnect hidden by a stable owner count');
      } finally {
        fs.writeFileSync(path.join(directory, 'window-resize', specification.id, 'transition.json'), JSON.stringify(transition, null, 2));
      }
    }
    result.renderer = await page.evaluate(() => window.__ownshellWindowResize.state);
    result.protocolEvents = ssh.events.slice(protocolStart).filter(event => ['pty-request', 'window-change'].includes(event.type));
    result.manualStatus = manual ? (result.transitions.find(item => item.mode === 'manual')?.manualObserved ? 'Native will-resize observed with no programmatic geometry commands during the human readiness phase; physical gesture still requires operator attestation.' : 'Readiness expired without native will-resize; human OS corner drag NOT exercised.') : 'Not requested; programmatic native resize is not an OS corner-drag claim.';
    if (manualOnly) assert.ok(result.transitions.some(item => item.mode === 'manual' && item.manualObserved), 'explicit human-only phase requires an actual native will-resize; typing or an expired gate is not an OS drag');
    assert.ok(result.protocolEvents.some(event => event.type === 'window-change' && event.native), 'native SSH window-change packets prove real fit/protocol propagation; no synthetic stty/PID claim');
    result.streamsBefore = streamsBefore; result.streamsAfter = await streams();
    for (const [id, stream] of Object.entries(streamsBefore)) {
      assert.ok(result.streamsAfter[id], `public PTY stream ${id} retained`);
      assert.deepEqual(result.streamsAfter[id].violations, stream.violations, `public PTY ${id} remains ordered`);
      if (stream.count) assert.ok(result.streamsAfter[id].count > stream.count, `actual public PTY ${id} output continues through native resize`);
    }
    await nativeInput(app, [{ type: 'keyDown', keyCode: 'z', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'z', modifiers: ['meta'] }]);
    await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home');
    assert.equal(await page.locator('.cm-line').first().innerText(), expectedFirstLine, 'Undo retains the pre-resize document/history');
    await nativeInput(app, [{ type: 'keyDown', keyCode: 'z', modifiers: ['meta', 'shift'] }, { type: 'keyUp', keyCode: 'z', modifiers: ['meta', 'shift'] }]);
    assert.equal(await page.locator('.cm-line').first().innerText(), marker + expectedFirstLine, 'Redo retains the same original edit history');
    await nativeInput(app, [{ type: 'keyDown', keyCode: 'z', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'z', modifiers: ['meta'] }]);
    assert.equal(await page.locator('.cm-line').first().innerText(), expectedFirstLine, 'test marker removed only by actual Undo, not document replacement');
    result.editorUndoRedoPreserved = true;
  } catch (error) { primaryError = error; throw error; }
  finally {
    const cleanupErrors = [];
    if (rendererObserverInstalled) {
      try {
        result.renderer = await page.evaluate(() => {
          const observed = window.__ownshellWindowResize;
          observed.observer.disconnect(); window.removeEventListener('resize', observed.listener);
          delete window.__ownshellWindowResize; return observed.state;
        });
      } catch (error) { cleanupErrors.push(error); }
    }
    try { await cdp.detach(); } catch (error) { cleanupErrors.push(error); }
    try {
      await app.evaluate(({ BrowserWindow }, geometry) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window.isMaximized()) window.unmaximize();
        window.setBounds(geometry.normalBounds, false);
        if (geometry.maximized) window.maximize();
      }, geometry);
      result.restoredContentSize = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize());
      assert.deepEqual(result.restoredContentSize, geometry.content, 'baseline content geometry restored before ordinary 1200×800 phases');
    } catch (error) { cleanupErrors.push(error); }
    result.cleanupErrors = cleanupErrors.map(error => String(error.stack || error));
    fs.writeFileSync(path.join(directory, 'window-resize', 'summary.json'), JSON.stringify(result, null, 2));
    if (!primaryError && cleanupErrors.length) throw cleanupErrors[0];
  }
  return result;
}
module.exports = { exerciseWindowResize, installTransferObserver, transferSnapshot, disposeTransferObserver, terminalViewport, verifyContinuedVisibleOutput };
