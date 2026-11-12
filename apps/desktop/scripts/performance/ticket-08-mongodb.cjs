'use strict';
// Real Electron / MongoDB 8 behavior regression and focused mixed-workload measurements.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeInput, textEvents, nativeClick: dispatchNativeClick, nativeWheel, measureMixedFrame } = require('./mixed-ui.cjs');
const { quantiles } = require('./workloads.cjs');
const { startMongo } = require('./mongodb-fixture.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const args = process.argv.slice(2);
const profile = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'everyday';
const profileCpu = args.includes('--cpu-profile');
const replyArrival = args.includes('--reply-arrival');
const replyOffsetsMs = [900, 1000, 1050, 1100, 1150];
const rect = box => ({ x: Math.ceil(box.x), y: Math.ceil(box.y), width: Math.floor(box.width), height: Math.floor(box.height) });
const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const source = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scenarioSha256: hash(__filename), fixtureSha256: hash(path.join(__dirname, 'mongodb-fixture.cjs')) };
async function nativeClick(app, locator) {
  await locator.scrollIntoViewIfNeeded();
  return dispatchNativeClick(app, locator);
}

async function scheduleNativeInput(app, delay, dispatch) {
  await app.evaluate((_electron, delay) => {
    const benchmark = global.__ownshellBenchmark;
    if (global.__mongo08OriginalInput) throw new Error('Previous scheduled native input was not consumed');
    const original = benchmark.input;
    global.__mongo08OriginalInput = original;
    benchmark.input = function (events) {
      benchmark.input = original;
      delete global.__mongo08OriginalInput;
      // Retain the actual pending operation across response-allocation GC, not a substituted result.
      const pending = new Promise(resolve => {
        global.__mongo08InputTimer = setTimeout(() => { delete global.__mongo08InputTimer; resolve(); }, delay);
      }).then(() => original.call(benchmark, events));
      global.__mongo08PendingInput = pending;
      return pending;
    };
  }, delay);
  return dispatch();
}

function clickBox(app, box) {
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
  return nativeInput(app, [{ type: 'mouseMove', x, y }, { type: 'mouseDown', button: 'left', clickCount: 1, x, y }, { type: 'mouseUp', button: 'left', clickCount: 1, x, y }]);
}

async function copyJson(app, page) {
  // Clipboard publication is asynchronous; never mistake an earlier successful copy for this one.
  await app.evaluate(({ clipboard }) => clipboard.clear());
  await page.getByRole('button', { name: 'Copy JSON', exact: true }).click();
  const deadline = performance.now() + 10000;
  while (performance.now() < deadline) {
    const text = await app.evaluate(({ clipboard }) => clipboard.readText());
    if (text) return JSON.parse(text);
    await wait(10);
  }
  throw new Error('Copy JSON did not publish actual native clipboard contents');
}

function jsonScrollState(element) {
  const viewport = element.getBoundingClientRect();
  const gutter = [...element.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
    .map(row => ({ row, box: row.getBoundingClientRect() }))
    .find(({ row, box }) => box.height > 0 && box.bottom > viewport.top + 1 && box.top < viewport.bottom && /^\d+$/.test(row.textContent.trim()));
  if (!gutter) throw new Error('Actual JSON editor has no visible numbered line');
  return { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, line: Number(gutter.row.textContent.trim()), clippedPx: Math.max(0, viewport.top - gutter.box.top) };
}

function jsonScrollAdvanced(before, after) {
  return after.line > before.line || (after.line === before.line && after.clippedPx > before.clippedPx + .5);
}

async function waitJsonScroll(scroller, before) {
  const deadline = performance.now() + 10000;
  while (performance.now() < deadline) {
    const after = await scroller.evaluate(jsonScrollState);
    if (jsonScrollAdvanced(before, after)) return;
    await wait(16);
  }
  throw new Error(`Native wheel did not advance the actual numbered JSON output from line ${before.line}`);
}

async function resizeGroup(app, group, axis, share = .15) {
  const separators = group.locator(':scope > [role="separator"]');
  const count = await separators.count();
  const bounds = await group.boundingBox();
  for (let index = 0; index < count; index++) {
    const separator = await separators.nth(index).boundingBox();
    const x = Math.round(separator.x + separator.width / 2), y = Math.round(separator.y + separator.height / 2);
    const targetX = axis === 'x' ? Math.round(bounds.x + bounds.width * share * (index + 1)) : x;
    const targetY = axis === 'y' ? Math.round(bounds.y + bounds.height * share * (index + 1)) : y;
    await nativeInput(app, [{ type: 'mouseMove', x, y }, { type: 'mouseDown', button: 'left', clickCount: 1, x, y }]);
    for (let step = 1; step <= 12; step++) {
      await nativeInput(app, [{ type: 'mouseMove', x: Math.round(x + (targetX - x) * step / 12), y: Math.round(y + (targetY - y) * step / 12), modifiers: ['leftButtonDown'] }]);
      await wait(16);
    }
    await nativeInput(app, [{ type: 'mouseUp', button: 'left', clickCount: 1, x: targetX, y: targetY }]);
    await wait(250);
  }
}

function cpuSummary(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parents = new Map(profile.nodes.flatMap(node => (node.children ?? []).map(child => [child, node.id])));
  const functions = new Map();
  let normalizationSampleMs = 0, bsonSampleMs = 0;
  for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
    const sample = profile.samples[index], duration = (profile.timeDeltas[index] ?? 0) / 1000;
    const name = nodes.get(sample)?.callFrame.functionName || '(anonymous)';
    functions.set(name, (functions.get(name) ?? 0) + duration);
    const names = [];
    for (let node = sample; node !== undefined; node = parents.get(node)) names.push(nodes.get(node)?.callFrame.functionName || '');
    if (names.some(name => name.includes('normalizeDocument'))) normalizationSampleMs += duration;
    if (names.some(name => /deserialize|parseToElements|OnDemandDocument|BSON/.test(name))) bsonSampleMs += duration;
  }
  return { samples: profile.samples?.length ?? 0, normalizationSampleMs, bsonSampleMs, topSelfSamplesMs: [...functions].sort((a, b) => b[1] - a[1]).slice(0, 30), note: 'Statistical CPU samples, not wall durations or an additive partition; named stack classifications may overlap. Raw .cpuprofile files are retained. Sampling/serialization overhead is not subtracted from measured interactions.' };
}

async function scenario(context, mongo) {
  const { app, page, directory, report } = context;
  report.scenario = { issue: 8, source, fixture: mongo.manifest, plannedServerDelaysMs: { documentRefresh: 1000, obsoleteCollectionReply: 1200, obsoleteError: 1000, concurrentEditorQuery: 1000, concurrentWarmTabQuery: 100 }, assertions: [], loads: [], serviceResources: mongo.resources };
  const result = report.scenario;
  result.profiling = { enabled: profileCpu, samplingIntervalUs: profileCpu ? 1000 : null, mode: profileCpu ? 'causal-diagnostic' : 'ordinary-acceptance' };
  result.captureAfterOutcome = args.includes('--capture-after-outcome');
  result.interactionPhase = replyArrival ? 'reply-arrival-bracket' : 'service-in-flight';
  if (replyArrival) result.nativeInputScheduling = 'One-shot main timer forwards canonical input; actual pending Promise retained across GC; no retries or substituted result; original restored before dispatch';
  result.queryInputSchedule = [];
  const check = (name, condition, observed) => { result.assertions.push({ name, passed: Boolean(condition), observed }); };
  let rendererProfiler;
  try {
  await runMixed({ ...context, interactive: true });
  await app.evaluate(async () => {
    const { EventEmitter } = process.getBuiltinModule('events');
    const originalEmit = EventEmitter.prototype.emit;
    const seen = new WeakSet(), pending = new Map(), samples = [];
    const overhead = { calls: 0, probeMs: 0, clockCalls: 10000, clockProbeMs: 0, note: 'Measured observer prefix cost plus clock microbenchmark; wrapper dispatch/first clock overhead is not fully observable. Nothing is subtracted from application timings.' };
    const clockStart = performance.now();
    for (let index = 0; index < overhead.clockCalls; index++) performance.now();
    overhead.clockProbeMs = performance.now() - clockStart;
    EventEmitter.prototype.emit = function (name, event) {
      const probeStart = performance.now();
      overhead.calls++;
      if ((name === 'commandStarted' || name === 'commandSucceeded' || name === 'commandFailed') && event && typeof event === 'object' && !seen.has(event)) {
        seen.add(event);
        if (name === 'commandStarted') {
          pending.set(event.requestId, { commandName: event.commandName, requestId: event.requestId, start: performance.now() });
        } else {
          const started = pending.get(event.requestId);
          if (started) {
            samples.push({ ...started, end: performance.now(), durationMs: event.duration, outcome: name, errorCode: event.failure?.code });
            pending.delete(event.requestId);
          }
        }
      }
      overhead.probeMs += performance.now() - probeStart;
      return originalEmit.apply(this, arguments);
    };
    global.__mongo08StopObserver = () => {
      EventEmitter.prototype.emit = originalEmit;
      delete global.__mongo08StopObserver;
      return { samples, overhead, pending: pending.size };
    };
  });
  if (profileCpu) {
  await app.evaluate(async () => {
    const session = new (process.getBuiltinModule('inspector').Session)();
    session.connect();
    const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
    await post('Profiler.enable');
    await post('Profiler.setSamplingInterval', { interval: 1000 });
    await post('Profiler.start');
    global.__mongo08StopProfiler = async () => {
      try { return (await post('Profiler.stop')).profile; }
      finally { session.disconnect(); delete global.__mongo08StopProfiler; }
    };
  });
  rendererProfiler = await page.context().newCDPSession(page);
  await rendererProfiler.send('Profiler.enable');
  await rendererProfiler.send('Profiler.setSamplingInterval', { interval: 1000 });
  await rendererProfiler.send('Profiler.start');
  }
  await page.getByRole('button', { name: 'Databases', exact: true }).click();
  await page.getByRole('button', { name: 'New database connection', exact: true }).click();
  await page.locator('#db-connection-name').fill('Mongo benchmark 08');
  await page.locator('#database-type').click();
  await page.getByRole('option', { name: 'MongoDB', exact: true }).click();
  await page.locator('#db-connection-uri').fill(`${mongo.uri}&monitorCommands=true`);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  const initialMongoHeader = page.locator('span').filter({ hasText: /^DB: Explorer$/ }).first();
  const mongoPanelId = await initialMongoHeader.locator('xpath=ancestor::*[@data-panel][1]').getAttribute('id');
  assert.ok(mongoPanelId);
  const mongoPane = page.locator(`[id=${JSON.stringify(mongoPanelId)}]`);
  const mongoPaneHeader = mongoPane.locator('span').filter({ hasText: /^DB: Explorer$/ }).first();
  const collection = name => mongoPane.locator('button').filter({ has: page.locator('span').filter({ hasText: new RegExp(`^${name}$`) }) }).filter({ hasText: 'docs' }).first();
  await collection('alpha').waitFor();
  // Existing public splitters make the three-column browser usable without removing background panes.
  const collapseSidebar = page.getByRole('button', { name: 'Sidebar einklappen', exact: true });
  if (await collapseSidebar.count()) await nativeClick(app, collapseSidebar);
  await wait(250);
  const rowGroup = mongoPane.locator('xpath=ancestor::*[@data-group][1]');
  await resizeGroup(app, rowGroup, 'x');
  const verticalGroup = rowGroup.locator('xpath=ancestor::*[@data-group][1]');
  await resizeGroup(app, verticalGroup, 'y');
  result.viewport = await mongoPane.boundingBox();
  await page.screenshot({ path: path.join(directory, 'mongodb-viewport.png') });
  assert.ok(result.viewport.width > 676, 'public layout must leave at least 100px for the editor after existing collection/document columns');
  const row = (prefix, ordinal) => mongoPane.getByRole('button').filter({ has: page.getByText(`${prefix}${ordinal.toString(16).padStart(22, '0')}`, { exact: true }) }).first();
  async function select(name, prefix) {
    const started = performance.now();
    await nativeClick(app, collection(name));
    await row(prefix, 0).waitFor();
    result.loads.push({ name, endpoint: 'first actual document row DOM-usable, not paint', durationMs: performance.now() - started });
  }
  await select('alpha', '01');
  check('initial page preserves 50-document limit', await page.getByRole('button').filter({ has: page.locator('span.font-mono.text-xs.text-primary') }).count() === 50);
  const initialIds = await page.locator('button span.font-mono.text-xs.text-primary').allTextContents();
  check('initial output ordering is unchanged', initialIds.length === 50 && initialIds[0] === '010000000000000000000000' && initialIds[49] === '010000000000000000000031' && initialIds.every((value, index) => Number.parseInt(value.slice(2), 16) === index), initialIds);
  const countText = `${mongo.manifest.counts.alpha.toLocaleString('en-US')} documents`;
  await page.getByText(countText, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await row('01', 50).waitFor();
  check('next page contains document 50 and not document 0', await row('01', 50).count() === 1 && await row('01', 0).count() === 0);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await row('01', 0).waitFor();
  await nativeClick(app, row('01', 0));
  const editor = mongoPane.locator('[aria-label="MongoDB document JSON"]');
  await editor.waitFor();
  let actual = await copyJson(app, page);
  check('ObjectId date binary nested unicode and scalar representation', actual._id === '010000000000000000000000' && actual.date === '2026-01-02T03:04:05.000Z' && actual.reference === '030000000000000000000000' && actual.binary === '[Binary: 6 bytes]' && actual.nested.unicode === 'Grüße 世界 🐚' && actual.nested.values[3].leaf === 'nested-leaf' && actual.nil === null && actual.enabled === true, actual);
  result.documentRace = { refreshRequestedAt: await app.evaluate(() => performance.now()) };
  await mongo.db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 }, data: { failCommands: ['find'], blockConnection: true, blockTimeMS: 1000 } });
  await page.getByRole('button', { name: 'Refresh document', exact: true }).click();
  await wait(100);
  await nativeClick(app, row('01', 1));
  await page.waitForFunction(id => document.querySelector('[aria-label="MongoDB document JSON"]')?.textContent.includes(id), '010000000000000000000001', { timeout: 1000 });
  result.documentRace.selectedVisibleAt = await app.evaluate(() => performance.now());
  result.documentRace.selectedId = (await editor.textContent()).match(/"_id":\s*"([^"]+)"/)?.[1];
  await page.screenshot({ path: path.join(directory, 'mongodb-race-selection.png') });
  await wait(1300);
  result.documentRace.settledId = (await editor.textContent()).match(/"_id":\s*"([^"]+)"/)?.[1];
  const navigated = await copyJson(app, page);
  check('late document refresh cannot replace newly selected document', result.documentRace.selectedId === '010000000000000000000001' && result.documentRace.settledId === '010000000000000000000001' && navigated._id === '010000000000000000000001' && navigated.ordinal === 1, { ...result.documentRace, copiedId: navigated._id, copiedOrdinal: navigated.ordinal });
  await page.screenshot({ path: path.join(directory, 'mongodb-race-settled.png') });
  await page.getByRole('button', { name: 'Close document', exact: true }).click();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const filter = page.getByPlaceholder('{"field": "value"}', { exact: true });
  await filter.fill('{"group":3}');
  await row('01', 3).waitFor();
  await page.getByText(`${(mongo.manifest.counts.alpha / 10).toLocaleString('en-US')} documents`, { exact: true }).waitFor();
  check('filter returns matching document and exact count', await row('01', 3).count() === 1 && await row('01', 0).count() === 0);
  await filter.fill('{invalid');
  await row('01', 0).waitFor();
  check('existing invalid JSON filter fallback remains empty filter', await row('01', 0).count() === 1);
  await filter.fill('{}');
  await row('01', 0).waitFor();
  // A real server failpoint delays a real find reply. It does not replace the service or its contents.
  await mongo.db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 }, data: { failCommands: ['find'], blockConnection: true, blockTimeMS: 1200 } });
  await nativeClick(app, collection('alpha'));
  await page.getByRole('button', { name: 'Refresh', exact: true }).last().click();
  await wait(150);
  await nativeClick(app, collection('beta'));
  await row('02', 0).waitFor();
  await wait(1500);
  check('late alpha result/count cannot replace beta selection', await row('02', 0).count() === 1 && await row('01', 0).count() === 0 && await page.getByText(`${mongo.manifest.counts.beta.toLocaleString('en-US')} documents`, { exact: true }).count() === 1, await page.locator('body').innerText());
  await mongo.db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 }, data: { failCommands: ['find'], blockConnection: true, blockTimeMS: 1000, errorCode: 2 } });
  await page.getByRole('button', { name: 'Refresh', exact: true }).last().click();
  await wait(150);
  await nativeClick(app, collection('alpha'));
  await row('01', 0).waitFor();
  await wait(1300);
  check('late error stays with its request selection', await collection('beta').count() === 1 && !(await page.locator('body').innerText()).includes('failCommand'), await page.locator('body').innerText());
  await mongoPane.getByRole('button', { name: 'Refresh', exact: true }).nth(1).click();
  await collection('error_view').waitFor();
  await nativeClick(app, collection('error_view'));
  await page.getByText(/divide by zero/i).waitFor();
  check('actual Mongo error remains visible for current collection', true);
  await mongoPane.getByRole('button', { name: 'Refresh', exact: true }).nth(1).click();
  await collection('wide').waitFor();
  await select('wide', '04');
  const documentRow = row('04', 0);
  const rowBox = await documentRow.boundingBox();
  await nativeClick(app, documentRow);
  const wideZeroId = '04' + '0'.repeat(22);
  const wideOneId = '04' + '1'.padStart(22, '0');
  await mongoPane.locator('span.font-mono.max-w-xs').filter({ hasText: new RegExp(`^${wideZeroId}$`) }).waitFor();
  const loadingAtSwitch = await mongoPane.locator('[aria-busy="true"]').count() > 0;
  await nativeClick(app, row('04', 1));
  await editor.waitFor();
  const rapidSelection = await copyJson(app, page);
  check('rapid wide document selection shows the actual newer document', rapidSelection._id === wideOneId && rapidSelection.ordinal === 1 && rapidSelection.field_255 === 'supported-wide-255-' + 'x'.repeat(96) && rapidSelection.nested.rows.length === 32, { id: rapidSelection._id, ordinal: rapidSelection.ordinal, loadingAtSwitch });
  await wait(1000);
  const settledSelection = await copyJson(app, page);
  check('late formatter output cannot replace the newer selected document', settledSelection._id === wideOneId && settledSelection.ordinal === 1, { id: settledSelection._id, ordinal: settledSelection.ordinal });
  result.formatterSelectionRace = { loadingAtSwitch, initialId: rapidSelection._id, settledId: settledSelection._id };
  await page.screenshot({ path: path.join(directory, 'mongodb-formatter-latest.png') });
  await page.getByRole('button', { name: 'Close document', exact: true }).click();
  const openStarted = performance.now();
  await nativeClick(app, documentRow);
  await editor.waitFor();
  actual = await copyJson(app, page);
  check('wide nested document is complete without field or row truncation', actual.field_255 === 'supported-wide-255-' + 'x'.repeat(96) && actual.nested.rows.length === mongo.manifest.largeNestedRows && actual.nested.rows.at(-1).row === mongo.manifest.largeNestedRows - 1, { fields: Object.keys(actual).length, rows: actual.nested.rows.length });
  result.loads.push({ name: 'large-document-editor', endpoint: 'actual editor usable and Copy JSON returns complete document; not paint', durationMs: performance.now() - openStarted, jsonBytes: Buffer.byteLength(JSON.stringify(actual)) });
  await editor.focus();
  await page.keyboard.press('Meta+ArrowUp');
  await page.keyboard.press('Home');
  const content = await editor.boundingBox();
  const scroller = mongoPane.locator('.cm-scroller:visible');
  const scrollBox = await scroller.boundingBox();
  const typingRegion = rect({ x: content.x, y: scrollBox.y + 5, width: Math.min(350, scrollBox.x + scrollBox.width - content.x - 20), height: 60 });
  const refresh = mongoPane.getByRole('button', { name: 'Refresh', exact: true }).last();
  const refreshBox = await refresh.boundingBox();
  async function refreshDuringInput(id, index) {
    const deadline = performance.now() + 10000;
    while (await refresh.isDisabled()) {
      assert.ok(performance.now() < deadline, 'previous actual Mongo refresh must finish before another is requested');
      await wait(16);
    }
    await mongo.db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 }, data: { failCommands: ['find'], blockConnection: true, blockTimeMS: 1000 } });
    result.queryInputSchedule.push({ id, requestedAt: await app.evaluate(() => performance.now()), delayAfterCanonicalPreflightMs: replyArrival ? replyOffsetsMs[index % replyOffsetsMs.length] : 0 });
    await clickBox(app, refreshBox);
  }
  let spaces = '';
  for (let index = 0; index < 20; index++) {
    await refreshDuringInput(`mongo08-typing-${index}`, index);
    await editor.focus();
    spaces += ' ';
    const expected = spaces + '{';
    report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `mongo08-typing-${index}`, kind: 'typing', region: typingRegion, action: async () => {
      const dispatch = () => nativeInput(app, textEvents(' '));
      return replyArrival ? scheduleNativeInput(app, replyOffsetsMs[index % replyOffsetsMs.length], dispatch) : dispatch();
    }, outcome: () => page.waitForFunction(expected => document.querySelector('[aria-label="MongoDB document JSON"] .cm-line')?.textContent === expected, expected) }));
  }
  const scrollRegion = rect({ x: content.x, y: scrollBox.y + 100, width: Math.min(350, content.width - 20), height: 120 });
  for (let index = 0; index < 20; index++) {
    await refreshDuringInput(`mongo08-scroll-${index}`, index);
    const before = await scroller.evaluate(jsonScrollState);
    report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `mongo08-scroll-${index}`, kind: 'scroll', region: scrollRegion, action: async () => {
      const dispatch = () => nativeWheel(app, scrollRegion.x + 100, scrollRegion.y + 50);
      return replyArrival ? scheduleNativeInput(app, replyOffsetsMs[index % replyOffsetsMs.length], dispatch) : dispatch();
    }, outcome: () => waitJsonScroll(scroller, before), finalOutcome: async () => {
      const after = await scroller.evaluate(jsonScrollState);
      assert.ok(jsonScrollAdvanced(before, after), 'settled JSON output must advance logically, including within a wrapped line');
      assert.ok(after.scrollTop >= 0 && after.scrollTop <= after.scrollHeight - after.clientHeight + 1, 'settled JSON scroll remains within actual bounds');
      return { before, after, requestedNativeDeltaY: -180 };
    } }));
  }
  await editor.focus();
  await page.keyboard.press('Meta+ArrowUp');
  await page.keyboard.press('Home');
  await nativeInput(app, textEvents('x'));
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Save' && button.disabled));
  check('invalid editor JSON disables Save without losing editor contents', await page.getByRole('button', { name: 'Save', exact: true }).isDisabled());
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await app.evaluate(({ clipboard, BrowserWindow }) => {
    clipboard.writeText('"edited":true,');
    BrowserWindow.getAllWindows()[0].webContents.paste();
  });
  await page.getByRole('button', { name: 'Format JSON', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Modified', { exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Refresh document', exact: true }).click();
  const saved = await copyJson(app, page);
  check('save and refresh preserve complete wide document and edited field', saved.edited === true && saved.field_255 === actual.field_255 && saved.nested.rows.length === actual.nested.rows.length);
  await page.getByRole('button', { name: 'Close document', exact: true }).click();
  await select('alpha', '01');
  for (let index = 0; index < 20; index++) {
    const next = index % 2 ? 'alpha' : 'beta';
    const prefix = index % 2 ? '01' : '02';
    const target = collection(next);
    const region = rect({ x: rowBox.x + 8, y: rowBox.y + 2, width: Math.min(250, rowBox.width - 16), height: 20 });
    report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `mongo08-switch-${index}`, kind: 'warm-collection-switch', region, action: () => nativeClick(app, target), outcome: () => row(prefix, 0).waitFor() }));
  }
  await resizeGroup(app, verticalGroup, 'y', .30);
  result.warmTabViewport = await mongoPane.boundingBox();
  const terminalHeader = page.locator('span').filter({ hasText: /^Benchmark 3$/ }).first();
  const terminalPanelId = await terminalHeader.locator('xpath=ancestor::*[@data-panel][1]').getAttribute('id');
  assert.ok(terminalPanelId);
  const terminalPane = page.locator(`[id=${JSON.stringify(terminalPanelId)}]`);
  await terminalPane.locator('span').filter({ hasText: /^Benchmark 3$/ }).click();
  await terminalPane.getByRole('button', { name: 'Terminal', exact: true }).click();
  const surface = await terminalPane.locator('.terminal-surface:visible').boundingBox();
  const switchRegion = rect({ x: surface.x + 8, y: surface.y + 8, width: Math.min(500, surface.width - 40), height: Math.min(180, surface.height - 20) });
  for (let index = 0; index < 20; index++) {
    const target = index % 2 ? 'Terminal' : 'Files';
    const tab = terminalPane.getByRole('button', { name: target, exact: true });
    await tab.scrollIntoViewIfNeeded();
    const tabBox = await tab.boundingBox();
    const nextCollection = collection(index % 2 ? 'alpha' : 'beta');
    await nextCollection.scrollIntoViewIfNeeded();
    const collectionBox = await nextCollection.boundingBox();
    await mongo.db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 }, data: { failCommands: ['find'], blockConnection: true, blockTimeMS: 100 } });
    await clickBox(app, collectionBox);
    report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `mongo08-tab-${index}`, kind: 'warm-tab-switch', region: switchRegion, action: () => clickBox(app, tabBox), outcome: () => target === 'Files' ? terminalPane.getByText('editor.txt', { exact: true }).waitFor({ state: 'visible' }) : terminalPane.locator('.xterm:visible').waitFor() }));
  }
  await nativeClick(app, mongoPaneHeader);
  await row('01', 0).waitFor();
  check('collection stays current across concurrent warm tab navigation', await row('02', 0).count() === 0);
  await page.screenshot({ path: path.join(directory, 'mongodb-complete.png') });
  result.timingDefinitions = { server: 'MongoDB system.profile millis (server execution, integer millisecond resolution)', driver: 'Real bundled driver public command monitoring duration: command wall includes network/server/decode, not pure service time', local: 'Main/renderer inspector CPU samples distinguish normalizeDocument, BSON/driver, editor work; statistical samples are not wall time', ipc: 'Actual main handler wall from common benchmark. Handler minus command wall is combined local BSON/normalization/validation overhead, not pure transport; overlapping commands are not partitioned', visible: 'Native input to compositor sample for typing/scroll/collection switches; DOM load samples explicitly not paint' };
  for (const kind of ['typing', 'scroll', 'warm-tab-switch', 'warm-collection-switch']) report.summary[kind] = quantiles(report.samples.filter(sample => sample.kind === kind), kind === 'warm-collection-switch' ? Infinity : kind === 'warm-tab-switch' ? context.profile.switchTargetMs : context.profile.inputTargetMs);
  for (const kind of ['typing', 'scroll', 'warm-tab-switch']) check(`${kind} p95 meets ${report.summary[kind].targetMs} ms target`, report.summary[kind].p95 <= report.summary[kind].targetMs, report.summary[kind]);
  report.longTasks = await page.evaluate(() => globalThis.__perfLongTasks);
  } finally {
    if (replyArrival) await app.evaluate(() => {
      if (global.__mongo08OriginalInput) global.__ownshellBenchmark.input = global.__mongo08OriginalInput;
      clearTimeout(global.__mongo08InputTimer);
      delete global.__mongo08OriginalInput;
      delete global.__mongo08InputTimer;
      delete global.__mongo08PendingInput;
    }).catch(error => { result.inputRestoreError = error.message; });
    result.commandMonitoring = await app.evaluate(() => global.__mongo08StopObserver?.()).catch(error => { result.driverObserverError = error.message; return null; });
    const mainProfile = await app.evaluate(async () => global.__mongo08StopProfiler ? global.__mongo08StopProfiler() : null).catch(error => { result.mainProfilerError = error.message; return null; });
    if (mainProfile) {
      fs.writeFileSync(path.join(directory, 'mongodb-main.cpuprofile'), JSON.stringify(mainProfile));
      result.mainCpu = cpuSummary(mainProfile);
    }
    if (rendererProfiler) {
      try {
        const { profile: rendererProfile } = await rendererProfiler.send('Profiler.stop');
        fs.writeFileSync(path.join(directory, 'mongodb-renderer.cpuprofile'), JSON.stringify(rendererProfile));
        result.rendererCpu = cpuSummary(rendererProfile);
      } catch (error) { result.rendererProfilerError = error.message; }
      await rendererProfiler.detach();
    }
    result.handlers = (await app.evaluate(() => global.__ownshellBenchmark.ipc()).catch(() => [])).filter(sample => sample.channel.startsWith('mongodb:'));
    if (result.documentRace?.selectedVisibleAt) {
      const request = result.handlers.find(handler => handler.channel === 'mongodb:find-document-by-id' && handler.start >= result.documentRace.refreshRequestedAt);
      result.documentRace.refreshHandler = request;
      check('new document becomes visibly selected while the old refresh is still in flight', request && request.start <= result.documentRace.selectedVisibleAt && request.start + request.durationMs > result.documentRace.selectedVisibleAt, result.documentRace);
    }
    result.mongoOverlap = report.samples.map(sample => ({ id: sample.id, kind: sample.kind, commands: (result.commandMonitoring?.samples ?? []).filter(command => command.commandName === 'find' && command.start <= sample.presentedCaptureAt && command.end >= sample.inputAt).map(({ commandName, requestId, start, end, durationMs }) => ({ commandName, requestId, start, end, durationMs })), handlers: result.handlers.filter(handler => handler.channel === 'mongodb:find-documents' && handler.start <= sample.presentedCaptureAt && handler.start + handler.durationMs >= sample.inputAt) }));
    if (replyArrival) {
      result.replyArrival = report.samples.filter(sample => sample.kind === 'typing' || sample.kind === 'scroll').map(sample => {
        const schedule = result.queryInputSchedule.find(entry => entry.id === sample.id);
        const handler = result.handlers.filter(handler => handler.channel === 'mongodb:find-documents' && handler.start >= schedule.requestedAt).sort((a, b) => a.start - b.start)[0];
        const rendererOffset = sample.trustedInput.timeOrigin - report.runtime.timeOrigin;
        const longTasks = (report.longTasks ?? []).map(task => ({ ...task, mainClockStart: task.startTime + rendererOffset })).filter(task => task.mainClockStart <= sample.presentedCaptureAt && task.mainClockStart + task.duration >= sample.inputAt);
        return { id: sample.id, kind: sample.kind, schedule, handler, inputAt: sample.inputAt, presentedCaptureAt: sample.presentedCaptureAt, overlappingRendererLongTasks: longTasks };
      });
      for (const kind of ['typing', 'scroll']) {
        const samples = result.replyArrival.filter(sample => sample.kind === kind && sample.handler);
        const beforeReply = samples.filter(sample => sample.inputAt <= sample.handler.start + sample.handler.durationMs);
        const afterReply = samples.filter(sample => sample.inputAt >= sample.handler.start + sample.handler.durationMs);
        check(`${kind} native inputs bracket actual query-handler completion`, beforeReply.length > 0 && afterReply.length > 0, { beforeReply: beforeReply.map(sample => sample.id), afterReply: afterReply.map(sample => sample.id), overlappingRendererLongTasks: samples.filter(sample => sample.overlappingRendererLongTasks.length > 0).map(sample => sample.id) });
      }
    } else {
      for (const overlap of result.mongoOverlap.filter(sample => sample.kind === 'typing' || sample.kind === 'scroll')) {
        const sample = report.samples.find(sample => sample.id === overlap.id);
        check(`${overlap.id} overlaps a real query throughout native input-to-capture`, overlap.commands.some(command => command.start <= sample.inputAt && command.end >= sample.presentedCaptureAt) && overlap.handlers.some(handler => handler.start <= sample.inputAt && handler.start + handler.durationMs >= sample.presentedCaptureAt), overlap);
      }
    }
    for (const sample of report.samples) {
      const interval = sample.background[0].lifecycleOverlap;
      const opened = context.ssh.events.filter(event => event.type === 'shell-open' && event.native && event.at <= interval.presentedAt).length;
      const closed = context.ssh.events.filter(event => event.type === 'shell-close' && event.native && event.at <= interval.presentedAt).length;
      const emitting = context.ssh.events.filter(event => event.type === 'output-start' && event.at <= interval.presentedAt).length;
      const lastOutput = context.ssh.events.findLast(event => event.type === 'output' && event.at <= interval.presentedAt);
      sample.nativeShells = { opened, closed, emitting, lastOutputAt: lastOutput?.at };
      check(`${sample.id} retains all native shells and continuous output`, opened - closed === context.profile.terminals && emitting === context.profile.outputTerminals && lastOutput && interval.presentedAt - lastOutput.at < 2000, sample.nativeShells);
    }
    if (result.captureAfterOutcome) {
      const modes = report.samples.map(sample => ({ id: sample.id, mode: sample.captureStats?.mode, modeVersion: sample.captureStats?.modeVersion, outcomeReadbacks: sample.captureStats?.outcomeReadbacks }));
      check('canonical outcome readback applied to every native sample', modes.length > 0 && modes.every(sample => sample.mode === 'sequential-plus-outcome' && sample.modeVersion === 1 && sample.outcomeReadbacks === 1), modes);
    }
    try { result.server = await mongo.observations(); }
    catch (error) { result.observationError = error.stack; }
    fs.writeFileSync(path.join(directory, 'mongodb-scenario.json'), JSON.stringify(result, null, 2));
  }
  assert.equal(result.observationError, undefined, 'actual Mongo service observations must be collected');
  assert.equal(result.inputRestoreError, undefined, 'scheduled native input probe must restore the canonical input seam');
  if (profileCpu) assert.ok(result.mainCpu?.samples > 0 && result.rendererCpu?.samples > 0, 'actual main and renderer CPU samples must be collected');
  assert.ok(result.commandMonitoring?.samples.some(sample => sample.commandName === 'find' && sample.outcome === 'commandSucceeded'), 'real bundled driver find command events must be present');
  assert.ok(result.assertions.every(assertion => assertion.passed), `Mongo behavior failures: ${result.assertions.filter(assertion => !assertion.passed).map(assertion => assertion.name).join(', ')}`);
}

(async () => {
  const failures = [];
  for (const name of profile === 'all' ? ['everyday', 'stress'] : [profile]) {
    let mongo, failure;
    try {
      mongo = await startMongo(name);
      await runProfile(name, context => scenario(context, mongo));
    } catch (error) { failure = error; }
    finally {
      if (mongo) {
        try { await mongo.close(); }
        catch (error) {
          if (failure) console.error(`Mongo ${name} cleanup also failed: ${error.stack}`);
          else failure = error;
        }
      }
    }
    if (failure) { console.error(`Mongo ${name}: ${failure.stack}`); failures.push(failure); }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} Mongo profile(s) failed`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
