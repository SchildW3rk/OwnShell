'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { startS3 } = require('./s3-fixture.cjs');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeInput, textEvents, nativeClick, nativeWheel, sftpRead, measureMixedFrame, measureTerminalEcho } = require('./mixed-ui.cjs');
const { quantiles, text, schedule } = require('./workloads.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pane = (page, index) => page.locator('span').filter({ hasText: new RegExp(`^Benchmark ${index}$`) }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) });
const rect = box => ({ x: Math.ceil(box.x), y: Math.ceil(box.y), width: Math.floor(box.width), height: Math.floor(box.height) });
async function leavePreview(app, page) {
  await nativeInput(app, [{ type: 'mouseMove', x: 10, y: 10 }]);
  await page.locator('img[alt="Preview"]').waitFor({ state: 'detached', timeout: 3000 });
  await wait(300);
}

async function enlargeS3Pane(app, page) {
  await page.locator('header button[title]').first().click();
  await wait(250);
  const pane = page.getByText('S3: Synthetic S3 benchmark', { exact: true }).locator('xpath=../../..');
  const drag = async (start, end) => {
    await nativeInput(app, [{ type: 'mouseMove', ...start }, { type: 'mouseDown', button: 'left', clickCount: 1, ...start }]);
    for (let step = 1; step <= 12; step++) {
      await nativeInput(app, [{ type: 'mouseMove', modifiers: ['leftButtonDown'], x: Math.round(start.x + (end.x - start.x) * step / 12), y: Math.round(start.y + (end.y - start.y) * step / 12) }]);
      await wait(16);
    }
    await nativeInput(app, [{ type: 'mouseUp', button: 'left', clickCount: 1, ...end }]);
    await wait(250);
  };
  const separators = () => page.getByRole('separator').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  const rows = async () => (await separators()).filter(separator => separator.width > 500 && separator.height < 5).sort((left, right) => left.y - right.y);
  const originalRows = await rows();
  let box = await pane.boundingBox();
  const row = (await separators()).find(separator => separator.width > 500 && separator.height < 5 && Math.abs(separator.y + separator.height - box.y) < 5);
  if (row) await drag({ x: Math.round(row.x + row.width / 2), y: Math.round(row.y + row.height / 2) }, { x: Math.round(row.x + row.width / 2), y: 160 });
  box = await pane.boundingBox();
  const column = (await separators()).find(separator => separator.height > 100 && separator.width < 5 && Math.abs(separator.x + separator.width - box.x) < 5 && separator.y >= box.y - 5);
  if (column) await drag({ x: Math.round(column.x + column.width / 2), y: Math.round(column.y + column.height / 2) }, { x: 440, y: Math.round(column.y + column.height / 2) });
  const geometry = await pane.boundingBox();
  assert.ok(geometry.width >= 600 && geometry.height >= 400, `S3 pane must remain usable with every background session retained: ${JSON.stringify(geometry)}`);
  return {
    geometry,
    async restoreRows() {
      for (let index = 0; index < originalRows.length; index++) {
        const current = (await rows())[index], original = originalRows[index];
        assert.ok(current, 'original workspace row splitter must remain accessible');
        await drag({ x: Math.round(current.x + current.width / 2), y: Math.round(current.y + current.height / 2) }, { x: Math.round(current.x + current.width / 2), y: Math.round(original.y + original.height / 2) });
      }
    },
  };
}

async function scenario(context) {
  const { app, page, profile, directory, report, ssh } = context;
  const fixture = await startS3(profile.entries);
  report.scenario = { issue: 10, service: 'real RustFS; not AWS/MinIO/full S3 compatibility', image: fixture.image, entries: profile.entries, images: fixture.images, endpoint: fixture.endpoint, phases: [], failures: [] };
  report.scenario.acquisition = { captureAfterOutcome: process.argv.includes('--capture-after-outcome'), timingClaim: 'Absolute local p95 targets only; historical observer modes are not pooled and no observer-change product speedup is claimed' };
  report.scenario.browserImages = [];
  const imageRequest = request => {
    if (request.resourceType() === 'image' && request.url().startsWith(fixture.endpoint + '/')) report.scenario.browserImages.push({ at: performance.now(), kind: 'requested', path: new URL(request.url()).pathname });
  };
  const imageFailure = request => {
    if (request.resourceType() === 'image' && request.url().startsWith(fixture.endpoint + '/')) report.scenario.browserImages.push({ at: performance.now(), kind: 'failed', path: new URL(request.url()).pathname, error: request.failure()?.errorText });
  };
  const imageResponse = response => {
    if (response.request().resourceType() === 'image' && response.url().startsWith(fixture.endpoint + '/')) report.scenario.browserImages.push({ at: performance.now(), kind: 'response', path: new URL(response.url()).pathname, status: response.status() });
  };
  const check = (condition, message) => { if (!condition) report.scenario.failures.push(message); };
  const phase = async (kind, action) => { const at = performance.now(); const value = await action(); report.scenario.phases.push({ kind, at, durationMs: performance.now() - at, endpoint: 'public UI ready, not compositor paint' }); return value; };
  let primaryError;
  try {
    const assets = path.resolve(__dirname, '../../dist/assets');
    report.build.s3RendererAssets = fs.readdirSync(assets).filter(name => /^S3View-.*\.js$/.test(name)).map(name => ({ name, sha256: createHash('sha256').update(fs.readFileSync(path.join(assets, name))).digest('hex') }));
    report.scenario.serviceResources = [{ phase: 'seeded', at: performance.now(), ...fixture.stats() }];
    await app.evaluate((_electron, modulePath) => {
      const log = process.mainModule.require(modulePath);
      const observedNames = new Set(['S3: Listing objects', 'S3: Listed objects', 'S3: Generating presigned URL', 'S3: Presigned URL generated']);
      global.__s3BenchmarkLog = [];
      log.transports.s3Benchmark = message => {
        const name = message.data[0];
        if (typeof name === 'string' && observedNames.has(name)) {
          global.__s3BenchmarkLog.push({ at: performance.now(), name, metadata: message.data[1] });
        }
      };
    }, require.resolve('electron-log'));
    page.on('request', imageRequest);
    page.on('requestfailed', imageFailure);
    page.on('response', imageResponse);
    await runMixed({ ...context, interactive: true });
    await page.getByRole('button', { name: 'Storage', exact: true }).click();
    await page.getByRole('button', { name: 'New S3 connection', exact: true }).click();
    for (const [id, value] of Object.entries({ label: 'Synthetic S3 benchmark', endpoint: fixture.endpoint, region: 'us-east-1', 'access-key': fixture.accessKeyId, 'secret-key': fixture.secretAccessKey })) await page.locator(`#s3-${id}`).fill(value);
    await page.locator('form').getByRole('button', { name: 'Create Connection', exact: true }).click();
    await page.getByRole('button', { name: 'Synthetic S3 benchmark', exact: true }).click();
    await phase('bucket-list-network-ipc-ui', () => page.getByText(fixture.buckets[0], { exact: true }).waitFor());
    await phase('root-list-network-ipc-ui', async () => { await page.getByText(fixture.buckets[0], { exact: true }).dblclick(); await page.getByText('00-green.png', { exact: true }).waitFor(); });
    const browser = page.locator('div.flex.flex-col.h-full.bg-background').filter({ has: page.getByRole('button', { name: fixture.buckets[0], exact: true }) }).last();
    await browser.evaluate(root => {
      const events = [], types = ['mouseover', 'mouseout', 'load', 'error'];
      const describe = element => element instanceof Element ? { tag: element.tagName, className: element.getAttribute('class'), imagePath: element instanceof HTMLImageElement ? new URL(element.src, location.href).pathname : null } : null;
      const observe = event => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const text = target.textContent?.trim() || '';
        if (!/^(?:00-green|01-red|02-broken|03-green|04-missing)\.(?:png|jpe?g|gif|webp)$/.test(text) && !(target instanceof HTMLImageElement && target.alt === 'Preview')) return;
        events.push({ at: performance.now(), type: event.type, isTrusted: event.isTrusted, filename: text, target: describe(target), related: describe(event.relatedTarget) });
      };
      for (const type of types) root.addEventListener(type, observe, true);
      window.__stopS3PreviewEvents = () => {
        for (const type of types) root.removeEventListener(type, observe, true);
        return events;
      };
    });
    const narrowName = browser.getByText('00-green.png', { exact: true });
    await narrowName.scrollIntoViewIfNeeded();
    const narrowBox = await narrowName.boundingBox();
    await nativeClick(app, narrowName);
    report.scenario.narrowPreviewReady = await page.waitForFunction(point => {
      const image = document.querySelector('img[alt="Preview"]'), hit = document.elementFromPoint(point.x, point.y);
      return image?.complete && image.naturalWidth === 96 && new URL(image.src).pathname.endsWith('00-green.png') && hit?.textContent?.trim() === '00-green.png';
    }, { x: Math.round(narrowBox.x + narrowBox.width / 2), y: Math.round(narrowBox.y + narrowBox.height / 2) }, { timeout: 1500 }).then(() => true, () => false);
    check(report.scenario.narrowPreviewReady, 'preview must remain usable in the original narrow tiled pane');
    await page.screenshot({ path: path.join(directory, 'narrow-preview.png') });
    await leavePreview(app, page);
    const layout = await enlargeS3Pane(app, page);
    report.scenario.geometry = layout.geometry;
    const firstTable = browser.locator('table'), firstViewport = await firstTable.locator('..').boundingBox(), firstHeader = await firstTable.locator('thead').boundingBox();
    report.samples.push(await measureMixedFrame(context, {
      app, page, directory, id: 's3-first-listing', kind: 's3-listing-load',
      region: rect({ x: firstViewport.x + 54, y: firstHeader.y + firstHeader.height + 5, width: Math.min(350, firstViewport.width - 90), height: 120 }),
      action: () => nativeClick(app, browser.getByText('listing', { exact: true })),
      outcome: () => browser.getByText('object-000000.txt', { exact: true }).waitFor(),
    }));
    await browser.getByRole('button', { name: fixture.buckets[0], exact: true }).click();
    await browser.getByText('00-green.png', { exact: true }).waitFor();
    const initialRequests = fixture.events.length;
    report.scenario.previewPaintTemperature = 'Warm image reopen after a separately recorded decode-readiness probe; no claim of cold network-to-paint latency.';
    for (const key of ['00-green.png', '01-red.png', '03-green.jpg', '03-green.jpeg', '03-green.gif', '03-green.webp']) {
      await leavePreview(app, page);
      const imageName = page.getByText(key, { exact: true });
      await imageName.scrollIntoViewIfNeeded();
      const previewStarted = performance.now();
      await nativeClick(app, imageName);
      const ready = await page.waitForFunction(key => { const img = document.querySelector('img[alt="Preview"]'); return img?.complete && img.naturalWidth === 96 && new URL(img.src).pathname.endsWith(key); }, key, { timeout: 1500 }).then(() => true, () => false);
      report.scenario.phases.push({ kind: 'first-preview-url-download-decode-ready', key, durationMs: performance.now() - previewStarted, ready, endpoint: 'decoded image DOM readiness, not compositor paint; ordinary browser cache may reuse an earlier preview request' });
      if (!ready) {
        report.scenario.failures.push(`supported preview did not open: ${key}`);
        report.scenario.previewFailure = await imageName.evaluate(element => {
          const box = element.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
          const hit = document.elementFromPoint(x, y), image = document.querySelector('img[alt="Preview"]');
          return { filenameBox: box.toJSON(), hitElement: { tag: hit?.tagName, className: hit?.getAttribute('class') }, preview: image ? { path: new URL(image.src).pathname, complete: image.complete, naturalWidth: image.naturalWidth } : null };
        });
        await page.screenshot({ path: path.join(directory, `failed-preview-${key}.png`) });
        await leavePreview(app, page);
        continue;
      }
      const imageBox = await page.locator('img[alt="Preview"]').boundingBox();
      (report.scenario.previewRegions ??= []).push({ key, imageBox });
      await leavePreview(app, page);
      assert.ok(imageBox && imageBox.width >= 1 && imageBox.height >= 1, 'preview paint region must contain visible decoded image pixels');
      report.samples.push(await measureMixedFrame(context, {
        app, page, directory, id: `s3-preview-${key}`, kind: 's3-preview',
        region: rect(imageBox),
        action: () => nativeClick(app, imageName),
        outcome: () => page.waitForFunction(key => { const img = document.querySelector('img[alt="Preview"]'); return img?.complete && img.naturalWidth === 96 && new URL(img.src).pathname.endsWith(key); }, key),
      }));
      const downloaded = fixture.events.findLast(event => event.kind === 'object-download' && event.auth === 'presigned' && event.path.endsWith(key));
      assert.equal(downloaded?.signed, true, 'preview must use an actual presigned browser object request');
      assert.equal(downloaded?.sha256, fixture.images[key].sha256, 'actual downloaded image bytes must match fixture');
      await page.screenshot({ path: path.join(directory, `preview-${key}.png`) });
    }
    await fixture.client.send(new DeleteObjectCommand({ Bucket: fixture.buckets[0], Key: '04-missing.png' }));
    for (const [key, status] of [['02-broken.png', 200], ['04-missing.png', 404]]) {
      const filename = browser.getByText(key, { exact: true });
      await filename.scrollIntoViewIfNeeded();
      const at = performance.now();
      await nativeClick(app, filename);
      const deadline = at + 3000;
      let response;
      do {
        response = fixture.events.findLast(event => event.kind === 'object-download' && event.auth === 'presigned' && event.path.endsWith(key) && event.at >= at && event.status);
        if (!response) await wait(20);
      } while (!response && performance.now() < deadline);
      check(response?.status === status, `preview must exercise actual ${status} response for ${key}`);
      const valid = browser.getByText('01-red.png', { exact: true });
      await valid.scrollIntoViewIfNeeded();
      await nativeClick(app, valid);
      check(await page.waitForFunction(() => { const image = document.querySelector('img[alt="Preview"]'); return image?.complete && image.naturalWidth === 96 && new URL(image.src).pathname.endsWith('01-red.png'); }, null, { timeout: 1500 }).then(() => true, () => false), `valid preview must recover after ${key}`);
    }
    await browser.locator('table').locator('..').evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
    await browser.evaluate(root => {
      let hovered = '';
      const events = [], mismatches = [];
      const inspect = () => {
        const image = root.querySelector('img[alt="Preview"]');
        if (image?.complete && image.naturalWidth && hovered && new URL(image.src).pathname.split('/').pop() !== hovered) mismatches.push({ hovered, path: new URL(image.src).pathname, at: performance.now() });
      };
      const observe = event => {
        const filename = event.target?.textContent?.trim();
        if (event.type === 'mouseover' && ['00-green.png', '01-red.png'].includes(filename)) {
          hovered = filename;
          events.push({ filename, at: performance.now(), isTrusted: event.isTrusted });
        }
      };
      const mutations = new MutationObserver(inspect);
      mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
      root.addEventListener('mouseover', observe, true);
      root.addEventListener('load', inspect, true);
      window.__stopS3RapidPreview = () => {
        mutations.disconnect();
        root.removeEventListener('mouseover', observe, true);
        root.removeEventListener('load', inspect, true);
        return { events, mismatches };
      };
    });
    const rapidPoints = await Promise.all(['00-green.png', '01-red.png'].map(async key => {
      const box = await browser.getByText(key, { exact: true }).boundingBox();
      return { type: 'mouseMove', x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    }));
    for (let repetition = 0; repetition < 6; repetition++) {
      for (const point of rapidPoints) await nativeInput(app, [point]);
      check(await page.waitForFunction(() => { const image = document.querySelector('img[alt="Preview"]'); return image?.complete && image.naturalWidth === 96 && new URL(image.src).pathname.endsWith('01-red.png'); }, null, { timeout: 1500 }).then(() => true, () => false), 'rapid preview switch must finish on the latest red image');
    }
    report.scenario.rapidPreviews = await page.evaluate(() => window.__stopS3RapidPreview());
    check(report.scenario.rapidPreviews.events.some(event => event.filename === '00-green.png' && event.isTrusted) && report.scenario.rapidPreviews.events.some(event => event.filename === '01-red.png' && event.isTrusted), 'rapid preview probe must exercise both real native hover targets');
    check(report.scenario.rapidPreviews.mismatches.length === 0, 'decoded preview must never contradict the latest hovered filename');
    const navigationFailureCount = report.scenario.failures.length;
    report.scenario.previewDomEvents = await page.evaluate(() => window.__stopS3PreviewEvents());
    await page.getByText('00-green.png', { exact: true }).hover();
    await browser.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).click();
    await page.getByText(fixture.buckets[1], { exact: true }).click();
    await page.getByText('other-only.txt', { exact: true }).waitFor();
    await wait(100);
    check(await page.locator('img[alt="Preview"]').count() === 0, 'bucket navigation must dismiss old preview');
    check(await page.getByText('00-green.png', { exact: true }).count() === 0, 'new bucket must not show old bucket objects');
    const otherBrowser = page.locator('div.flex.flex-col.h-full.bg-background').filter({ has: page.getByRole('button', { name: fixture.buckets[1], exact: true }) }).last();
    await otherBrowser.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).click();
    await page.getByText(fixture.buckets[0], { exact: true }).click();
    await browser.getByText('listing', { exact: true }).waitFor();
    for (let repetition = 0; repetition < 5; repetition++) {
      await nativeClick(app, browser.getByText('listing', { exact: true }));
      await nativeClick(app, browser.getByRole('button', { name: fixture.buckets[0], exact: true }));
      await nativeClick(app, browser.getByText('alternate', { exact: true }));
      await browser.getByText('alternate-only.txt', { exact: true }).waitFor();
      check(await browser.getByText('object-000000.txt', { exact: true }).count() === 0, 'latest prefix must not show an older listing response');
      await browser.getByRole('button', { name: fixture.buckets[0], exact: true }).click();
      await browser.getByText('listing', { exact: true }).waitFor();
    }
    report.correctness.s3LatestBucketPrefix = report.scenario.failures.length === navigationFailureCount;
    await browser.getByText('listing', { exact: true }).click();
    await page.getByText('object-000000.txt', { exact: true }).waitFor();
    await wait(100);
    check(await page.locator('img[alt="Preview"]').count() === 0, 'prefix navigation must dismiss old preview');
    report.scenario.previewRequests = fixture.events.slice(initialRequests);
    let pages = 1;
    const firstCheckbox = page.getByRole('row').filter({ hasText: 'object-000000.txt' }).getByRole('checkbox');
    await firstCheckbox.check();
    while (await page.getByRole('button', { name: 'Load more', exact: true }).count()) {
      const prior = fixture.events.filter(event => event.kind === 'listing').length;
      await phase('next-page-network-ipc-ui', () => page.getByRole('button', { name: 'Load more', exact: true }).click());
      const deadline = performance.now() + 30000;
      while (fixture.events.filter(event => event.kind === 'listing').length <= prior || !fixture.events.findLast(event => event.kind === 'listing')?.durationMs) {
        if (performance.now() > deadline) throw new Error('Next page did not complete a real S3 listing response');
        await wait(20);
      }
      await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(button => button.textContent.includes('Loading more')));
      assert.ok(fixture.events.filter(event => event.kind === 'listing').length > prior);
      pages++;
      if (pages > Math.ceil(profile.entries / 1000) + 2) throw new Error('Pagination did not terminate');
    }
    const listingResponses = fixture.events.filter(event => event.kind === 'listing' && event.prefix === 'listing/');
    const listingKeys = listingResponses.slice(listingResponses.findLastIndex(event => !event.continuation)).flatMap(event => event.keys || []);
    report.scenario.protocolListingKeys = listingKeys.length;
    check(listingKeys.length === profile.entries && listingKeys.every((key, index) => key === `listing/object-${String(index).padStart(6, '0')}.txt`), 'complete listing must retain every object exactly once in server order');
    const last = `object-${String(profile.entries - 1).padStart(6, '0')}.txt`;
    const scroller = page.locator('table:visible').last().locator('..');
    report.scenario.visibleAnchors = [];
    report.scenario.anchorSnapshots = [];
    const visibleObject = async name => {
      const item = browser.getByText(name, { exact: true });
      const attached = await item.waitFor({ state: 'attached', timeout: 1500 }).then(() => true, () => false);
      if (!attached) { report.scenario.anchorSnapshots.push({ name, attached }); return false; }
      await item.scrollIntoViewIfNeeded();
      const bounds = await item.boundingBox(), viewport = await scroller.boundingBox();
      const visible = !!(bounds && viewport && bounds.y + bounds.height > viewport.y && bounds.y < viewport.y + viewport.height && bounds.x + bounds.width > viewport.x && bounds.x < viewport.x + viewport.width);
      report.scenario.anchorSnapshots.push({ name, attached, bounds, viewport, visible });
      if (visible) report.scenario.visibleAnchors.push(name);
      return visible;
    };
    await scroller.evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
    await wait(100);
    check(await visibleObject(last), 'last fixture object must remain visibly reachable through complete pagination');
    const middle = `object-${String(Math.floor(profile.entries / 2)).padStart(6, '0')}.txt`;
    await scroller.evaluate(element => element.scrollTo({ top: (element.scrollHeight - element.clientHeight) / 2, behavior: 'instant' }));
    check(await visibleObject(middle), 'middle fixture object must remain visibly reachable');
    await scroller.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
    await firstCheckbox.waitFor();
    check(await firstCheckbox.isChecked(), 'page append must preserve selected keys');
    check(await visibleObject('object-000000.txt'), 'first fixture object must remain visibly reachable');
    report.scenario.pages = pages;
    report.scenario.renderedRows = await browser.locator('tbody tr').count();
    await page.screenshot({ path: path.join(directory, 's3-listing.png') });
    const box = await scroller.boundingBox();
    const scrollRegion = rect({ x: box.x + 54, y: box.y + 70, width: Math.min(500, box.width - 90), height: 80 });
    const snapshot = () => scroller.evaluate(element => {
      const viewport = element.getBoundingClientRect(), top = viewport.top + element.querySelector('thead').getBoundingClientRect().height;
      const row = [...element.querySelectorAll('tbody tr')].find(row => {
        const bounds = row.getBoundingClientRect();
        return /object-\d+\.txt/.test(row.textContent) && bounds.bottom > top + 1 && bounds.top < viewport.bottom;
      });
      const match = row?.textContent.match(/object-(\d+)\.txt/);
      return { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, index: match ? Number(match[1]) : -1 };
    });
    for (let sample = 0; sample < 30; sample++) {
      const before = await snapshot(), previous = before.scrollTop;
      report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `s3-scroll-${sample}`, kind: 'directory-scroll', region: scrollRegion, action: () => nativeWheel(app, scrollRegion.x + 30, scrollRegion.y + 20), outcome: () => page.waitForFunction(({ previous, x, y }) => { const element = document.elementFromPoint(x, y)?.closest('table')?.parentElement; return element?.scrollTop > previous; }, { previous, x: scrollRegion.x, y: scrollRegion.y }), finalOutcome: async () => { const after = await snapshot(); assert.ok(after.scrollTop > previous && after.scrollTop <= after.scrollHeight - after.clientHeight + 1); assert.ok(after.index > before.index && after.index < profile.entries); return { before, after }; } }));
      await wait(300);
    }
    await scroller.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
    const switchRegion = rect({ x: box.x + 50, y: box.y + 70, width: Math.min(500, box.width - 90), height: 150 });
    for (let sample = 0; sample < 30; sample++) {
      const settings = sample % 2 === 0;
      report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `s3-switch-${sample}`, kind: 'warm-tab-switch', region: switchRegion, action: () => nativeClick(app, browser.getByRole('button', { name: settings ? 'Settings' : 'Files', exact: true })), outcome: () => settings ? page.getByText('CORS Configuration', { exact: true }).waitFor() : page.getByText('object-000000.txt', { exact: true }).waitFor() }));
      await wait(300);
    }
    await fixture.client.send(new PutObjectCommand({ Bucket: fixture.buckets[0], Key: 'listing/00-fresh.txt', Body: 'fresh content\n' }));
    await browser.locator('button').filter({ has: page.locator('svg.lucide-refresh-cw') }).click();
    await page.getByText('00-fresh.txt', { exact: true }).waitFor();
    report.correctness.s3FreshRefresh = true;
    await layout.restoreRows();
    await page.locator('header button[title]').first().click();
    await page.getByRole('button', { name: 'Servers', exact: true }).click();
    await pane(page, 1).locator('span').filter({ hasText: /^Benchmark 1$/ }).click();
    await pane(page, 1).getByRole('button', { name: 'Files', exact: true }).click();
    await pane(page, 1).getByText('editor.txt', { exact: true }).dblclick();
    await page.locator('.cm-content').waitFor();
    await page.locator('.cm-content').focus(); await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home');
    const content = await page.locator('.cm-content').boundingBox(), editor = await page.locator('.cm-scroller').boundingBox();
    const typingRegion = rect({ x: content.x, y: editor.y + 5, width: Math.min(700, editor.x + editor.width - content.x - 20), height: 18 });
    const expectedDocument = text(profile.textBytes), originalFirstLine = expectedDocument.toString('ascii', 0, 127);
    let inserted = '';
    for (let sample = 0; sample < 30; sample++) {
      inserted += 'A';
      const firstLine = inserted + originalFirstLine;
      report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `s3-typing-${sample}`, kind: 'typing', region: typingRegion, action: () => nativeInput(app, textEvents('A')), outcome: () => page.waitForFunction(firstLine => document.querySelector('.cm-line')?.textContent === firstLine, firstLine) }));
      await wait(300);
    }
    await page.keyboard.press('Meta+s');
    await page.locator('.cm-content').waitFor({ state: 'detached' });
    assert.deepEqual(await sftpRead(ssh, '/editor.txt'), Buffer.concat([Buffer.from(inserted), expectedDocument]));
    report.correctness.s3ParallelEditorSave = true;
    await page.evaluate(() => {
      const tails = new Map(), events = [];
      const unsubscribe = window.electronAPI.localPty.onData(event => {
        const bytes = (tails.get(event.sessionId) || '') + event.data;
        let consumed = 0;
        for (const match of bytes.matchAll(/ECHO echo-\d+-\d+(?=\D)/g)) {
          events.push({ sessionId: event.sessionId, text: match[0], at: performance.now() });
          consumed = match.index + match[0].length;
        }
        tails.set(event.sessionId, bytes.slice(consumed).slice(-128));
      });
      window.__stopS3EchoEvents = () => { unsubscribe(); return events; };
    });
    for (let repetition = 0; repetition < schedule.repetitions; repetition++) await measureTerminalEcho(context, repetition);
    report.correctness.s3ParallelTerminalEcho = true;
    assert.deepEqual(report.scenario.failures, []);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    page.off('request', imageRequest);
    page.off('requestfailed', imageFailure);
    page.off('response', imageResponse);
    let cleanupError;
    try {
      for (const kind of ['directory-scroll', 'warm-tab-switch', 'typing']) report.summary[kind] = quantiles(report.samples.filter(sample => sample.kind === kind), kind === 'warm-tab-switch' ? profile.switchTargetMs : profile.inputTargetMs);
      report.summary['terminal-remote-echo'] = quantiles(report.samples.filter(sample => sample.kind === 'terminal-remote-echo'), Infinity);
      const renderer = await page.evaluate(() => ({ longTasks: globalThis.__perfLongTasks, terminalEchoEvents: window.__stopS3EchoEvents?.() ?? null }));
      report.longTasks = renderer.longTasks;
      report.scenario.terminalEchoEvents = renderer.terminalEchoEvents;
      if (renderer.terminalEchoEvents !== null) {
        report.scenario.terminalEchoScope = 'Real SSH command/output including transport; unbudgeted as in the shared baseline, not assigned the local input target';
        const terminalPane = pane(page, 3), count = await terminalPane.count();
        report.scenario.terminalViewport = count === 1 ? await terminalPane.evaluate(root => {
          const terminals = [...root.querySelectorAll('.xterm-rows')].filter(element => element.checkVisibility()), rows = terminals.flatMap(element => [...element.children]);
          return {
            at: performance.now(), visibleTerminals: terminals.length, focused: root.contains(document.activeElement),
            activeElement: { tag: document.activeElement?.tagName, className: document.activeElement?.className },
            cursorRow: rows.findIndex(row => row.querySelector('.xterm-cursor')),
            rows: rows.map(row => ({ text: row.textContent, rect: row.getBoundingClientRect().toJSON() })),
            scrollers: [...root.querySelectorAll('.xterm-viewport, .xterm-scrollable-element')].filter(element => element.checkVisibility()).map(element => ({ className: element.className, scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, rect: element.getBoundingClientRect().toJSON() })),
          };
        }) : { panesFound: count };
        if (count === 1) await terminalPane.screenshot({ path: path.join(directory, 'terminal-endpoint.png') });
      }
      if (!primaryError && report.correctness.s3ParallelTerminalEcho) assert.deepEqual(renderer.terminalEchoEvents.map(event => event.text), Array.from({ length: schedule.repetitions }, (_, repetition) => Array.from({ length: schedule.terminalEchoSamplesPerRepetition }, (_, sample) => `ECHO echo-${repetition}-${sample}`)).flat(), 'public renderer PTY transport must retain every actual echo in order');
      report.scenario.acquisition.observedModes = [...new Set(report.samples.map(sample => sample.captureStats.mode ?? `sequential-version-${sample.captureStats.version}`))];
      if (report.scenario.acquisition.captureAfterOutcome) for (const sample of report.samples) {
        assert.equal(sample.captureStats.mode, 'sequential-plus-outcome', `${sample.id}: wrong capture mode`);
        assert.equal(sample.captureStats.modeVersion, 1, `${sample.id}: wrong capture mode version`);
        assert.equal(sample.captureStats.outcomeReadbacks, 1, `${sample.id}: missing semantic outcome readback`);
        assert.ok(sample.captureStats.readbacks.some(readback => readback.source === 'semantic-outcome'), `${sample.id}: missing real outcome readback provenance`);
      }
    } catch (error) {
      report.scenario.rendererEvidenceError = error.message;
      cleanupError = error;
    }
    try {
      const boundaries = await app.evaluate((_electron, modulePath) => {
        delete process.mainModule.require(modulePath).transports.s3Benchmark;
        return global.__s3BenchmarkLog;
      }, require.resolve('electron-log'));
      const shift = report.runtime.timeOrigin - report.driverTimeOrigin;
      report.scenario.attribution = {
        boundaries,
        listings: boundaries.filter(event => event.name === 'S3: Listed objects').map(done => {
          const endAt = done.at + shift;
          const network = fixture.events.findLast(event => event.kind === 'listing' && event.path === `/${done.metadata.bucket}/` && event.prefix === done.metadata.prefix && event.at + event.durationMs <= endAt);
          return { bucket: done.metadata.bucket, prefix: done.metadata.prefix, networkMs: network?.durationMs, localResponseParsingAndMetadataUpperBoundMs: network ? endAt - network.at - network.durationMs : null };
        }),
        signing: boundaries.filter(event => event.name === 'S3: Presigned URL generated').map(done => {
          const start = boundaries.findLast(event => event.name === 'S3: Generating presigned URL' && event.at <= done.at && event.metadata.key === done.metadata.key && event.metadata.bucket === done.metadata.bucket);
          return { bucket: done.metadata.bucket, key: done.metadata.key, localSigningMs: start ? done.at - start.at : null };
        }),
        method: 'Existing synchronous application log boundaries; real forwarding-proxy response timing; separate existing handler IPC totals and native compositor samples. No application behavior or protocol response is replaced.',
        firstListingPaint: (() => {
          const sample = report.samples.find(sample => sample.id === 's3-first-listing');
          const metadata = sample && boundaries.find(event => event.name === 'S3: Listed objects' && event.metadata.prefix === 'listing/' && event.at >= sample.inputAt);
          return sample && metadata ? { inputToVerifiedCaptureMs: sample.durationMs, metadataReadyToVerifiedCaptureUpperBoundMs: sample.presentedCaptureAt - metadata.at, includes: 'IPC delivery, rendering, compositor scheduling and capture readback; not isolated render CPU or physical display time' } : null;
        })(),
        limitations: 'Local response parsing/metadata is an upper bound from final proxy byte to application metadata-ready log: includes loopback forwarding, SDK parsing and log overhead. Signing is local URL construction, NOT an object download. UI-ready phases are not paint; paint is retained separately in samples.',
      };
    } catch (error) {
      report.scenario.attributionError = error.message;
      cleanupError = error;
    }
    try {
      fs.writeFileSync(path.join(directory, 's3-requests.json'), JSON.stringify(fixture.events, null, 2));
      report.scenario.serviceResources?.push({ phase: 'finished', at: performance.now(), ...fixture.stats() });
    } catch (error) {
      report.scenario.resourceEvidenceError = error.message;
      cleanupError ??= error;
    }
    try { await fixture.close(); }
    catch (error) {
      report.scenario.fixtureCleanupError = error.message;
      cleanupError ??= error;
    }
    if (!primaryError && cleanupError) throw cleanupError;
  }
}
(async () => {
  const args = process.argv.slice(2), index = args.indexOf('--profile');
  for (const profile of (index < 0 || args[index + 1] === 'all') ? ['everyday', 'stress'] : [args[index + 1]]) await runProfile(profile, scenario);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
