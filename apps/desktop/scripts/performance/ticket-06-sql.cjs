'use strict';
// Public-seam regression: actual Electron input, visible SQL output and real local engines.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeInput, textEvents, nativeClick, nativeWheel, measureMixedFrame, measureTerminalEcho, sftpRead } = require('./mixed-ui.cjs');
const { quantiles } = require('./workloads.cjs');
const { startSQLFixtures, rows, payload } = require('./ticket-06-fixtures.cjs');
const { expandPane } = require('./ticket-12-workspace-ui.cjs');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const selectedBackend = option('--backend', 'all');
const backends = selectedBackend === 'all' ? ['postgres', 'mysql', 'sqlite'] : [selectedBackend];
if (backends.some(backend => !['postgres', 'mysql', 'sqlite'].includes(backend))) throw new Error('Unknown SQL backend');
const nativeExecute = app => nativeInput(app, [{ type: 'keyDown', keyCode: 'Return', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'Return', modifiers: ['meta'] }]);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, description) {
  const deadline = Date.now() + 30000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await wait(25);
  }
}
const rect = box => ({ x: Math.ceil(box.x), y: Math.ceil(box.y), width: Math.floor(box.width), height: Math.floor(box.height) });
const visibleContent = page => page.getByPlaceholder('Filter tables...').filter({ visible: true }).locator('xpath=../../../..');
async function setQuery(page, sql, scope) {
  const editor = scope.locator('.cm-content:visible');
  await editor.focus();
  await page.keyboard.press('Meta+a');
  await page.keyboard.insertText(sql);
}
async function execute(page, sql, expected, scope) {
  await setQuery(page, sql, scope);
  await scope.getByRole('button', { name: 'Execute', exact: true }).click();
  await scope.getByText(expected, { exact: true }).first().waitFor();
}
async function createConnections(page, fixtures) {
  // Setup only: public persistence API (including encryption/validation), never React/store internals.
  for (const type of ['postgres', 'mysql', 'sqlite']) {
    const config = { name: `SQL ${type}`, type, ...(type === 'sqlite' ? { filePath: fixtures.sqlitePath } : { host: '127.0.0.1', port: fixtures.manifest.engines[type].port, database: 'synthetic', username: 'benchmark', password: fixtures.password, connectionMode: 'local' }) };
    const result = await page.evaluate(config => window.electronAPI.dbConnections.create(config), config);
    assert.equal(result.success, true, result.error);
  }
  await page.reload();
  await page.locator('input[type="password"]').fill('Benchmark-Only-2026!');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.getByRole('button', { name: 'Databases', exact: true }).waitFor();
}
async function scenario(context, fixtures) {
  const { app, page, ssh, report, directory, profile } = context;
  report.scenario = { ticket: 6, fixtures: fixtures.manifest, backends: {}, assertions: [], timingBoundaries: { adapter: 'Existing executionTime displayed by actual SQL console; includes driver/service wait and row materialization, not paint.', ipc: 'Benchmark main handler duration includes adapter and awaited optional history; transport/renderer delivery is outside this interval.', residual: 'Handler duration minus integer adapter executionTime is combined local/history overhead, not a separately measured transport duration.', visible: 'Actual Electron native input to compositor capture matching usable result rows; upper bound, not physical monitor time.' } };
  report.scenario.requestedBackends = backends;
  report.scenario.scriptSha256 = createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
  report.scenario.diagnosticCPUProfiling = { enabled: args.includes('--diagnose-input'), samplingIntervalUs: args.includes('--diagnose-input') ? 1000 : null };
  const traceCategories = args.includes('--diagnose-layout') ? 'devtools.timeline,blink.user_timing,v8.execute,toplevel' : null;
  report.scenario.diagnosticLayoutTracing = { enabled: Boolean(traceCategories), categories: traceCategories };
  report.scenario.textInputRoiVersion = 'sql-complete-row-v2';
  report.scenario.rawFrameDiagnostics = args.includes('--retain-frames');
  report.scenario.warmSwitchRoiVersion = 'sql-warm-table-content-v1';
  report.scenario.captureAfterOutcome = args.includes('--capture-after-outcome');
  const assets = path.join(__dirname, '../../dist/assets');
  const sqlBundle = fs.readdirSync(assets).find(file => /^DBExplorerView-.*\.js$/.test(file));
  report.build.sqlRendererBundle = { file: sqlBundle, sha256: createHash('sha256').update(fs.readFileSync(path.join(assets, sqlBundle))).digest('hex') };
  report.limitations.push('Input-to-regional-public-capturePage readback is a compositor-capture upper bound, not physical monitor time. Compare only the same shared acquisition version/scenario/load; no observer-overhead subtraction or target relaxation is applied.');
  await createConnections(page, fixtures);
  await runMixed({ ...context, interactive: true });
  const check = (name, condition, details) => { report.scenario.assertions.push({ name, passed: Boolean(condition), details }); };
  const measure = async options => {
    const sample = await measureMixedFrame(context, { app, page, directory, ...options, persistFrames: Boolean(options.persistFrames) || args.includes('--retain-frames') });
    report.samples.push(sample);
    return sample;
  };
  await page.getByRole('button', { name: 'Databases', exact: true }).click();
  let sidebarSlim = false;
  for (const type of backends) {
    const result = report.scenario.backends[type] = { navigation: [], queries: [], correctness: {} };
    if (sidebarSlim) {
      await page.locator('header button[title]').first().click();
      await wait(250);
    }
    await page.getByRole('button', { name: new RegExp(`^SQL ${type}`) }).click();
    await page.locator('header button[title]').first().click();
    sidebarSlim = true;
    await wait(250);
    const databasePane = page.getByTitle('Close pane', { exact: true }).last().locator('xpath=../../..');
    result.viewport = await expandPane(context, databasePane);
    const connect = databasePane.getByRole('button', { name: 'Connect', exact: true });
    await connect.click();
    await databasePane.getByRole('button', { name: /^perf_rows/ }).waitFor();
    const content = visibleContent(databasePane);
    await content.getByPlaceholder('Filter tables...').fill('perf_rows');
    check(`${type}: metadata table filtering`, await content.getByRole('button', { name: /^perf_other/ }).count() === 0);
    await content.getByPlaceholder('Filter tables...').fill('');
    await content.getByRole('button', { name: /^perf_rows/ }).click();
    await content.getByText('row-000001', { exact: true }).waitFor();
    check(`${type}: first page`, await content.locator('tbody tr').count() === 100);
    result.navigation.push(await content.getByText(/Showing 1-100 of/).innerText());
    const pagination = content.getByText(/^Page 1 of /).locator('..');
    await pagination.locator('button').nth(2).click();
    await content.getByText(/^Page 2 of /).waitFor();
    await content.locator('tbody tr').first().waitFor();
    check(`${type}: second page`, await content.getByText('row-000001', { exact: true }).count() === 0 && await content.getByText('row-000101', { exact: true }).count() > 0, await content.locator('tbody tr').first().innerText());
    await content.getByRole('button', { name: /^perf_other/ }).click();
    await content.getByText('other-table-only', { exact: true }).waitFor();
    await content.getByRole('button', { name: /^perf_rows/ }).click();
    await content.getByRole('button', { name: /^perf_other/ }).click();
    await content.getByText('other-table-only', { exact: true }).waitFor();
    await wait(150);
    check(`${type}: latest table selection`, await content.getByText('row-000101', { exact: true }).count() === 0);
    await content.getByRole('button', { name: /^perf_rows/ }).click();
    await content.getByRole('button', { name: 'Structure', exact: true }).click();
    await content.getByText('payload', { exact: true }).first().waitFor();
    check(`${type}: schema`, await content.getByText('id', { exact: true }).count() > 0 && await content.getByText('tail', { exact: true }).count() > 0);
    await content.getByRole('button', { name: 'Query', exact: true }).click();
    const query = 'SELECT * FROM perf_rows ORDER BY id;';
    await execute(page, 'SELECT * FROM perf_rows ORDER BY id DESC;', 'row-020000', content);
    await setQuery(page, '-- \n' + query, content);
    const editorBox = await content.locator('.cm-content:visible').boundingBox();
    const editorScroller = await content.locator('.cm-scroller:visible').boundingBox();
    await page.keyboard.press('Meta+ArrowUp');
    await page.keyboard.press('End');
    const profiler = args.includes('--diagnose-input') || traceCategories ? await page.context().newCDPSession(page) : null;
    if (args.includes('--diagnose-input')) {
      await profiler.send('Profiler.enable');
      await profiler.send('Profiler.setSamplingInterval', { interval: 1000 });
      await profiler.send('Profiler.start');
    }
    let traceComplete;
    if (traceCategories) {
      traceComplete = new Promise(resolve => profiler.once('Tracing.tracingComplete', resolve));
      await profiler.send('Tracing.start', { categories: traceCategories, transferMode: 'ReturnAsStream', streamFormat: 'json' });
    }
    let suffix = '';
    try {
      for (let i = 0; i < 30; i++) {
        const char = String.fromCharCode(65 + i % 26); suffix += char;
        const expected = '-- ' + suffix;
        await measure({ id: `${type}-query-input-${i}`, kind: 'sql-query-input', persistFrames: Boolean(profiler), region: rect({ x: editorBox.x, y: editorScroller.y + 5, width: Math.min(680, editorScroller.x + editorScroller.width - editorBox.x - 8), height: 18 }), action: () => nativeInput(app, textEvents(char)), outcome: () => until(() => content.locator('.cm-line').first().evaluate((element, expected) => element.textContent === expected, expected), 'visible SQL input') });
      }
    } finally {
      if (profiler) {
        try {
          if (args.includes('--diagnose-input')) {
            const { profile: cpuProfile } = await profiler.send('Profiler.stop');
            fs.writeFileSync(path.join(directory, `${type}-query-input.cpuprofile`), JSON.stringify(cpuProfile));
          }
          if (traceComplete) {
            await profiler.send('Tracing.end');
            const complete = await traceComplete;
            const file = `${type}-query-input-timeline.json`;
            result.layoutDiagnostic = { file, dataLossOccurred: complete.dataLossOccurred, format: complete.traceFormat };
            assert.ok(complete.stream, 'Input layout diagnostic must return its real timeline stream');
            const fd = fs.openSync(path.join(directory, file), 'w');
            try {
              let chunk;
              do {
                chunk = await profiler.send('IO.read', { handle: complete.stream, size: 1024 * 1024 });
                fs.writeFileSync(fd, chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data);
              } while (!chunk.eof);
            } finally {
              fs.closeSync(fd);
              await profiler.send('IO.close', { handle: complete.stream });
            }
            assert.equal(complete.dataLossOccurred, false, 'Input layout diagnostic must retain the complete trace');
          }
        } finally {
          await profiler.detach();
        }
      }
    }
    // Use exactly the same large result for before/after (20k x 8; 2069-byte wide payload).
    await setQuery(page, query, content);
    const resultViewport = await content.locator('table').locator('..').boundingBox();
    const headerBox = await content.locator('thead').boundingBox();
    result.resultViewport = { ...resultViewport, headerHeight: headerBox.height };
    assert.ok(resultViewport.height > headerBox.height + 30, `SQL result viewport must show usable rows: ${JSON.stringify(result.resultViewport)}`);
    const tableRegion = rect({ x: resultViewport.x + 6, y: resultViewport.y + headerBox.height + 2, width: Math.min(540, resultViewport.width - 24), height: Math.min(60, resultViewport.height - headerBox.height - 6) });
    const beforeIpc = (await app.evaluate(() => global.__ownshellBenchmark.ipc())).length;
    const painted = await measure({ id: `${type}-first-result`, kind: 'sql-first-result', region: tableRegion, action: () => nativeClick(app, content.getByRole('button', { name: 'Execute', exact: true })), outcome: () => content.getByText('row-000001', { exact: true }).waitFor() });
    const ipc = (await app.evaluate(() => global.__ownshellBenchmark.ipc())).slice(beforeIpc).filter(event => event.channel === 'dbexplorer:query').at(-1);
    const status = await content.getByText('Success', { exact: true }).locator('..').innerText();
    const statusLine = await content.getByText('Success', { exact: true }).locator('../..').innerText();
    const executionTime = Number(statusLine.match(/(\d+)ms/)?.[1]);
    result.queries.push({ sql: query, adapterExecutionTimeMs: executionTime, mainHandlerMs: ipc?.durationMs, localHistoryResidualMs: ipc?.durationMs - executionTime, inputToUsablePaintMs: painted.durationMs, status });
    const resultTable = content.locator('table');
    result.queries.at(-1).rendererFootprint = await resultTable.evaluate(table => ({
      attachedRows: table.querySelectorAll('tbody tr').length,
      attachedCells: table.querySelectorAll('tbody td').length,
    }));
    const scroller = resultTable.locator('..');
    result.correctness.firstRow = await resultTable.locator('tbody tr').first().innerText();
    check(`${type}: large result count`, statusLine.includes(String(rows)));
    check(`${type}: first row fields`, result.correctness.firstRow.includes('row-000001') && result.correctness.firstRow.includes('end-000001') && result.correctness.firstRow.includes(payload));
    const scrollBox = await scroller.boundingBox();
    const scrollRegion = rect({ x: scrollBox.x + 6, y: scrollBox.y + 40, width: Math.min(520, scrollBox.width - 24), height: Math.min(120, scrollBox.height - 50) });
    for (let i = 0; i < 10; i++) {
      const previous = await scroller.evaluate(element => element.scrollTop);
      await measure({ id: `${type}-result-scroll-${i}`, kind: 'scroll', region: scrollRegion, action: () => nativeWheel(app, scrollRegion.x + Math.min(120, scrollRegion.width / 2), scrollRegion.y + scrollRegion.height / 2), outcome: () => until(() => scroller.evaluate((element, previous) => element.scrollTop > previous, previous), 'native SQL result scroll'), finalOutcome: async () => { const current = await scroller.evaluate(element => element.scrollTop); assert.ok(current > previous); return { previous, current }; } });
    }
    for (const fraction of [.5, 1]) {
      await scroller.evaluate((element, fraction) => element.scrollTo({ top: (element.scrollHeight - element.clientHeight) * fraction, behavior: 'instant' }), fraction);
      await wait(100);
      const anchor = fraction === 1 ? 'row-020000' : 'row-010000';
      const anchorCell = resultTable.getByText(anchor, { exact: true });
      await anchorCell.waitFor({ state: 'attached' });
      await anchorCell.scrollIntoViewIfNeeded();
      check(`${type}: visible ${anchor} anchor`, await anchorCell.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const viewport = element.closest('table').parentElement.getBoundingClientRect();
        return box.bottom > viewport.top && box.top < viewport.bottom;
      }));
      result.correctness[fraction === 1 ? 'lastRows' : 'middleRows'] = await scroller.evaluate(element => {
        const viewport = element.getBoundingClientRect();
        return [...element.querySelectorAll('tbody tr')].filter(row => {
          const box = row.getBoundingClientRect();
          return box.height > 0 && box.bottom > viewport.top && box.top < viewport.bottom;
        }).map(row => row.textContent).join('\n');
      });
    }
    check(`${type}: untruncated final result`, result.correctness.lastRows.includes('row-020000') && result.correctness.lastRows.includes('end-020000'));
    await scroller.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(directory, `${type}-large-result.png`) });
    const horizontalExtent = await scroller.evaluate(element => element.scrollWidth - element.clientWidth);
    const horizontalPoint = { x: Math.round(scrollBox.x + scrollBox.width / 2), y: Math.round(scrollBox.y + scrollBox.height - 18) };
    for (let tick = 0; tick <= Math.ceil(horizontalExtent / 180); tick++) {
      await nativeInput(app, [{ type: 'mouseMove', ...horizontalPoint }, { type: 'mouseWheel', ...horizontalPoint, deltaX: -180, deltaY: 0, canScroll: true }]);
      await wait(30);
    }
    await wait(100);
    const tailCell = resultTable.getByText('end-000001', { exact: true });
    check(`${type}: native horizontal navigation reaches final column`, await tailCell.evaluate(element => {
      const box = element.getBoundingClientRect();
      const viewport = element.closest('table').parentElement.getBoundingClientRect();
      return box.left >= viewport.left && box.right <= viewport.right + 1 && box.bottom > viewport.top && box.top < viewport.bottom;
    }));
    check(`${type}: wide-cell value remains complete`, await resultTable.locator('tbody tr').first().locator('td').nth(6).innerText() === payload);
    result.correctness.horizontalNavigation = await scroller.evaluate(element => ({ scrollLeft: element.scrollLeft, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    await page.screenshot({ path: path.join(directory, `${type}-wide-values.png`) });
    await scroller.evaluate(element => element.scrollTo({ left: 0, behavior: 'instant' }));
    // Existing SQL ORDER BY/WHERE/LIMIT semantics, without adding a new grid filter UI.
    await execute(page, 'SELECT id, label, optional FROM perf_rows WHERE category = 2 ORDER BY id DESC LIMIT 3;', 'row-019994', content);
    const ordered = await content.locator('tbody tr').allInnerTexts();
    check(`${type}: sort/filter/limit`, ordered.length === 3 && ordered[0].includes('row-019994') && ordered[1].includes('row-019987') && ordered[2].includes('row-019980') && ordered[2].includes('NULL'), ordered);
    const slow = type === 'postgres' ? "SELECT 'older-query' AS label, pg_sleep(1);" : type === 'mysql' ? "SELECT 'older-query' AS label, SLEEP(1);" : "SELECT 'older-query' AS label, (WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<500000) SELECT SUM(i) FROM n) AS total;";
    const beforeShortcuts = (await app.evaluate(() => global.__ownshellBenchmark.ipc())).filter(event => event.channel === 'dbexplorer:query').length;
    await setQuery(page, slow, content);
    await nativeExecute(app);
    if (type === 'sqlite') {
      await until(async () => (await app.evaluate(() => global.__ownshellBenchmark.ipc())).filter(event => event.channel === 'dbexplorer:query').length > beforeShortcuts, 'synchronous SQLite query response');
    } else {
      await until(() => content.getByRole('button', { name: 'Execute', exact: true }).isDisabled(), 'first native query enters loading');
    }
    await setQuery(page, "SELECT 'latest-query' AS label;", content);
    await nativeExecute(app);
    await wait(1600);
    const raceCalls = (await app.evaluate(() => global.__ownshellBenchmark.ipc())).filter(event => event.channel === 'dbexplorer:query').slice(beforeShortcuts);
    result.correctness.queryCompletionOrder = raceCalls;
    check(`${type}: native execute shortcut reaches service`, raceCalls.length === 2, raceCalls);
    if (type !== 'sqlite') {
      check(`${type}: real later query finishes before earlier query`, raceCalls.length === 2 && raceCalls[0].start > raceCalls[1].start && raceCalls[0].start + raceCalls[0].durationMs < raceCalls[1].start + raceCalls[1].durationMs, raceCalls);
    }
    check(`${type}: latest query wins`, await content.getByText('latest-query', { exact: true }).count() > 0 && await content.getByText('older-query', { exact: true }).count() === 0 && await content.getByText('Query Error', { exact: true }).count() === 0, await content.locator('tbody').innerText());
    await setQuery(page, slow, content);
    const beforeTableSwitch = (await app.evaluate(() => global.__ownshellBenchmark.ipc())).filter(event => event.channel === 'dbexplorer:query').length;
    await nativeExecute(app);
    if (type === 'sqlite') {
      await until(async () => (await app.evaluate(() => global.__ownshellBenchmark.ipc())).filter(event => event.channel === 'dbexplorer:query').length > beforeTableSwitch, 'SQLite response before table navigation');
    } else {
      await until(() => content.getByRole('button', { name: 'Execute', exact: true }).isDisabled(), 'query loading before table navigation');
    }
    await content.getByRole('button', { name: 'Data', exact: true }).click();
    await content.getByRole('button', { name: /^perf_other/ }).click();
    await wait(1600);
    check(`${type}: late query cannot replace selected table data`, await content.getByText('other-table-only', { exact: true }).count() > 0 && await content.getByText('older-query', { exact: true }).count() === 0);
    await content.getByRole('button', { name: /^perf_rows/ }).click();
    await content.getByRole('button', { name: 'Query', exact: true }).click();
    await execute(page, 'SELECT * FROM deliberately_missing_sql_table;', 'Query Error', content);
    check(`${type}: visible query error`, (await content.innerText()).includes('deliberately_missing_sql_table'));
    await content.getByRole('button', { name: 'History', exact: true }).click();
    await content.getByText('Query History', { exact: true }).waitFor();
    const historyPanel = content.getByText('Query History', { exact: true }).locator('../..');
    const failedHistoryEntry = historyPanel.getByRole('button').filter({ hasText: 'SELECT * FROM deliberately_missing_sql_table;' });
    const failedHistoryVisible = await failedHistoryEntry.first().waitFor({ timeout: 2000 }).then(
      () => true,
      error => { result.correctness.historyRefreshError = error.message; return false; }
    );
    check(`${type}: failed history refreshed`, failedHistoryVisible);
    const historyEntry = historyPanel.getByRole('button').filter({ hasText: query }).first();
    check(`${type}: successful history retained`, await historyEntry.count() > 0);
    if (await historyEntry.count()) await historyEntry.click();
    else await content.getByRole('button', { name: 'History', exact: true }).click();
    // Measure actual warm feature-tab content changes, never a tiled header/border activation.
    await execute(page, query, 'row-000001', content);
    const quiet = page.locator('span').filter({ hasText: /^Benchmark 3$/ }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) });
    result.terminalViewport = await expandPane(context, quiet);
    await quiet.getByRole('button', { name: 'Terminal', exact: true }).click();
    const switchBox = await quiet.locator('.terminal-surface:visible').boundingBox();
    for (let i = 0; i < 10; i++) {
      const target = i % 2 === 0 ? 'Files' : 'Terminal';
      const warmSample = await measure({
        id: `${type}-warm-tab-${i}`, kind: 'sql-warm-tab-switch',
        region: rect({ x: switchBox.x + 8, y: switchBox.y + 8, width: Math.min(450, switchBox.width - 30), height: Math.min(130, switchBox.height - 20) }),
        action: () => nativeClick(app, quiet.getByRole('button', { name: target, exact: true })),
        outcome: () => target === 'Files' ? quiet.getByText('editor.txt', { exact: true }).waitFor() : quiet.locator('.xterm:visible').waitFor(),
        matchRegion: async ({ region, width, height }) => {
          const version = 'sql-warm-table-content-v1';
          if (target === 'Terminal') return { version, x: 0, y: 0, width, height, geometry: { target, source: 'Original complete terminal-content capture rectangle' } };
          const headers = await quiet.locator('thead:visible').evaluateAll(elements => elements.map(element => {
            const { top, bottom } = element.getBoundingClientRect();
            return { top, bottom };
          }));
          if (!headers.length) throw new Error('No visible Files table-header geometry');
          const y = Math.max(0, Math.floor((Math.min(...headers.map(header => header.top)) - region.y) * height / region.height));
          return { version, x: 0, y, width, height: height - y, geometry: { target, source: 'Public visible table-header top through original capture bottom; both panes and all captured table text retained', headers } };
        },
      });
      assert.equal(warmSample.matchRegion?.version, 'sql-warm-table-content-v1', 'Warm capture must use the declared physical content rectangle');
    }
  }
  // Same real editor and native terminal work while the exercised SQL results remain mounted.
  const editorPane = page.locator('span').filter({ hasText: /^Benchmark 1$/ }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Files', exact: true }) });
  report.scenario.editorPaneViewport = await expandPane(context, editorPane);
  await editorPane.getByRole('button', { name: 'Files', exact: true }).click();
  await editorPane.getByText('editor.txt', { exact: true }).dblclick();
  const remote = page.locator('.cm-content:visible').filter({ hasText: 'LINE 00000000' }).last();
  await remote.waitFor(); await remote.focus(); await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home');
  const box = await remote.boundingBox(); const remoteScroller = await remote.locator('..').boundingBox();
  let inserted = '';
  for (let i = 0; i < 10; i++) {
    inserted += 'Q';
    await measure({ id: `sql-mixed-editor-${i}`, kind: 'sql-mixed-editor-input', region: rect({ x: box.x, y: remoteScroller.y + 5, width: Math.min(700, remoteScroller.width - 50), height: 18 }), action: () => nativeInput(app, textEvents('Q')), outcome: () => page.waitForFunction(inserted => [...document.querySelectorAll('.cm-content')].some(element => element.getClientRects().length > 0 && element.textContent.startsWith(inserted + 'LINE 00000000')), inserted) });
  }
  await page.keyboard.press('Meta+s'); await remote.waitFor({ state: 'detached' });
  const saved = await sftpRead(ssh, '/editor.txt');
  check('mixed remote editor save correctness', saved.toString('utf8', 0, inserted.length + 13) === inserted + 'LINE 00000000');
  const terminalPane = page.locator('span').filter({ hasText: /^Benchmark 3$/ }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) });
  report.scenario.finalTerminalViewport = await expandPane(context, terminalPane);
  await page.locator('span').filter({ hasText: /^Benchmark 3$/ }).first().click();
  await terminalPane.getByRole('button', { name: 'Terminal', exact: true }).click();
  await measureTerminalEcho(context, 0);
  if (report.scenario.captureAfterOutcome) {
    const modes = report.samples.map(sample => ({ id: sample.id, mode: sample.captureStats?.mode, modeVersion: sample.captureStats?.modeVersion, outcomeReadbacks: sample.captureStats?.outcomeReadbacks }));
    check('canonical outcome readback applied to every native sample', modes.length > 0 && modes.every(sample => sample.mode === 'sequential-plus-outcome' && sample.modeVersion === 1 && sample.outcomeReadbacks === 1), modes);
  }
  for (const kind of [...new Set(report.samples.map(sample => sample.kind))]) {
    report.summary[kind] = quantiles(report.samples.filter(sample => sample.kind === kind), kind === 'sql-warm-tab-switch' ? profile.switchTargetMs : kind === 'sql-first-result' || kind === 'terminal-remote-echo' ? Infinity : profile.inputTargetMs);
  }
  for (const type of backends) {
    report.scenario.backends[type].summary = Object.fromEntries(
      [...new Set(report.samples.filter(sample => sample.id.startsWith(`${type}-`)).map(sample => sample.kind))]
        .map(kind => [kind, quantiles(report.samples.filter(sample => sample.id.startsWith(`${type}-`) && sample.kind === kind), kind === 'sql-warm-tab-switch' ? profile.switchTargetMs : kind === 'sql-first-result' ? Infinity : profile.inputTargetMs)])
    );
    for (const [kind, summary] of Object.entries(report.scenario.backends[type].summary)) {
      if (Number.isFinite(summary.targetMs)) {
        check(`${type}: ${kind} p95 target`, summary.p95 <= summary.targetMs, summary);
      }
    }
  }
  const editorSummary = report.summary['sql-mixed-editor-input'];
  check('mixed editor native-input p95 target', editorSummary.p95 <= editorSummary.targetMs, editorSummary);
  report.scenario.passed = report.scenario.assertions.every(assertion => assertion.passed);
  fs.writeFileSync(path.join(directory, 'sql-correctness.json'), JSON.stringify(report.scenario, null, 2));
  if (!args.includes('--record-before')) assert.equal(report.scenario.passed, true, JSON.stringify(report.scenario.assertions.filter(assertion => !assertion.passed)));
}
(async () => {
  const fixtures = await startSQLFixtures();
  let runError;
  try {
    for (const profile of option('--profile', 'everyday') === 'all' ? ['everyday', 'stress'] : [option('--profile', 'everyday')]) {
      await runProfile(profile, async context => {
        try { await scenario(context, fixtures); }
        catch (error) {
          context.report.scenario.originalError = error.stack ?? String(error);
          throw error;
        }
        finally {
          Object.assign(context.report, await context.page.evaluate(() => ({
            longTasks: globalThis.__perfLongTasks ?? [],
            eventTimings: globalThis.__perfEvents ?? [],
            trustedInputs: globalThis.__perfTrusted ?? [],
          })));
        }
      });
    }
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    try { console.log('SQL_FIXTURES_CLOSED', JSON.stringify(await fixtures.close())); }
    catch (cleanupError) {
      if (runError) throw new AggregateError([runError, cleanupError], 'SQL scene and fixture cleanup failed');
      throw cleanupError;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
