'use strict';
// Public Electron workflow only. Every clipboard value in this scene is synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeInput, textEvents, nativeClick, measureMixedFrame } = require('./mixed-ui.cjs');
const { quantiles, schedule } = require('./workloads.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(name) {
  // Keep Create and Update inside the existing 1,000-variable IPC bound.
  const count = 990;
  const expected = [
    { key: 'EDIT_TARGET', value: 'synthetic' },
    { key: 'QUOTED', value: 'synthetic spaces # retained' },
    { key: 'MULTILINE', value: 'synthetic first\n# retained inside value\nsynthetic last' },
    { key: 'SINGLE_QUOTED', value: "'synthetic literal'" },
    { key: 'EMPTY', value: '' },
  ];
  const lines = ['EDIT_TARGET=synthetic', '# Synthetic ENV benchmark; no secrets', '',
    'QUOTED="synthetic spaces # retained"', 'MULTILINE="synthetic first', '# retained inside value',
    'synthetic last"', "SINGLE_QUOTED='synthetic literal'", 'EMPTY='];
  for (let i = 0; i < count; i++) {
    const key = `SYNTHETIC_${String(i).padStart(6, '0')}`;
    const value = `value_${String(i).padStart(6, '0')}_` + 'x'.repeat(name === 'stress' ? 10540 : 1020);
    expected.push({ key, value }); lines.push(`${key}=${value}`);
    if (i % 64 === 0) lines.push('', `# synthetic section ${i / 64}`);
  }
  return { content: lines.join('\n'), expected };
}
async function keys(app, keyCode, modifiers = []) {
  return nativeInput(app, [{ type: 'keyDown', keyCode, modifiers }, { type: 'keyUp', keyCode, modifiers }]);
}
async function paste(app, content) {
  return app.evaluate(({ clipboard, BrowserWindow }, content) => {
    clipboard.writeText(content);
    BrowserWindow.getAllWindows()[0].webContents.paste();
  }, content);
}
async function copy(app, page) {
  await page.locator('.cm-content:visible').focus();
  await keys(app, 'A', ['meta']);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.copy());
  await wait(100);
  return app.evaluate(({ clipboard }) => clipboard.readText());
}
async function scene(context) {
  const { app, page, profile, report, directory } = context;
  await runMixed({ ...context, interactive: true });
  const data = fixture(report.profile);
  const cpuProfile = process.argv.includes('--cpu-profile');
  report.scenario = { ticket: 7, name: 'real-vault-bulk-env', bytes: Buffer.byteLength(data.content), variables: data.expected.length, syntheticOnly: true };
  report.scenario.cpuProfiler = { enabled: cpuProfile, samplingIntervalUs: cpuProfile ? 1000 : null, purpose: cpuProfile ? 'diagnostic-attribution' : 'ordinary-acceptance' };
  await page.getByRole('button', { name: /Security/ }).click();
  await page.getByRole('button', { name: 'Vault', exact: true }).click();
  await page.getByRole('button', { name: 'Environments', exact: true }).click();
  await page.getByRole('button', { name: 'Add Environment', exact: true }).click();
  await page.getByPlaceholder('Frontend Production', { exact: true }).fill('Synthetic ENV performance');
  await page.getByPlaceholder('Frontend', { exact: true }).fill('Synthetic benchmark');
  await page.getByRole('button', { name: 'Bulk Editor', exact: true }).click();
  const editor = page.locator('.cm-content:visible');
  await editor.focus(); await keys(app, 'A', ['meta']);
  const pasteStarted = performance.now();
  await paste(app, data.content);
  await page.getByText(`${data.expected.length} variables parsed`, { exact: true }).waitFor();
  report.loads.push({ kind: 'env-paste-to-validation', durationMs: performance.now() - pasteStarted, bytes: Buffer.byteLength(data.content) });
  await page.getByPlaceholder('Frontend', { exact: true }).fill('Synthetic changed project');
  await editor.focus();
  await keys(app, 'Up', ['meta']); await keys(app, 'End');
  report.scenario.editorViewport = await page.locator('.cm-scroller:visible').boundingBox();
  await page.screenshot({ path: path.join(directory, 'env-before-typing.png') });
  // Capture event handling, validation delivery and renderer CPU without treating any
  // of these as paint. The shared compositor matcher remains the primary metric.
  await page.evaluate(() => {
    globalThis.__envInputs = [];
    globalThis.__envUIEvents = [];
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') globalThis.__envUIEvents.push({ kind: 'escape', at: performance.now(), trusted: event.isTrusted });
    }, true);
    document.addEventListener('pointerdown', event => {
      globalThis.__envUIEvents.push({ kind: 'pointerdown', at: performance.now(), trusted: event.isTrusted, target: event.target.tagName, x: event.clientX, y: event.clientY });
    }, true);
    document.addEventListener('submit', event => {
      globalThis.__envUIEvents.push({ kind: 'submit', at: performance.now(), trusted: event.isTrusted });
    }, true);
    document.addEventListener('input', event => {
      if (!event.target.closest('.cm-content')) return;
      const sample = { inputAt: performance.now(), eventTimestamp: event.timeStamp, trusted: event.isTrusted };
      globalThis.__envInputs.push(sample);
      queueMicrotask(() => { sample.handlersCompleteAt = performance.now(); });
    }, true);
  });
  const cdp = cpuProfile ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
  }
  let suffix = '';
  let diagnosticsComplete = false;
  try {
    for (let repetition = 0; repetition < schedule.repetitions; repetition++) {
      for (let sample = 0; sample < schedule.samplesPerAction; sample++) {
        const char = String.fromCharCode(97 + sample % 26); suffix += char;
        // Anchor to the viewport, not the horizontally translated document.
        // Long supported values make the content box far wider than the modal.
        const viewport = await page.locator('.cm-scroller:visible').boundingBox();
        const gutter = await page.locator('.cm-gutters:visible').boundingBox();
        const line = await editor.locator('.cm-line').first().boundingBox();
        // Exclude the native scrollbar: retained RGBA diagnostics showed glyphs
        // already matched while only its right-edge fade changed later.
        const rightChromeInset = 12;
        const region = {
          x: Math.ceil(viewport.x + gutter.width + 2),
          y: Math.ceil(Math.max(viewport.y, line.y)),
          width: Math.floor(viewport.width - gutter.width - rightChromeInset - 2),
          height: Math.floor(line.height),
        };
        const expectedFirstLine = `EDIT_TARGET=synthetic${suffix}`;
        report.samples.push(await measureMixedFrame(context, {
          app, page, directory, id: `env-r${repetition}-typing-${sample}`, kind: 'env-typing', region,
          persistFrames: repetition === 0 && sample === 0,
          action: () => nativeInput(app, textEvents(char)),
          outcome: () => page.waitForFunction(expected => [...document.querySelectorAll('.cm-content .cm-line')].some(line => line.getBoundingClientRect().height > 0 && line.textContent === expected), expectedFirstLine),
          finalOutcome: async () => {
            assert.ok(await editor.isVisible(), 'ENV modal must remain open through the complete measured interval');
            assert.equal(await editor.locator('.cm-line').first().textContent(), expectedFirstLine, 'the final captured scene must still expose the changed document');
            return { visibleDocumentMatches: true };
          },
        }));
        await wait(schedule.actionIntervalMs);
      }
    }
  } finally {
    report.summary['env-typing'] = quantiles(report.samples.filter(sample => sample.kind === 'env-typing'), profile.inputTargetMs);
    const stopped = cdp ? await cdp.send('Profiler.stop').catch(error => {
      report.envProfilerError = error.message;
      return null;
    }) : null;
    if (stopped) fs.writeFileSync(path.join(directory, 'env-renderer.cpuprofile'), JSON.stringify(stopped.profile));
    const observed = await page.evaluate(() => ({ inputs: globalThis.__envInputs, ui: globalThis.__envUIEvents })).catch(error => {
      report.envObservationError = error.message;
      return null;
    });
    report.envInputProcessing = observed?.inputs ?? [];
    report.envUIEvents = observed?.ui ?? [];
    diagnosticsComplete = Boolean(observed && (!cpuProfile || stopped));
    if (cdp) await cdp.detach().catch(error => { report.envProfilerDetachError = error.message; });
  }
  assert.ok(diagnosticsComplete, 'the requested input/profiler observations must be available');
  assert.equal(report.envUIEvents.length, 0, 'unexpected Escape/pointer/submit input invalidates the isolated typing phase');
  data.expected[0].value += suffix;
  report.correctness.envMetadataPreserved = await page.getByPlaceholder('Frontend', { exact: true }).inputValue() === 'Synthetic changed project';
  // A native undo/redo must preserve the text and not recreate the editor history.
  const edited = await copy(app, page);
  await keys(app, 'Z', ['meta']);
  const undone = await copy(app, page); assert.notEqual(undone, edited, 'undo changes the document');
  await keys(app, 'Z', ['meta', 'shift']);
  assert.equal(await copy(app, page), edited, 'redo restores exact ENV content');
  report.correctness.envUndoRedo = true;
  await nativeClick(app, page.getByRole('button', { name: 'Bulk Editor', exact: true }));
  report.correctness.envActiveTabPreserves = await copy(app, page) === edited;
  // Restore the identical fixture through the public editor action in BOTH builds,
  // so a known before-build failure does not change subsequent workflow inputs.
  await editor.focus(); await keys(app, 'A', ['meta']); await paste(app, edited);
  // A rapid invalid -> valid transition followed immediately by commit catches
  // deferred parsers accidentally persisting an older snapshot.
  await keys(app, 'A', ['meta']);
  await paste(app, edited + '\nINVALID INTERMEDIATE');
  const invalidVisible = await page.getByText(/Error parsing variables/).waitFor({ timeout: 1000 }).then(() => true, () => false);
  await editor.focus(); await keys(app, 'A', ['meta']);
  await paste(app, 'INVALID INTERMEDIATE\nUNFINISHED="synthetic');
  await nativeClick(app, page.getByRole('button', { name: 'Create', exact: true }));
  await page.getByText('0 variables parsed', { exact: true }).waitFor();
  const invalidBlocked = await page.getByRole('button', { name: 'Create', exact: true }).isVisible();
  const schemaVisible = await page.getByText('At least one variable is required', { exact: true }).isVisible();
  report.correctness.envInvalidIntermediate = { invalidVisible, invalidBlocked, schemaVisible, existingGrammar: 'malformed lines skipped; unfinished multiline omitted' };
  assert.ok(invalidBlocked, 'an intermediate with no complete variables must not commit');
  await editor.focus(); await keys(app, 'A', ['meta']);
  const latest = edited + '\nLATEST_BOUNDARY=synthetic_newest';
  await paste(app, latest);
  await nativeClick(app, page.getByRole('button', { name: 'Create', exact: true }));
  await page.getByRole('button', { name: 'Create', exact: true }).waitFor({ state: 'detached' });
  // Malformed-line grammar stays permissive. The existing no-variable schema
  // validation must remain visible when there are no complete variables to save.
  data.expected.push({ key: 'LATEST_BOUNDARY', value: 'synthetic_newest' });
  const row = page.getByRole('row').filter({ hasText: 'Synthetic ENV performance' });
  await row.getByRole('button').last().click();
  await page.getByText('Edit Environment', { exact: true }).click();
  await page.getByRole('button', { name: 'Bulk Editor', exact: true }).click();
  await editor.waitFor();
  const committed = await copy(app, page);
  // Independent expected serialization reflects supported quoting, not the parser
  // under test. Full equality checks order, every key/value, and no truncation.
  const expected = data.expected.map(({ key, value }) => `${key}=${/[ \n#]/.test(value) ? `"${value}"` : value}`).join('\n');
  report.correctness.envCommitted = {
    exactKeysValuesAndOrder: hash(committed) === hash(expected),
    expectedVariables: data.expected.length,
    emptyValueRetained: committed.split('\n').includes('EMPTY='),
    contentSha256: hash(committed),
    expectedContentSha256: hash(expected),
    newestBoundaryRetained: committed.endsWith('LATEST_BOUNDARY=synthetic_newest'),
  };
  await page.screenshot({ path: path.join(directory, 'env-reopened-committed.png') });
  await editor.focus(); await keys(app, 'A', ['meta']);
  const updateContent = expected + '\nUPDATE_BOUNDARY=synthetic_updated';
  await paste(app, updateContent);
  await nativeClick(app, page.getByRole('button', { name: 'Update', exact: true }));
  await page.getByRole('button', { name: 'Update', exact: true }).waitFor({ state: 'detached' });
  await row.getByRole('button').last().click();
  await page.getByText('Edit Environment', { exact: true }).click();
  await page.getByRole('button', { name: 'Bulk Editor', exact: true }).click();
  const updated = await copy(app, page);
  report.correctness.envUpdated = {
    exactKeysValuesAndOrder: hash(updated) === hash(updateContent),
    contentSha256: hash(updated),
    expectedContentSha256: hash(updateContent),
    newestBoundaryRetained: updated.endsWith('UPDATE_BOUNDARY=synthetic_updated'),
  };
  await editor.focus(); await keys(app, 'A', ['meta']);
  const modeContent = updateContent + '\nMODE_BOUNDARY=synthetic_mode';
  await paste(app, modeContent);
  await nativeClick(app, page.getByRole('button', { name: 'Simple Mode', exact: true }));
  const newestKey = page.locator('input[value="MODE_BOUNDARY"]');
  await newestKey.waitFor({ state: 'attached' });
  await newestKey.scrollIntoViewIfNeeded();
  assert.equal(await newestKey.locator('..').locator('input').nth(1).inputValue(), 'synthetic_mode');
  const bulkTab = page.getByRole('button', { name: 'Bulk Editor', exact: true });
  await bulkTab.scrollIntoViewIfNeeded(); await nativeClick(app, bulkTab);
  assert.equal(hash(await copy(app, page)), hash(modeContent), 'mode switches read the newest complete document');
  report.correctness.envModeSwitchNewest = true;
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await app.evaluate(({ clipboard }) => clipboard.clear());
  await nativeClick(app, page.locator('header button').filter({ has: page.locator('svg.lucide-lock') }));
  await page.getByText('Enter your master password to unlock', { exact: true }).waitFor();
  assert.equal(await editor.count(), 0, 'locked Vault must not expose the ENV editor');
  report.correctness.envLockedUi = true;
  await page.screenshot({ path: path.join(directory, 'env-locked.png') });
  // Retain every before/after workflow observation before failing acceptance.
  // Pixel-match, input-integrity and protocol errors still fail immediately.
  assert.ok(report.correctness.envActiveTabPreserves, 'clicking the active bulk tab must not replace unsaved text');
  assert.ok(report.correctness.envCommitted.exactKeysValuesAndOrder, 'decrypt/reopen must expose every exact newest key and value in order');
  assert.ok(report.correctness.envUpdated.exactKeysValuesAndOrder, 'immediate Update must commit the newest complete text');
  assert.ok(schemaVisible, 'existing no-variable validation must be understandable and visible');
  assert.ok(report.correctness.envMetadataPreserved, 'bulk typing must not overwrite newer form fields');
  assert.ok(report.summary['env-typing'].p95 <= profile.inputTargetMs, `ENV typing p95 exceeds ${profile.inputTargetMs}ms`);
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const name = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'everyday';
  runProfile(name, async context => {
    try {
      await scene(context);
    } catch (error) {
      await context.page.screenshot({ path: path.join(context.directory, 'env-failure.png') }).catch(() => {});
      throw error;
    }
  }).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { scene };
