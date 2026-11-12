'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeInput, nativeClick, nativeWheel, textEvents, measureMixedFrame } = require('./mixed-ui.cjs');
const { quantiles } = require('./workloads.cjs');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const checksOnly = args.includes('--checks-only');
const cpuProfile = args.includes('--cpu-profile');
const timeline = args.includes('--timeline');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(value).digest('hex');
const rect = box => ({ x: Math.ceil(box.x), y: Math.ceil(box.y), width: Math.floor(box.width), height: Math.floor(box.height) });
const chord = key => [{ type: 'keyDown', keyCode: key, modifiers: ['meta'] }, { type: 'keyUp', keyCode: key, modifiers: ['meta'] }];
async function captureWindow(app, file) {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  fs.writeFileSync(file, Buffer.from(png, 'base64'));
}
async function paste(app, locator, text) {
  await locator.focus();
  await app.evaluate(({ clipboard, BrowserWindow }, text) => {
    clipboard.writeText(text);
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.selectAll();
    contents.paste();
  }, text);
}
async function copyEditor(app, locator) {
  await locator.focus();
  await nativeInput(app, chord('A'));
  const sentinel = 'OwnShell API copy pending';
  await app.evaluate(({ clipboard, BrowserWindow }, sentinel) => {
    clipboard.writeText(sentinel);
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.copy();
  }, sentinel);
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    const value = await app.evaluate(({ clipboard }) => clipboard.readText());
    if (value !== sentinel) return value;
    await wait(25);
  }
  throw new Error('Editor Edit/Copy did not write the clipboard');
}
async function enlargeApiPane(app, page) {
  await page.locator('header button[title]').first().click();
  await wait(250);
  const apiPane = page.locator('span').filter({ hasText: /^API Client$/ }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'GET', exact: true }) });
  const drag = async (start, end) => {
    await nativeInput(app, [{ type: 'mouseMove', ...start }, { type: 'mouseDown', button: 'left', clickCount: 1, ...start }]);
    for (let i = 1; i <= 12; i++) {
      await nativeInput(app, [{ type: 'mouseMove', modifiers: ['leftButtonDown'], x: Math.round(start.x + (end.x - start.x) * i / 12), y: Math.round(start.y + (end.y - start.y) * i / 12) }]);
      await wait(16);
    }
    await nativeInput(app, [{ type: 'mouseUp', button: 'left', clickCount: 1, ...end }]);
    await wait(250);
  };
  let box = await apiPane.boundingBox();
  const separators = () => page.getByRole('separator').evaluateAll(elements => elements.map(element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }));
  const rows = (await separators()).filter(s => s.width > 500 && s.height < 5 && s.y < box.y).sort((a, b) => a.y - b.y);
  for (const row of rows) await drag({ x: Math.round(row.x + row.width / 2), y: Math.round(row.y + row.height / 2) }, { x: Math.round(row.x + row.width / 2), y: 160 });
  box = await apiPane.boundingBox();
  const column = (await separators()).find(s => s.height > 100 && s.width < 5 && Math.abs(s.x + s.width - box.x) < 5 && s.y >= box.y - 5);
  if (column) await drag({ x: Math.round(column.x + column.width / 2), y: Math.round(column.y + column.height / 2) }, { x: 440, y: Math.round(column.y + column.height / 2) });
  await page.getByTitle('Vertical Layout', { exact: true }).click();
  const geometry = await apiPane.boundingBox();
  assert.ok(geometry.width >= 600 && geometry.height >= 400, `API pane must be usable without closing background sessions: ${JSON.stringify({ geometry, separators: await separators() })}`);
  return geometry;
}
async function scenario(context) {
  const { app, page, ssh, profile, directory, report } = context;
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '../../../..'), encoding: 'utf8' }).trim();
  const assetSha256 = {};
  for (const directory of ['dist', 'dist-electron']) {
    const root = path.resolve(__dirname, '../..', directory);
    for (const name of fs.readdirSync(root, { recursive: true }).sort()) {
      const file = path.join(root, name);
      if (fs.statSync(file).isFile()) assetSha256[`${directory}/${name}`] = hash(fs.readFileSync(file));
    }
  }
  const requests = [];
  let onSlowRequest;
  let slowTimer;
  const server = http.createServer(async (req, res) => {
    const started = performance.now();
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const entry = { method: req.method, url: req.url, bytes: body.length, sha256: hash(body), headers: req.headers, started, received: performance.now() };
    requests.push(entry);
    if (req.url === '/echo?slow=1') {
      onSlowRequest?.(entry);
      await wait(1000);
    }
    res.writeHead(200, { 'content-type': req.headers['content-type'] || 'text/plain', 'x-fixture-sha256': entry.sha256 });
    res.end(body);
    entry.sent = performance.now();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  report.scenario = { name: 'ticket-04-api', mode: checksOnly ? 'correctness-only; not a complete latency profile' : 'full', scriptSha256: hash(fs.readFileSync(__filename)), payloads: [], requests, endpoint: 'real loopback HTTP echo; exact received byte count/hash and clipboard response oracle' };
  Object.assign(report.scenario, { sourceRevision, assetSha256 });
  report.scenario.cpuProfiler = { enabled: cpuProfile, intervalUs: cpuProfile ? 1000 : null };
  report.scenario.instrumentation = cpuProfile || timeline ? 'diagnostic attribution; not quiet acceptance' : 'quiet acceptance';
  report.scenario.captureStartPolicy = 'before-action';
  report.scenario.artifactScreenshotApi = 'Electron.BrowserWindow.webContents.capturePage() -> NativeImage.toPNG(); untimed full-window artifacts';
  report.scenario.timeline = { enabled: timeline, startsBeforeCase: 'Raw-small', api: 'Electron.contentTracing', options: timeline ? {
    recording_mode: 'record-until-full', trace_buffer_size_in_kb: 102400,
    included_categories: ['devtools.timeline', 'cc', 'benchmark', 'viz', 'latencyInfo', 'input', 'toplevel']
  } : null };
  let profiler;
  const measureAction = async options => {
    const sample = await measureMixedFrame(context, { app, page, directory, ...options });
    const interval = sample.background[0].lifecycleOverlap;
    const opened = ssh.events.filter(e => e.type === 'shell-open' && e.native && e.at <= interval.presentedAt).length;
    const closed = ssh.events.filter(e => e.type === 'shell-close' && e.native && e.at <= interval.presentedAt).length;
    assert.equal(opened - closed, profile.terminals, 'all real native SSH sessions must remain active');
    assert.equal(ssh.events.filter(e => e.type === 'output-start').length, profile.outputTerminals, 'all declared emitting terminals must be running');
    const lastOutput = ssh.events.findLast(e => e.type === 'output' && e.at <= interval.presentedAt);
    assert.ok(lastOutput && interval.presentedAt - lastOutput.at < 2000, 'real continuous terminal output must overlap API interaction');
    sample.nativeShells = { opened, closed, emitting: profile.outputTerminals, lastOutputAt: lastOutput.at };
    report.samples.push(sample);
    return sample;
  };
  try {
    await runMixed({ ...context, interactive: true });
    await page.getByRole('button', { name: 'API Client', exact: true }).click();
    await page.getByRole('button', { name: 'Create Request', exact: true }).click();
    report.scenario.apiPane = await enlargeApiPane(app, page);
    await page.getByRole('button', { name: 'GET', exact: true }).click();
    await page.getByRole('button', { name: 'POST', exact: true }).click();
    await page.getByPlaceholder('Enter request URL (e.g., https://api.example.com/users)').fill(`http://127.0.0.1:${server.address().port}/echo`);
    await page.getByRole('button', { name: 'Body', exact: true }).first().click();
    const editor = () => page.locator('.cm-content[contenteditable="true"]:visible');
    const response = () => page.locator('.cm-content[contenteditable="false"]:visible');
    const waitForEditorStart = expected => page.waitForFunction(expected => {
      const content = document.querySelector('.cm-content[contenteditable="true"]');
      const line = content?.querySelector('.cm-line'), scroller = content?.closest('.cm-scroller');
      if (!line || !scroller) return false;
      const bounds = scroller.getBoundingClientRect(), box = line.getBoundingClientRect();
      return line.textContent === expected && box.height > 0 && bounds.top >= 0 && bounds.bottom <= innerHeight
        && box.top >= bounds.top && box.bottom <= bounds.bottom;
    }, expected);
    if (cpuProfile) {
      profiler = await page.context().newCDPSession(page);
      await profiler.send('Profiler.enable');
      await profiler.send('Profiler.setSamplingInterval', { interval: 1000 });
      await profiler.send('Profiler.start');
    }
    let largeJsonDraft;
    for (const [language, large] of [['JSON', false], ['JSON', true], ['Raw', false], ['Raw', true]]) {
      await page.getByRole('button', { name: language, exact: true }).click();
      const bytes = large ? profile.textBytes : 128;
      const marker = `${language}-${large ? 'large' : 'small'}-`;
      const separator = language === 'JSON' ? ',\n' : '\n';
      const opening = language === 'JSON' ? '{\n' : '';
      const closing = language === 'JSON' ? '\n}' : '';
      const value = 'x'.repeat(90);
      const recordBytes = Buffer.byteLength(`  "record-00000001": "${value}"` + separator);
      const overhead = Buffer.byteLength(opening + closing + marker) - Buffer.byteLength(separator);
      const count = Math.max(1, Math.floor((bytes - overhead) / recordBytes));
      const padding = bytes - (count * recordBytes + overhead);
      const records = Array.from({ length: count }, (_, i) => `  "record-${String(i).padStart(8, '0')}": "${i === 0 ? marker : ''}${value}${i === count - 1 ? 'x'.repeat(padding) : ''}"`);
      let payload = opening + records.join(separator) + closing;
      assert.equal(Buffer.byteLength(payload), bytes, 'each body must fill its declared profile size exactly');
      report.scenario.payloads.push({ language, large, bytes: Buffer.byteLength(payload), sha256: hash(payload) });
      await paste(app, editor(), payload);
      // Native document navigation; JSON edits remain valid whitespace until the explicit invalid transition below.
      await nativeInput(app, [{ type: 'keyDown', keyCode: 'Up', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'Up', modifiers: ['meta'] }]);
      await editor().locator('.cm-line').first().filter({ hasText: language === 'JSON' ? '{' : 'record-' }).waitFor();
      await wait(300);
      if (timeline && language === 'Raw' && !large) {
        report.scenario.timeline.visibleEditors = await page.locator('.cm-scroller:visible').evaluateAll(elements => elements.map(element => ({
          editable: element.querySelector('.cm-content')?.getAttribute('contenteditable'),
          viewport: element.getBoundingClientRect().toJSON(), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth
        })));
        await app.evaluate(({ contentTracing }, options) => contentTracing.startRecording(options), report.scenario.timeline.options);
      }
      let prefix = '';
      for (let index = 0; index < (checksOnly ? 0 : 30); index++) {
        const char = language === 'JSON' ? ' ' : String.fromCharCode(65 + index % 26);
        const content = await editor().boundingBox();
        const region = rect({ x: content.x, y: content.y, width: Math.min(350, content.width - 10), height: 20 });
        prefix += char;
        const expectedLine = prefix + payload.split('\n', 1)[0];
        const sample = await measureAction({ id: `${language}-${large ? 'large' : 'small'}-typing-${index}`, kind: 'typing', region, persistFrames: (cpuProfile && language === 'JSON' && !large) || timeline,
          action: () => nativeInput(app, textEvents(char)),
          outcome: () => page.waitForFunction(expected => document.querySelector('.cm-content[contenteditable="true"] .cm-line')?.textContent === expected, expectedLine)
        });
        sample.bodyType = language; sample.large = large;
        await wait(300);
      }
      payload = prefix + payload;
      if (language === 'JSON' && large) largeJsonDraft = payload;
      if (language === 'JSON') {
        await nativeInput(app, [{ type: 'keyDown', keyCode: 'Down', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'Down', modifiers: ['meta'] }]);
        await wait(100);
        const line = editor().locator('.cm-line').last();
        const region = rect(await line.boundingBox());
        region.width = Math.min(region.width, 350);
        const error = page.locator('.text-destructive').filter({ hasText: /JSON|Unexpected|position|non-whitespace|end/i }).first();
        await measureAction({ id: `JSON-${large ? 'large' : 'small'}-invalid`, kind: 'typing', region, persistFrames: true,
          action: () => nativeInput(app, textEvents('!')),
          outcome: () => line.filter({ hasText: /^}!$/ }).waitFor()
        });
        await error.waitFor();
        await measureAction({ id: `JSON-${large ? 'large' : 'small'}-corrected`, kind: 'typing', region, persistFrames: true,
          action: () => nativeInput(app, [{ type: 'keyDown', keyCode: 'Backspace' }, { type: 'keyUp', keyCode: 'Backspace' }]),
          outcome: () => line.filter({ hasText: /^}$/ }).waitFor()
        });
        await error.waitFor({ state: 'hidden' });
      }
      const prior = requests.length;
      const started = performance.now();
      const responsePanel = page.getByText('Response', { exact: true }).locator('xpath=ancestor::*[@data-panel][1]');
      const responseBox = await responsePanel.boundingBox();
      const responseRegion = rect({ x: responseBox.x + 50, y: responseBox.y + 92, width: Math.min(650, responseBox.width - 60), height: 32 });
      await measureAction({ id: `${language}-${large ? 'large' : 'small'}-send`, kind: 'api-response', region: responseRegion,
        action: () => nativeClick(app, page.getByRole('button', { name: 'Send', exact: true })),
        outcome: async () => {
          await page.getByRole('button', { name: 'Copy', exact: true }).waitFor({ timeout: 120000 });
          await response().locator('.cm-line').filter({ hasText: marker }).waitFor();
        }
      });
      const phases = await page.locator('[data-api-network-total-ms]').evaluate(element => Object.fromEntries([...element.attributes].filter(a => a.name.startsWith('data-api-')).map(a => [a.name.slice(9), Number(a.value)])));
      report.loads.push({ kind: 'api-phases', language, large, ...phases, endpoint: 'transport/local preparation durations, not presented paint' });
      await nativeClick(app, page.getByRole('button', { name: 'Copy', exact: true }));
      await page.getByRole('button', { name: 'Copied!', exact: true }).waitFor();
      const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
      assert.equal(requests.length, prior + 1);
      assert.equal(requests.at(-1).sha256, hash(payload), 'HTTP fixture must receive entire current draft');
      const expected = language === 'JSON' ? JSON.stringify(JSON.parse(payload), null, 2) : payload;
      assert.equal(hash(copied), hash(expected), 'response copy must include every formatted byte');
      report.loads.push({ kind: 'api-send-through-copy-ready', language, large, durationMs: performance.now() - started, requestBytes: Buffer.byteLength(payload), responseBytes: Buffer.byteLength(copied) });
      assert.ok(await response().count(), 'response body visible');
      await nativeClick(app, response().locator('.cm-line').first());
      await nativeInput(app, chord('F'));
      const search = page.locator('.cm-search input[name="search"]');
      await search.waitFor();
      await paste(app, search, `record-${String(records.length - 1).padStart(8, '0')}`);
      await measureAction({ id: `${language}-${large ? 'large' : 'small'}-search`, kind: 'api-response-search', region: responseRegion,
        action: () => nativeClick(app, page.locator('.cm-search').getByRole('button', { name: 'next', exact: true })),
        outcome: () => page.waitForFunction(needle => {
          const line = [...document.querySelectorAll('.cm-content[contenteditable="false"] .cm-line')].find(element => element.textContent.includes(needle));
          if (!line) return false;
          const rect = line.getBoundingClientRect(), viewport = line.closest('.cm-scroller').getBoundingClientRect();
          return rect.bottom > viewport.top && rect.top < viewport.bottom;
        }, `record-${String(records.length - 1).padStart(8, '0')}`)
      });
      await nativeInput(app, [{ type: 'keyDown', keyCode: 'Escape' }, { type: 'keyUp', keyCode: 'Escape' }]);
      report.correctness.responseSearchEnd = true;
      await captureWindow(app, path.join(directory, `${language}-${large ? 'large' : 'small'}-response.png`));
    }
    report.correctness.apiEchoBodies = true;
    const originalResponseSha256 = requests.at(-1).sha256;
    await page.locator('header button[title]').first().click();
    const original = page.getByRole('button', { name: /^POST New Request$/ });
    await original.click({ button: 'right' });
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.getByRole('heading', { name: /New Request.*copy/i }).waitFor();
    await page.getByRole('button', { name: 'Body', exact: true }).first().click();
    await page.getByRole('button', { name: 'Raw', exact: true }).click();
    await paste(app, editor(), 'synthetic-unsaved-draft');
    await original.click();
    await page.getByRole('button', { name: /POST New Request.*copy/i }).click();
    await page.getByRole('button', { name: 'Body', exact: true }).first().click();
    await editor().locator('.cm-line').filter({ hasText: 'synthetic-unsaved-draft' }).waitFor();
    report.correctness.requestDraftSwitch = true;
    await paste(app, editor(), largeJsonDraft);
    const liveFirstLine = largeJsonDraft.split('\n', 1)[0];
    const received = new Promise((resolve, reject) => {
      slowTimer = setTimeout(() => reject(new Error('No real slow HTTP request received')), 10000);
      onSlowRequest = entry => { clearTimeout(slowTimer); resolve(entry); };
    });
    await page.getByPlaceholder('Enter request URL (e.g., https://api.example.com/users)').fill(`http://127.0.0.1:${server.address().port}/echo?slow=1`);
    await nativeClick(app, page.getByRole('button', { name: 'Send', exact: true }));
    const slow = await received;
    await editor().focus();
    await nativeInput(app, [{ type: 'keyDown', keyCode: 'Up', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'Up', modifiers: ['meta'] }]);
    await waitForEditorStart(liveFirstLine);
    const liveLine = editor().locator('.cm-line').first();
    const liveRegion = rect(await liveLine.boundingBox());
    liveRegion.width = Math.min(liveRegion.width, 350);
    const nativeViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    report.scenario.parallelTypingTarget = { region: liveRegion, viewport: nativeViewport };
    assert.ok(liveRegion.x >= 0 && liveRegion.y >= 0
      && liveRegion.x + liveRegion.width <= nativeViewport.width
      && liveRegion.y + liveRegion.height <= nativeViewport.height,
    `parallel typing target must be inside the native viewport: ${JSON.stringify(report.scenario.parallelTypingTarget)}`);
    const live = await measureAction({ id: 'typing-during-http', kind: 'api-parallel-typing', region: liveRegion,
      persistFrames: true,
      action: () => nativeInput(app, textEvents('Z')),
      outcome: () => page.waitForFunction(expected => document.querySelector('.cm-content[contenteditable="true"] .cm-line')?.textContent === expected, 'Z' + liveFirstLine)
    });
    await page.getByRole('button', { name: 'Copy', exact: true }).waitFor();
    const liveAfter = await measureAction({ id: 'typing-with-large-response', kind: 'api-parallel-typing', region: liveRegion,
      persistFrames: true,
      action: () => nativeInput(app, textEvents('Y')),
      outcome: async () => {
        await page.waitForFunction(expected => document.querySelector('.cm-content[contenteditable="true"] .cm-line')?.textContent === expected, 'ZY' + liveFirstLine);
        await response().locator('.cm-line').filter({ hasText: 'JSON-large-' }).waitFor();
      }
    });
    assert.equal(slow.sha256, hash(largeJsonDraft), 'HTTP execution must keep the clicked large snapshot');
    assert.equal(hash(await copyEditor(app, editor())), hash('ZY' + largeJsonDraft), 'large response/save refresh must retain edits made while sending');
    assert.ok(liveAfter.background[0].lifecycleOverlap.inputAt >= slow.sent, 'second native edit must follow actual large-response delivery');
    liveAfter.httpResponse = { sentAt: slow.sent, bytes: slow.bytes };
    const overlap = live.background[0].lifecycleOverlap;
    assert.ok(overlap.inputAt >= slow.received && overlap.presentedAt < slow.sent, 'native visible typing must overlap an actual pending HTTP response');
    live.httpOverlap = { receivedAt: slow.received, sentAt: slow.sent };
    report.correctness.editWhileSending = true;
    await nativeClick(app, page.getByRole('button', { name: 'Copy', exact: true }));
    await page.getByRole('button', { name: 'Copied!', exact: true }).waitFor();
    assert.equal(hash(await app.evaluate(({ clipboard }) => clipboard.readText())), hash(largeJsonDraft), 'delayed large response must be copied in full');

    await editor().focus();
    await nativeInput(app, [{ type: 'keyDown', keyCode: 'Up', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'Up', modifiers: ['meta'] }]);
    await waitForEditorStart('ZY' + liveFirstLine);
    const viewport = editor().locator('..');
    const wheelStart = await viewport.evaluate(element => element.scrollTop);
    await Promise.all([
      viewport.evaluate((element, initialScrollTop) => new Promise((resolve, reject) => {
        const settled = () => {
          if (element.scrollTop <= initialScrollTop) return;
          clearTimeout(timer);
          element.removeEventListener('scrollend', settled);
          resolve();
        };
        const timer = setTimeout(() => {
          element.removeEventListener('scrollend', settled);
          reject(new Error('Native request-editor wheel did not finish scrolling'));
        }, 5000);
        element.addEventListener('scrollend', settled);
      }), wheelStart),
      (async () => {
        const box = await viewport.boundingBox();
        await nativeWheel(app, box.x + box.width / 2, box.y + box.height / 2);
      })(),
    ]);
    const viewportSnapshot = () => editor().evaluate(content => {
      const scroller = content.closest('.cm-scroller'), bounds = scroller.getBoundingClientRect();
      const line = [...content.querySelectorAll('.cm-line')].find(line => {
        const box = line.getBoundingClientRect();
        return box.bottom > bounds.top + 1 && box.top < bounds.bottom;
      });
      return { scrollTop: scroller.scrollTop, anchor: line?.textContent };
    });
    const viewportBefore = await viewportSnapshot();
    assert.ok(viewportBefore.scrollTop > wheelStart && viewportBefore.anchor?.includes('record-'), 'native wheel must reveal a later numbered record');
    await captureWindow(app, path.join(directory, 'request-viewport-before-tab.png'));
    const viewportBox = await viewport.boundingBox();
    const viewportRegion = rect({ x: viewportBox.x + 50, y: viewportBox.y + 4, width: Math.min(350, viewportBox.width - 60), height: 32 });
    await measureAction({ id: 'large-request-headers-tab', kind: 'api-body-tab', region: viewportRegion,
      action: () => nativeClick(app, page.getByRole('button', { name: 'Headers', exact: true }).first()),
      outcome: () => page.getByRole('button', { name: 'Add Item', exact: true }).waitFor()
    });
    await measureAction({ id: 'large-request-body-tab', kind: 'api-body-tab', region: viewportRegion,
      action: () => nativeClick(app, page.getByRole('button', { name: 'Body', exact: true }).first()),
      outcome: () => page.waitForFunction(expected => {
        const content = document.querySelector('.cm-content[contenteditable="true"]');
        const scroller = content?.closest('.cm-scroller');
        if (!scroller) return false;
        const bounds = scroller.getBoundingClientRect();
        const line = [...content.querySelectorAll('.cm-line')].find(line => {
          const box = line.getBoundingClientRect();
          return box.bottom > bounds.top + 1 && box.top < bounds.bottom;
        });
        return line?.textContent === expected.anchor && Math.abs(scroller.scrollTop - expected.scrollTop) <= 1;
      }, viewportBefore)
    });
    const viewportAfter = await viewportSnapshot();
    assert.equal(viewportAfter.anchor, viewportBefore.anchor, 'body-tab roundtrip must retain the visible large-draft anchor');
    assert.ok(Math.abs(viewportAfter.scrollTop - viewportBefore.scrollTop) <= 1, 'body-tab roundtrip must retain the large-draft viewport');
    await captureWindow(app, path.join(directory, 'request-viewport-after-tab.png'));
    report.correctness.tabViewport = { before: viewportBefore, after: viewportAfter };

    await paste(app, editor(), 'draft-selection');
    await nativeInput(app, [
      { type: 'keyDown', keyCode: 'Up', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'Up', modifiers: ['meta'] },
      ...Array.from({ length: 5 }, () => [{ type: 'keyDown', keyCode: 'Right' }, { type: 'keyUp', keyCode: 'Right' }]).flat(),
      ...Array.from({ length: 2 }, () => [{ type: 'keyDown', keyCode: 'Right', modifiers: ['shift'] }, { type: 'keyUp', keyCode: 'Right', modifiers: ['shift'] }]).flat(),
    ]);
    await page.getByRole('button', { name: 'Headers', exact: true }).first().click();
    await page.getByRole('button', { name: 'Body', exact: true }).first().click();
    await editor().focus();
    await wait(600); // Keep the following edit in its own ordinary CodeMirror history group.
    await nativeInput(app, textEvents('X'));
    assert.equal(await copyEditor(app, editor()), 'draftXelection', 'tab roundtrip must retain the request selection');
    report.correctness.tabSelection = true;
    await page.getByRole('button', { name: 'Headers', exact: true }).first().click();
    await page.getByRole('button', { name: 'Body', exact: true }).first().click();
    await editor().focus();
    await nativeInput(app, chord('Z'));
    assert.equal(await copyEditor(app, editor()), 'draft-selection', 'tab roundtrip must retain undo history');
    report.correctness.tabUndoHistory = true;

    await page.getByRole('button', { name: 'XML', exact: true }).click();
    const selectedRawColor = () => page.getByRole('button', { name: 'XML', exact: true }).evaluate(async element => {
      await Promise.all(element.getAnimations().map(animation => animation.finished));
      return getComputedStyle(element).backgroundColor;
    });
    const xmlColor = await selectedRawColor();
    await page.getByRole('button', { name: 'Headers', exact: true }).first().click();
    await page.getByRole('button', { name: 'Body', exact: true }).first().click();
    assert.equal(await selectedRawColor(), xmlColor, 'raw-language selected appearance must survive tab switching');
    for (const bodyType of ['JSON', 'Form Data', 'x-www-form-urlencoded', 'None', 'Binary']) {
      await page.getByRole('button', { name: bodyType, exact: true }).click();
      await page.getByRole('button', { name: 'Raw', exact: true }).click();
      assert.equal(await copyEditor(app, editor()), 'draft-selection', `${bodyType} roundtrip must retain the text draft`);
    }
    report.correctness.bodyTypeRoundtrips = true;

    await page.getByRole('button', { name: 'x-www-form-urlencoded', exact: true }).click();
    await page.getByRole('button', { name: 'Add Item', exact: true }).click();
    await page.getByPlaceholder('Key', { exact: true }).fill('synthetic');
    await page.getByPlaceholder('Value', { exact: true }).fill('alpha beta&gamma');
    await page.getByRole('button', { name: 'Form Data', exact: true }).click();
    assert.equal(await page.getByPlaceholder('Field name', { exact: true }).inputValue(), 'synthetic');
    assert.equal(await page.getByPlaceholder('Value', { exact: true }).inputValue(), 'alpha beta&gamma');
    await page.getByPlaceholder('Value', { exact: true }).fill('delta ∆');
    await page.getByRole('button', { name: 'Headers', exact: true }).first().click();
    await page.getByRole('button', { name: 'Body', exact: true }).first().click();
    assert.equal(await page.getByPlaceholder('Value', { exact: true }).inputValue(), 'delta ∆');
    await page.getByRole('button', { name: 'x-www-form-urlencoded', exact: true }).click();
    assert.equal(await page.getByPlaceholder('Key', { exact: true }).inputValue(), 'synthetic');
    assert.equal(await page.getByPlaceholder('Value', { exact: true }).inputValue(), 'delta ∆');
    await page.getByPlaceholder('Enter request URL (e.g., https://api.example.com/users)').fill(`http://127.0.0.1:${server.address().port}/echo`);
    await nativeClick(app, page.getByRole('button', { name: 'Send', exact: true }));
    await response().locator('.cm-line').filter({ hasText: /^synthetic=delta%20%E2%88%86$/ }).waitFor();
    await page.getByRole('button', { name: 'Copy', exact: true }).waitFor();
    await nativeClick(app, page.getByRole('button', { name: 'Copy', exact: true }));
    await page.getByRole('button', { name: 'Copied!', exact: true }).waitFor();
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'synthetic=delta%20%E2%88%86');
    assert.equal(requests.at(-1).sha256, hash('synthetic=delta%20%E2%88%86'));
    assert.equal(requests.at(-1).headers['content-type'], 'application/x-www-form-urlencoded');
    report.correctness.formBodyEditingAndEcho = true;

    await page.getByRole('button', { name: 'None', exact: true }).click();
    await nativeClick(app, page.getByRole('button', { name: 'Send', exact: true }));
    await page.getByText('Response body is empty', { exact: true }).waitFor();
    assert.equal(requests.at(-1).bytes, 0, 'None body must send zero body bytes');
    await page.getByRole('button', { name: 'x-www-form-urlencoded', exact: true }).click();
    assert.equal(await page.getByPlaceholder('Value', { exact: true }).inputValue(), 'delta ∆');
    report.correctness.noBodyRoundtrip = true;

    await page.getByRole('button', { name: 'Binary', exact: true }).click();
    await page.getByRole('heading', { name: /^New Request \(Copy\)$/i }).locator('xpath=ancestor::*[@data-panel][1]').locator('input[type="file"]').setInputFiles({ name: 'synthetic-body.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic-only') });
    await page.getByText('synthetic-body.txt', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'None', exact: true }).click();
    await page.getByRole('button', { name: 'Binary', exact: true }).click();
    await page.getByText('synthetic-body.txt', { exact: true }).waitFor();
    report.correctness.binarySelectionRoundtrip = true;

    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    await paste(app, editor(), '{"z":1,"a":[1,2]}');
    await page.getByRole('button', { name: 'Beautify', exact: true }).and(page.locator('button:enabled')).waitFor();
    await nativeClick(app, page.getByRole('button', { name: 'Beautify', exact: true }));
    await page.waitForFunction(() => document.querySelector('.cm-content[contenteditable="true"] .cm-line')?.textContent === '{');
    assert.equal(await copyEditor(app, editor()), '{\n  "z": 1,\n  "a": [\n    1,\n    2\n  ]\n}', 'Beautify must preserve complete data and key order');
    report.correctness.beautify = true;

    assert.equal(typeof largeJsonDraft, 'string');
    const invalidJson = largeJsonDraft + '!';
    await paste(app, editor(), invalidJson);
    const jsonError = page.locator('.text-destructive').filter({ hasText: /JSON|Unexpected|position|non-whitespace|end/i }).first();
    await jsonError.waitFor();
    await nativeClick(app, page.getByRole('button', { name: 'Send', exact: true }));
    await page.getByRole('button', { name: 'Copy', exact: true }).waitFor();
    await nativeClick(app, page.getByRole('button', { name: 'Copy', exact: true }));
    await page.getByRole('button', { name: 'Copied!', exact: true }).waitFor();
    assert.equal(hash(await app.evaluate(({ clipboard }) => clipboard.readText())), hash(invalidJson), 'temporarily invalid JSON must be sent and copied without changing bytes');
    assert.equal(requests.at(-1).sha256, hash(invalidJson));
    await jsonError.waitFor();
    await captureWindow(app, path.join(directory, 'invalid-json-response.png'));
    report.correctness.invalidJsonEcho = true;

    const responsePane = page.getByText('Response', { exact: true }).locator('xpath=ancestor::*[@data-panel][1]');
    await responsePane.getByRole('button', { name: /^Headers/ }).click();
    const formattedLargeJson = JSON.stringify(JSON.parse(largeJsonDraft), null, 2);
    await paste(app, editor(), ' ' + largeJsonDraft);
    await jsonError.waitFor({ state: 'hidden' });
    await page.getByText('Checking JSON…', { exact: true }).waitFor({ state: 'hidden' });
    await nativeInput(app, [{ type: 'keyDown', keyCode: 'Up', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'Up', modifiers: ['meta'] }]);
    await page.getByRole('button', { name: 'Beautify', exact: true }).and(page.locator('button:enabled')).waitFor();
    await nativeClick(app, page.getByRole('button', { name: 'Beautify', exact: true }));
    await editor().locator('.cm-line').first().filter({ hasText: /^\{$/ }).waitFor();
    assert.equal(hash(await copyEditor(app, editor())), hash(formattedLargeJson), 'large worker Beautify must preserve every formatted byte');
    await page.getByText('Checking JSON…', { exact: true }).waitFor({ state: 'hidden' });
    report.correctness.largeBeautify = true;
    await nativeClick(app, page.getByRole('button', { name: 'Send', exact: true }));
    await responsePane.getByText(hash(formattedLargeJson), { exact: true }).waitFor();
    await responsePane.getByRole('button', { name: 'Body', exact: true }).click();
    await page.getByRole('button', { name: 'Copy', exact: true }).waitFor();
    await nativeClick(app, page.getByRole('button', { name: 'Copy', exact: true }));
    await page.getByRole('button', { name: 'Copied!', exact: true }).waitFor();
    assert.equal(hash(await app.evaluate(({ clipboard }) => clipboard.readText())), hash(formattedLargeJson));
    assert.equal(requests.at(-1).sha256, hash(formattedLargeJson));
    report.correctness.correctedJsonEcho = true;

    await page.getByRole('button', { name: /^POST New Request \(Copy\)$/i }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.getByRole('heading', { name: /^New Request \(Copy\) \(Copy\)$/i }).waitFor();
    await page.getByText('Send a request to see the response', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Body', exact: true }).first().click();
    await page.getByRole('button', { name: 'Raw', exact: true }).click();
    await page.getByPlaceholder('Enter request URL (e.g., https://api.example.com/users)').fill(`http://127.0.0.1:${server.address().port}/echo`);
    await paste(app, editor(), largeJsonDraft);
    await nativeInput(app, [{ type: 'keyDown', keyCode: 'Up', modifiers: ['meta'] }, { type: 'keyUp', keyCode: 'Up', modifiers: ['meta'] }]);
    await waitForEditorStart(largeJsonDraft.split('\n', 1)[0]);
    const sendBox = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
    const sendPoint = { x: Math.round(sendBox.x + sendBox.width / 2), y: Math.round(sendBox.y + sendBox.height / 2) };
    const immediateResponse = await responsePane.boundingBox();
    const priorImmediate = requests.length;
    await measureAction({ id: 'immediate-large-draft-send', kind: 'api-immediate-send',
      region: rect({ x: immediateResponse.x + 50, y: immediateResponse.y + 92, width: Math.min(650, immediateResponse.width - 60), height: 32 }),
      action: () => nativeInput(app, [...textEvents('Z'), { type: 'mouseMove', ...sendPoint },
        { type: 'mouseDown', button: 'left', clickCount: 1, ...sendPoint }, { type: 'mouseUp', button: 'left', clickCount: 1, ...sendPoint }]),
      outcome: () => response().locator('.cm-line').first().filter({ hasText: /^Z/ }).waitFor({ timeout: 120000 })
    });
    assert.equal(requests.length, priorImmediate + 1);
    assert.equal(requests.at(-1).sha256, hash('Z' + largeJsonDraft), 'native key and Send in one dispatch must send the latest complete draft');
    await nativeClick(app, page.getByRole('button', { name: 'Copy', exact: true }));
    await page.getByRole('button', { name: 'Copied!', exact: true }).waitFor();
    assert.equal(hash(await app.evaluate(({ clipboard }) => clipboard.readText())), hash('Z' + largeJsonDraft));
    report.correctness.immediateDraftSnapshot = true;
    await original.click();
    await nativeClick(app, page.getByRole('button', { name: 'Copy', exact: true }));
    await page.getByRole('button', { name: 'Copied!', exact: true }).waitFor();
    assert.equal(hash(await app.evaluate(({ clipboard }) => clipboard.readText())), originalResponseSha256, 'switching requests must restore that request response, not another request result');
    report.correctness.responseOwnership = true;
  } finally {
    if (profiler) {
      try {
        const { profile: captured } = await profiler.send('Profiler.stop');
        fs.writeFileSync(path.join(directory, 'api-renderer.cpuprofile'), JSON.stringify(captured));
        report.scenario.cpuProfileFile = 'api-renderer.cpuprofile';
      } catch (error) { report.scenario.cpuProfileError = error.message; }
      await profiler.detach().catch(error => { report.scenario.cpuProfileDetachError = error.message; });
    }
    if (timeline) {
      let traceTimeout;
      try {
        const recorded = await Promise.race([
          app.evaluate(async ({ contentTracing }, destination) => {
            const bufferUsage = await contentTracing.getTraceBufferUsage();
            return { bufferUsage, path: await contentTracing.stopRecording(destination) };
          }, path.join(directory, 'api-renderer-trace.json')),
          new Promise((_, reject) => { traceTimeout = setTimeout(() => reject(new Error('Electron trace did not complete within 30 seconds')), 30000); })
        ]);
        Object.assign(report.scenario.timeline, recorded);
      } catch (error) { report.scenario.timeline.error = error.message; }
      finally { clearTimeout(traceTimeout); }
    }
    clearTimeout(slowTimer);
    report.longTasks = await page.evaluate(() => globalThis.__perfLongTasks ?? []).catch(() => []);
    report.eventTimings = await page.evaluate(() => globalThis.__perfEvents ?? []).catch(() => []);
    report.trustedInputs = await page.evaluate(() => globalThis.__perfTrusted ?? []).catch(() => []);
    report.summary.typing = quantiles(report.samples.filter(sample => sample.kind === 'typing'), profile.inputTargetMs);
    report.summary['api-response'] = quantiles(report.samples.filter(sample => sample.kind === 'api-response'), Infinity);
    report.summary['api-parallel-typing'] = quantiles(report.samples.filter(sample => sample.kind === 'api-parallel-typing'), profile.inputTargetMs);
    report.correctness.backgroundTerminalStreams = await page.evaluate(() => globalThis.__perfTerminalStreams ?? {}).catch(() => ({}));
    await captureWindow(app, path.join(directory, 'final-ui.png')).catch(() => {});
    await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(directory, 'http-events.json'), JSON.stringify(requests, null, 2));
  }
}
(async () => { for (const profile of option('--profile', 'all') === 'all' ? ['everyday', 'stress'] : [option('--profile')]) await runProfile(profile, scenario); })().catch(error => { console.error(error.stack); process.exitCode = 1; });
