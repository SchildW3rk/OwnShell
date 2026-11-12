'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeClick, nativeInput, textEvents, nativeWheel, measureMixedFrame, sftpRead, scrollSnapshot, verifyFinalScroll } = require('./mixed-ui.cjs');
const { quantiles, text } = require('./workloads.cjs');
const { startRedis } = require('./ticket-09-redis-fixture.cjs');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const profileName = option('--profile', 'everyday');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const rect = box => ({ x: Math.ceil(box.x), y: Math.ceil(box.y), width: Math.floor(box.width), height: Math.floor(box.height) });

async function scenario(context, redis) {
  const { app, page, directory, report, profile } = context;
  report.scenario = { issue: 9, driverSourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), productionSourceCommit: process.env.OWNSHELL_PERF_RENDERER_COMMIT || null, fixture: redis.metadata, checks: [], scans: [], attribution: { protocol: 'Real Redis MONITOR command/cursor trace and INFO commandstats/latencystats; server execution is not transport latency', ipc: 'Main-handler wall including Redis client/socket I/O and adapter work; excludes Electron IPC dispatch and post-return result serialization', renderer: 'Shared Chromium ScriptDuration/LayoutDuration/heap and Long Tasks; includes the whole mixed workload and observer activity', visibleResponse: 'Shared native Electron input/compositor capture; not a DOM/rAF stopwatch' } };
  if (process.env.OWNSHELL_PERF_ASSET_PROVENANCE) {
    const provenance = fs.readFileSync(process.env.OWNSHELL_PERF_ASSET_PROVENANCE);
    fs.writeFileSync(path.join(directory, 'runtime-asset-provenance.json'), provenance);
    report.scenario.assetProvenance = { file: 'runtime-asset-provenance.json', sha256: createHash('sha256').update(provenance).digest('hex'), scope: JSON.parse(provenance.toString()).scope };
  }
  const oracleBytes = JSON.stringify({ schemaVersion: 1, queries: redis.oracles.map(({ keys, ...oracle }) => oracle) }, null, 2);
  fs.writeFileSync(path.join(directory, 'redis-scan-oracle.json'), oracleBytes);
  report.scenario.observer = { version: 'redis-public-scan-v2', definitionSha256: createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), fixtureDefinitionSha256: createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'ticket-09-redis-fixture.cjs'))).digest('hex'), oracleFile: 'redis-scan-oracle.json', oracleSha256: createHash('sha256').update(oracleBytes).digest('hex'), boundary: 'Every real app SCAN cursor request against immutable real-service page oracle; public scroll extent and distributed visible ordered anchors. Full-keyspace checks do not claim every key was individually rendered. Small-pattern results remain exact.', scanDurationComparison: 'Observer v1 enumerated every viewport; do not infer a scan speedup from changing this observer.' };
  const check = (name, actual, expected) => {
    const success = JSON.stringify(actual) === JSON.stringify(expected);
    report.scenario.checks.push({ name, actual, expected, success });
  };
  await runMixed({ ...context, interactive: true });
  await page.getByRole('button', { name: 'Databases', exact: true }).click();
  await page.getByRole('button', { name: 'New database connection', exact: true }).click();
  await page.locator('#db-connection-name').fill('Redis synthetic');
  await page.locator('#database-type').click();
  await page.getByRole('option', { name: 'Redis', exact: true }).click();
  await page.locator('#db-host').fill('127.0.0.1');
  await page.locator('#db-port').fill(String(redis.port));
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const pattern = page.locator('input[placeholder="Pattern (e.g., user:*)"]');
  if (!(await pattern.isVisible())) await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await pattern.waitFor();
  const browser = pattern.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " h-full ")][1]');
  const keyScroller = browser.locator('> div').first().locator('> div.overflow-y-auto');
  // The additional real DB pane starts in the last grid row. Resize ordinary
  // public splitters, rather than changing stores/window size or dropping load.
  const dbPane = page.locator('div.relative.h-full.w-full.flex.flex-col.overflow-hidden').filter({ has: pattern });
  const originalPane = await dbPane.boundingBox();
  await page.screenshot({ path: path.join(directory, 'redis-original-grid.png') });
  const splitters = page.getByRole('separator');
  const restoreLayout = [];
  async function dragSplitter(locator, axis, destination) {
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(axis === 'x' ? destination : x, axis === 'y' ? destination : y, { steps: 12 });
    await page.mouse.up();
  }
  const splitterBoxes = [];
  for (let index = 0; index < await splitters.count(); index++) splitterBoxes.push({ index, box: await splitters.nth(index).boundingBox() });
  const rowSplitter = splitterBoxes.filter(item => item.box && item.box.width > item.box.height && item.box.y < originalPane.y).sort((a, b) => b.box.y - a.box.y)[0];
  assert.ok(rowSplitter, 'additional DB pane must have its normal grid splitter');
  restoreLayout.push({ index: rowSplitter.index, axis: 'y', position: rowSplitter.box.y + rowSplitter.box.height / 2 });
  await dragSplitter(splitters.nth(rowSplitter.index), 'y', 280);
  const resizedPane = await dbPane.boundingBox();
  const columnSplitter = splitterBoxes.filter(item => item.box && item.box.height > item.box.width && item.box.x < originalPane.x && item.box.y >= originalPane.y - 5).sort((a, b) => b.box.x - a.box.x)[0];
  if (columnSplitter) {
    restoreLayout.push({ index: columnSplitter.index, axis: 'x', position: columnSplitter.box.x + columnSplitter.box.width / 2 });
    await dragSplitter(splitters.nth(columnSplitter.index), 'x', 380);
  }
  report.scenario.layout = { originalPane, afterRowResize: resizedPane, redisPane: await dbPane.boundingBox(), viewport: await keyScroller.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight })) };
  await page.screenshot({ path: path.join(directory, 'redis-connected.png') });
  let activeOracle;
  let activeGeometry;
  // All observations are public DOM/visible output, never React state or direct app API calls.
  const rows = () => keyScroller.locator('button').filter({ has: page.locator('span.font-mono') });
  async function idle() {
    await page.waitForFunction(() => !document.querySelector('button .lucide-refresh-cw.animate-spin'));
  }
  const parseScan = event => {
    const options = {};
    for (let index = 1; index < event.args.length; index += 2) options[event.args[index].toUpperCase()] = event.args[index + 1];
    return { database: event.database, cursor: event.args[0], pattern: options.MATCH || '*', count: Number(options.COUNT || 10), type: options.TYPE || null };
  };
  async function geometry() {
    return keyScroller.evaluate(element => {
      const viewport = element.getBoundingClientRect();
      const group = element.firstElementChild;
      const box = group.getBoundingClientRect();
      const style = getComputedStyle(group);
      const spans = [...element.querySelectorAll('button span.font-mono')];
      const boxes = spans.slice(0, 8).map(span => {
        const row = span.closest('button').getBoundingClientRect();
        return { top: row.top, height: row.height };
      }).sort((a, b) => a.top - b.top);
      const pitches = boxes.slice(1).map((row, index) => row.top - boxes[index].top).filter(value => value > 0).sort((a, b) => a - b);
      const pitch = pitches[Math.floor(pitches.length / 2)] || boxes[0]?.height || null;
      return { scrollHeight: element.scrollHeight, viewport: element.clientHeight, groupHeight: box.height, groupTop: box.top - viewport.top + element.scrollTop, groupPaddingTop: parseFloat(style.paddingTop), groupPaddingBottom: parseFloat(style.paddingBottom), mountedRows: spans.length, pitch, pitches, consistentPitch: pitches.every(value => Math.abs(value - pitch) < 1.1) };
    });
  }
  async function moveToIndex(index, oracle, dimensions) {
    await keyScroller.evaluate((element, top) => element.scrollTo({ top, behavior: 'instant' }), Math.max(0, dimensions.groupTop + index * dimensions.pitch - dimensions.viewport / 2));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const item = keyScroller.getByText(oracle.keys[index], { exact: true }).first();
    await item.waitFor({ state: 'attached', timeout: 5000 });
    return item.evaluate((span, dimensions) => {
      const element = span.closest('button');
      const list = element.closest('.overflow-y-auto');
      const row = element.getBoundingClientRect(), viewport = list.getBoundingClientRect(), group = list.firstElementChild.getBoundingClientRect();
      return { key: span.textContent.trim(), visible: row.bottom > viewport.top && row.top < viewport.bottom, indexByExtent: Math.round((list.scrollTop + row.top - viewport.top - dimensions.groupTop) / dimensions.pitch), height: row.height, topInset: row.top - group.top, bottomInset: group.bottom - row.bottom };
    }, dimensions);
  }
  async function collectScan(label, pattern = '*', type = null) {
    await app.evaluate((_electron, phase) => global.__ownshellBenchmark.markPhase(phase), `redis-scan-${label}`);
    const started = performance.now();
    const oracle = redis.oracles.find(item => item.pattern === pattern && item.type === type);
    assert.ok(oracle, `real-service oracle required for ${label}`);
    await idle();
    const traceStart = redis.metadata.scans.findLastIndex(event => {
      const scan = parseScan(event);
      return scan.cursor === '0' && scan.pattern === pattern && scan.type === type;
    });
    assert.ok(traceStart >= 0, `actual app must start ${label} at cursor 0`);
    let pages = 1;
    while (true) {
      await idle();
      const more = keyScroller.locator(':scope > div.p-3 > button');
      if (!(await more.count())) break;
      assert.ok(pages++ <= oracle.pages.length + 2, 'SCAN continuation must terminate without resetting its cursor');
      await more.scrollIntoViewIfNeeded();
      await more.focus();
      const scanCount = redis.metadata.scans.length;
      await nativeInput(app, [{ type: 'keyDown', keyCode: 'Return' }, { type: 'char', keyCode: '\r' }, { type: 'keyUp', keyCode: 'Return' }]);
      const deadline = performance.now() + 5000;
      while (redis.metadata.scans.length === scanCount) {
        if (performance.now() > deadline) throw new Error('Native Load More activation did not issue its real Redis SCAN');
        await wait(10);
      }
      await wait(30);
    }
    const trace = redis.metadata.scans.slice(traceStart).map(parseScan);
    const expectedTrace = oracle.pages.map(page => ({ database: 0, cursor: page.cursor, pattern, count: 100, type }));
    check(`${label}: complete real cursor chain`, trace, expectedTrace);
    const terminalEvidence = { lastAppRequestedCursor: trace.at(-1)?.cursor || null, oracleLastRequestedCursor: oracle.pages.at(-1).cursor, oracleNextCursor: oracle.pages.at(-1).nextCursor, loadMorePresent: await keyScroller.locator(':scope > div.p-3 > button').count() > 0 };
    check(`${label}: reaches terminal response shown by real oracle`, { cursor: terminalEvidence.lastAppRequestedCursor, more: terminalEvidence.loadMorePresent }, { cursor: terminalEvidence.oracleLastRequestedCursor, more: false });
    await keyScroller.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const dimensions = await geometry();
    assert.ok(dimensions.viewport > 0, 'Redis key list must have a visible viewport');
    const anchors = [];
    const navigationErrors = [];
    const observed = new Set();
    const count = oracle.keys.length;
    if (count) {
      const indices = [...new Set([0, Math.floor(count / 2), count - 1, ...Array.from({ length: Math.min(32, count) }, (_, index) => Math.floor(index * (count - 1) / Math.max(1, Math.min(32, count) - 1)))])].sort((a, b) => a - b);
      for (const index of indices) {
        try {
          const anchor = await moveToIndex(index, oracle, dimensions);
          anchors.push({ index, expected: oracle.keys[index], ...anchor });
          observed.add(anchor.key);
        } catch (error) {
          navigationErrors.push({ index, expected: oracle.keys[index], error: error.stack || String(error) });
          break;
        }
      }
      check(`${label}: oracle anchor navigation completed`, navigationErrors, []);
      check(`${label}: distributed visible ordered anchors`, anchors.map(item => ({ key: item.key, index: item.indexByExtent, visible: item.visible })), indices.map(index => ({ key: oracle.keys[index], index, visible: true })));
    }
    const first = anchors[0], last = anchors.at(-1);
    const rawExtentCount = count > 1 && first && last && navigationErrors.length === 0 && dimensions.pitch && dimensions.consistentPitch
      ? (dimensions.groupHeight - first.topInset - last.bottomInset - first.height - last.height) / dimensions.pitch + 2
      : dimensions.mountedRows === 0 ? 0 : null;
    const derivedRows = rawExtentCount !== null && Math.abs(rawExtentCount - Math.round(rawExtentCount)) < .05 ? Math.round(rawExtentCount) : null;
    if (derivedRows !== null) check(`${label}: DERIVED extent count`, derivedRows, count);
    else report.limitations.push(`${label}: public geometry did not unambiguously determine a row count; protocol chain and visible anchors are reported separately.`);
    // Exact small-pattern checks remain exhaustive. The large '*' pass uses
    // the approved protocol/extent/visible-anchor boundary, not hidden state.
    if (pattern !== '*') {
      for (let top = 0; top < dimensions.scrollHeight; top += Math.max(1, dimensions.viewport * .8)) {
        await keyScroller.evaluate((element, top) => element.scrollTo({ top, behavior: 'instant' }), top);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        const visible = await keyScroller.evaluate(element => {
          const viewport = element.getBoundingClientRect();
          return [...element.querySelectorAll('button span.font-mono')].filter(span => { const box = span.getBoundingClientRect(); return box.bottom > viewport.top && box.top < viewport.bottom; }).map(span => span.textContent.trim());
        });
        for (const key of visible) observed.add(key);
      }
    }
    const headerText = await browser.locator('> div').first().locator('> div').first().innerText();
    const headerMatch = headerText.match(/([\d.,\s]+)\s+keys/);
    const headerDbTotal = headerMatch ? Number(headerMatch[1].replace(/\D/g, '')) : null;
    check(`${label}: header DB total (not loaded count)`, headerDbTotal, redis.metadata.totalKeys);
    const result = { label, pattern, type, pages, expectedKeys: count, traceStart, traceEnd: traceStart + trace.length, actualRequests: trace, expectedOraclePagesHash: oracle.pagesHash, terminalEvidence, anchors, navigationErrors, geometry: dimensions, rawExtentCount, DERIVEDextentRows: derivedRows, headerDbTotal, observedKeys: [...observed], durationMs: performance.now() - started };
    report.scenario.scans.push(result);
    activeOracle = oracle;
    activeGeometry = dimensions;
    return { observed, derivedRows };
  }
  async function selectKey(key) {
    const index = activeOracle.keys.indexOf(key);
    assert.ok(index >= 0, `real Redis oracle must contain ${key}`);
    const observation = await moveToIndex(index, activeOracle, activeGeometry);
    assert.equal(observation.visible, true, `${key} must be reachable through the actual list`);
    const row = rows().filter({ hasText: key });
    await nativeClick(app, row);
  }
  await collectScan('all');
  await keyScroller.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
  const keyBox = await keyScroller.boundingBox();
  const keyRegion = rect({ x: keyBox.x + 6, y: keyBox.y + 15, width: keyBox.width - 18, height: Math.min(140, keyBox.height - 30) });
  for (let index = 0; index < 30; index++) {
    const previous = await keyScroller.evaluate(element => element.scrollTop);
    const sample = await measureMixedFrame(context, {
      app, page, directory, id: `redis-key-scroll-${index}`, kind: 'scroll', region: keyRegion,
      action: () => nativeWheel(app, keyRegion.x + 20, keyRegion.y + 30),
      outcome: () => keyScroller.evaluate((element, previous) => new Promise((resolve, reject) => {
        const deadline = performance.now() + 5000;
        const check = () => element.scrollTop > previous ? resolve() : performance.now() > deadline ? reject(new Error('Redis key scroll did not move')) : requestAnimationFrame(check);
        check();
      }), previous),
      finalOutcome: async () => {
        const after = await keyScroller.evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight, viewport: element.clientHeight }));
        assert.ok(after.top > previous && after.top <= after.height - after.viewport + 1, 'Redis key scroll stays in valid advancing bounds');
        return { previous, after };
      },
    });
    report.samples.push({ ...sample, surface: 'redis-key-list' });
  }
  for (let index = 0; index < 5; index++) {
    const key = `item:${String(index).padStart(6, '0')}`;
    await selectKey(key);
    await wait(100);
    await browser.locator('.lucide-loader-circle, .lucide-loader-2').waitFor({ state: 'detached' });
    const output = await browser.innerText();
    const expected = ['STRING 0', 'HASH 1', 'LIST 2 first', 'SET 3 alpha', 'ZSET 4 first'][index];
    check(`display ${key}`, output.includes(expected), true);
  }
  await page.screenshot({ path: path.join(directory, 'redis-value.png') });
  // Rapid native selection while genuine Redis queries are outstanding.
  await redis.client.call('CLIENT', 'PAUSE', '200', 'ALL');
  for (let index = 0; index < 10; index++) {
    await selectKey(`item:${String(index % 5).padStart(6, '0')}`);
  }
  await wait(200);
  check('latest selection owns displayed value', (await browser.innerText()).includes('ZSET 4 first'), true);
  check('latest selection is not replaced by an old error', await browser.getByRole('button', { name: 'Retry', exact: true }).count(), 0);
  await selectKey('value:large'); await wait(100);
  await browser.locator('.lucide-loader-circle, .lucide-loader-2').waitFor({ state: 'detached' });
  const largeValue = (await browser.locator('pre').allTextContents())[0] || '';
  check('large string is not truncated', { bytes: Buffer.byteLength(largeValue), sha256: createHash('sha256').update(largeValue).digest('hex') }, { bytes: 1100012, sha256: createHash('sha256').update('REDIS LARGE\n' + 'synthetic redis value\n'.repeat(50000)).digest('hex') });
  await selectKey('value:list'); await wait(200);
  check('complete list retains last item', (await browser.innerText()).includes('ROW 001499'), true);
  check('list order is retained', await browser.locator('tbody tr td:last-child').allTextContents(), Array.from({ length: 1500 }, (_, index) => `ROW ${String(index).padStart(6, '0')}`));
  await pattern.fill('item:000*'); await nativeInput(app, [{ type: 'keyDown', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }]);
  const searched = await collectScan('item:000*', 'item:000*');
  check('search scan completeness', [...searched.observed].sort(), Array.from({ length: 1000 }, (_, index) => `item:${String(index).padStart(6, '0')}`));
  await nativeClick(app, browser.getByRole('button', { name: 'Hash', exact: true }));
  await pattern.press('Enter');
  const hashes = await collectScan('item:000* TYPE hash', 'item:000*', 'hash');
  check('type-filtered search completeness', [...hashes.observed].sort(), Array.from({ length: 200 }, (_, index) => `item:${String(index * 5 + 1).padStart(6, '0')}`));
  await nativeClick(app, browser.getByRole('button', { name: 'All', exact: true }));
  // A draft edit must not change the query bound to the continuation cursor.
  await redis.client.call('CLIENT', 'PAUSE', '200', 'ALL');
  await pattern.fill('*'); await pattern.press('Enter');
  await pattern.fill('item:00000?'); await pattern.press('Enter'); await idle();
  await pattern.fill('no-such-key:*');
  const continued = await collectScan('submitted item:00000? with unsent draft', 'item:00000?');
  check('continue uses submitted search, not unsent draft', [...continued.observed].sort(), Array.from({ length: 10 }, (_, index) => `item:${String(index).padStart(6, '0')}`));
  await pattern.press('Enter'); await collectScan('empty', 'no-such-key:*');
  check('empty search state', await browser.getByText('No keys found', { exact: true }).isVisible(), true);
  await page.screenshot({ path: path.join(directory, 'redis-empty.png') });
  await pattern.fill('*'); await pattern.press('Enter');
  await collectScan('all retained during parallel interactions');
  const parsedRequests = redis.metadata.scans.map(parseScan);
  check('every real app SCAN uses its fixed DB/options/cursor oracle', parsedRequests.filter(scan => {
    const oracle = redis.oracles.find(item => item.pattern === scan.pattern && item.type === scan.type);
    return scan.database !== 0 || scan.count !== 100 || !oracle?.pages.some(page => page.cursor === scan.cursor);
  }), []);
  const covered = new Set();
  for (const scan of report.scenario.scans) for (let index = scan.traceStart; index < scan.traceEnd; index++) covered.add(index);
  report.scenario.explicitlySupersededRequests = parsedRequests.filter((_scan, index) => !covered.has(index));
  check('only the deliberately superseded quick-search reset is incomplete', report.scenario.explicitlySupersededRequests, [{ database: 0, cursor: '0', pattern: '*', count: 100, type: null }]);
  const readCommands = new Set(['client', 'info', 'ping', 'scan', 'type', 'ttl', 'memory', 'strlen', 'hlen', 'llen', 'scard', 'zcard', 'get', 'hgetall', 'lrange', 'smembers', 'zrange', 'quit', 'dbsize', 'select', 'monitor', 'hello', 'auth', 'command', 'role', 'time']);
  const unexpectedDataCommands = Object.keys(redis.metadata.commands).filter(command => !readCommands.has(command));
  const stableKeyspace = new RegExp(`db0:keys=${redis.metadata.totalKeys},expires=0,`).test(await redis.client.info('keyspace'));
  check('fixture keyspace has no data mutations during app scans', unexpectedDataCommands, []);
  check('fixture retains complete key count and no TTL horizon', stableKeyspace, true);
  redis.metadata.oracle.immutableDuringScene = unexpectedDataCommands.length === 0 && stableKeyspace;
  report.scenario.server = { commandstats: await redis.client.info('commandstats'), latencystats: await redis.client.info('latencystats'), memory: await redis.client.info('memory') };
  await app.evaluate(() => global.__ownshellBenchmark.markPhase('redis-mixed-interactions'));
  for (const item of restoreLayout.reverse()) await dragSplitter(splitters.nth(item.index), item.axis, item.position);
  // The shared matcher and transfer guards remain authoritative for visible response.
  await page.getByRole('button', { name: 'Servers', exact: true }).click();
  const pane = index => page.locator('span').filter({ hasText: new RegExp(`^Benchmark ${index}$`) }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) });
  await pane(1).getByRole('button', { name: 'Files', exact: true }).click();
  await pane(1).getByText('editor.txt', { exact: true }).dblclick();
  const content = page.locator('.cm-content'); await content.waitFor(); await content.focus(); await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home');
  const box = await content.boundingBox(), scroller = await page.locator('.cm-scroller').boundingBox();
  const region = rect({ x: box.x, y: scroller.y + 5, width: Math.min(600, scroller.width - 30), height: 18 });
  let inserted = '';
  for (let index = 0; index < 30; index++) {
    const char = String.fromCharCode(65 + index % 26); inserted += char;
    report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `redis-typing-${index}`, kind: 'typing', region, action: () => nativeInput(app, textEvents(char)), outcome: () => page.waitForFunction(prefix => document.querySelector('.cm-line')?.textContent.startsWith(prefix), inserted) }));
  }
  await page.keyboard.press('Meta+s'); await content.waitFor({ state: 'detached' });
  assert.deepEqual(await sftpRead(context.ssh, '/editor.txt'), Buffer.concat([Buffer.from(inserted), text(profile.textBytes)]), 'parallel editor save must preserve every remote byte');
  report.correctness.redisSceneEditorSave = true;
  const listing = pane(2).locator('table').last().locator('..');
  await listing.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
  const listBox = await listing.boundingBox();
  const listGeometry = await listing.evaluate(element => {
    const viewport = element.getBoundingClientRect(), header = element.querySelector('thead').getBoundingClientRect();
    const bodyTop = Math.max(viewport.top + element.clientTop, header.bottom);
    const bodyBottom = Math.min(innerHeight, viewport.top + element.clientTop + element.clientHeight);
    return { clientWidth: element.clientWidth, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight, header: { top: header.top, bottom: header.bottom, height: header.height }, body: { x: viewport.left + element.clientLeft, y: bodyTop, width: element.clientWidth, height: bodyBottom - bodyTop } };
  });
  report.scenario.directoryViewport = { box: listBox, ...listGeometry };
  assert.ok(listGeometry.body.height >= 12 && listGeometry.body.width > 32, 'native directory capture needs visible row content in the actual viewport');
  const listRegion = rect({ x: listGeometry.body.x + 6, y: listGeometry.body.y + 1, width: listGeometry.body.width - 22, height: Math.min(80, listGeometry.body.height - 2) });
  const wheelPoint = { x: 26, y: Math.min(10, listBox.height / 2) };
  await listing.hover({ position: wheelPoint });
  report.scenario.directoryViewport.input = await listing.evaluate((element, point) => {
    const box = element.getBoundingClientRect(), x = Math.round(box.x + point.x), y = Math.round(box.y + point.y);
    const target = document.elementFromPoint(x, y);
    return { x, y, scrollerContainsTarget: element.contains(target), targetTag: target?.tagName, targetText: target?.textContent.slice(0, 160) };
  }, wheelPoint);
  report.scenario.directoryViewport.captureRegion = listRegion;
  assert.ok(report.scenario.directoryViewport.input.scrollerContainsTarget, 'native wheel must hit the public directory viewport');
  for (let index = 0; index < 30; index++) {
    const previous = await scrollSnapshot(listing, 'tbody tr');
    report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `redis-scroll-${index}`, kind: 'directory-scroll', region: listRegion, action: () => nativeWheel(app, report.scenario.directoryViewport.input.x, report.scenario.directoryViewport.input.y), outcome: () => listing.evaluate((element, previous) => new Promise((resolve, reject) => { const deadline = performance.now() + 5000; const check = () => element.scrollTop > previous ? resolve() : performance.now() > deadline ? reject(new Error('Native directory scroll did not move')) : requestAnimationFrame(check); check(); }), previous.scrollTop), finalOutcome: () => verifyFinalScroll(listing, 'tbody tr', previous, profile.entries) }));
  }
  const switchPane = pane(3), switchBox = await switchPane.boundingBox();
  const switchRegion = rect({ x: switchBox.x + 8, y: switchBox.y + 80, width: switchBox.width - 25, height: Math.min(100, switchBox.height - 90) });
  for (let index = 0; index < 30; index++) {
    const name = index % 2 ? 'Terminal' : 'Files';
    report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `redis-switch-${index}`, kind: 'tab-switch', region: switchRegion, action: () => nativeClick(app, switchPane.getByRole('button', { name, exact: true })), outcome: () => name === 'Files' ? switchPane.getByText('editor.txt', { exact: true }).waitFor() : switchPane.locator('.xterm-helper-textarea:visible').waitFor() }));
  }
  for (const kind of ['typing', 'directory-scroll', 'tab-switch']) report.summary[kind] = quantiles(report.samples.filter(sample => sample.kind === kind), kind === 'tab-switch' ? profile.switchTargetMs : profile.inputTargetMs);
  report.summary.redisKeyScroll = quantiles(report.samples.filter(sample => sample.surface === 'redis-key-list'), profile.inputTargetMs);
  report.longTasks = await page.evaluate(() => globalThis.__perfLongTasks);
  fs.writeFileSync(path.join(directory, 'redis-checks.json'), JSON.stringify(report.scenario, null, 2));
  assert.ok(report.scenario.checks.every(check => check.success), 'Redis consumer-visible correctness checks failed; see report.scenario.checks');
  for (const kind of ['typing', 'directory-scroll', 'tab-switch', 'redisKeyScroll']) {
    const summary = report.summary[kind];
    assert.equal(summary.n, 30, `${kind} retains all native samples`);
    assert.ok(summary.p95 <= summary.targetMs, `${kind} native input-to-capture upper-bound p95 ${summary.p95}ms exceeds ${summary.targetMs}ms; this alone does not diagnose application latency`);
  }
}
(async () => {
  for (const name of profileName === 'all' ? ['everyday', 'stress'] : [profileName]) {
    const redis = await startRedis(name === 'stress' ? 50000 : 10000);
    try {
      await runProfile(name, async context => {
        let timer;
        try { await Promise.race([scenario(context, redis), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Redis scenario exceeded its eight-minute phase deadline')), 480000); })]); }
        finally { clearTimeout(timer); }
      });
    }
    finally { await redis.close(); }
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
