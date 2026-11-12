'use strict';
// Public regression seam: native Electron editing, visible pixels and complete SFTP rereads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Client } = require('ssh2');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeInput, textEvents, sftpRead, measureMixedFrame } = require('./mixed-ui.cjs');
const { text, quantiles, schedule } = require('./workloads.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const saveButton = page => page.getByRole('button', { name: 'Save', exact: true });
async function dirty(page, expected) {
  await page.waitForFunction(expected => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Save' && button.disabled === !expected), expected);
  assert.equal(await saveButton(page).isEnabled(), expected, 'visible Save state must match exact document modification state');
}
function pane(page) {
  return page.locator('span').filter({ hasText: /^Benchmark 1$/ }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) });
}
async function key(app, keyCode, modifiers = []) {
  return nativeInput(app, [{ type: 'keyDown', keyCode, modifiers }, { type: 'keyUp', keyCode, modifiers }]);
}
async function paste(app, value) {
  await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), value);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.paste());
}
async function firstLine(page, expected) {
  await page.waitForFunction(expected => document.querySelector('.cm-line')?.textContent === expected, expected);
}
async function top(app, page) {
  await page.locator('.cm-content').focus();
  await key(app, 'Up', ['meta']);
  await key(app, 'Home');
}
async function open(context, name, repetition) {
  const { app, page, ssh, report, directory } = context;
  await pane(page).locator('span').filter({ hasText: /^Benchmark 1$/ }).click();
  await pane(page).getByRole('button', { name: 'Files', exact: true }).click();
  const eventStart = ssh.events.length;
  const started = performance.now();
  await pane(page).getByText(name, { exact: true }).dblclick();
  await page.locator('.cm-content').waitFor();
  await page.locator('.cm-line').first().waitFor();
  const ready = performance.now();
  const captureStart = performance.now();
  await page.screenshot({ path: path.join(directory, `${name}-open-${repetition}.png`) });
  const protocol = ssh.events.slice(eventStart).filter(event => event.path === '/' + name);
  report.loads.push({ kind: repetition ? 'warm-editor-open' : 'cold-editor-open', name, repetition,
    durationMs: ready - started, endpoint: 'editable DOM ready; screenshot endpoint separately reported',
    screenshotReadyMs: performance.now() - started, screenshotCaptureMs: performance.now() - captureStart,
    protocol, protocolSpanMs: protocol.length > 1 ? protocol.at(-1).at - protocol[0].at : null });
  await top(app, page);
}
async function save(context, expected, name = 'editor.txt') {
  const { app, page, ssh, report } = context;
  await key(app, 'S', ['meta']);
  const outcome = await page.waitForFunction(() => {
    if (!document.querySelector('.cm-content')) return 'saved';
    return [...document.querySelectorAll('[role="status"], [role="alert"]')]
      .map(element => element.textContent.trim()).find(text => text.startsWith('Save failed:')) || false;
  });
  const result = await outcome.jsonValue();
  await outcome.dispose();
  if (result !== 'saved') throw new Error(result);
  const actual = await sftpRead(ssh, '/' + name);
  assert.deepEqual(actual, Buffer.from(expected), 'complete saved remote file must exactly equal the native edits');
  report.correctness.remoteRereads.push({ name, bytes: actual.length, sha256: hash(actual), completeByteEquality: true });
}
async function put(ssh, remotePath, bytes) {
  const client = new Client();
  try {
    await new Promise((resolve, reject) => client.once('ready', resolve).once('error', reject).connect({ host: '127.0.0.1', port: ssh.port, username: 'benchmark', password: ssh.password }));
    const sftp = await new Promise((resolve, reject) => client.sftp((error, sftp) => error ? reject(error) : resolve(sftp)));
    await new Promise((resolve, reject) => sftp.writeFile(remotePath, bytes, error => error ? reject(error) : resolve()));
  } finally { client.end(); }
}
async function standaloneUnicode(context) {
  const { app, page, ssh, report } = context;
  const original = '// café λ\nconst value = 7;\n';
  await put(ssh, '/syntax.js', Buffer.from(original));
  await page.getByRole('button', { name: 'File Transfer', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).last().click();
  await page.locator('table:visible').last().getByText('syntax.js', { exact: true }).dblclick();
  await page.locator('.cm-content').waitFor();
  await firstLine(page, '// café λ');
  await top(app, page);
  await paste(app, '// edited\n');
  await firstLine(page, '// edited');
  await save(context, '// edited\n' + original, 'syntax.js');
  report.correctness.standaloneUnicodeReadEditSave = true;
  await latin1Roundtrip(context, true);
}
async function latin1Roundtrip(context, standalone = false) {
  const { app, page, ssh, report } = context;
  await put(ssh, '/editor.txt', Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
  if (standalone) {
    await page.getByRole('button', { name: 'Refresh', exact: true }).last().click();
    await page.locator('table:visible').last().getByText('editor.txt', { exact: true }).dblclick();
    await page.locator('.cm-content').waitFor();
    await top(app, page);
  } else {
    await open(context, 'editor.txt', 'latin1');
  }
  await firstLine(page, 'café');
  await page.getByText('ISO-8859-1', { exact: true }).waitFor();
  await nativeInput(app, textEvents('X'));
  await save(context, Buffer.from([0x58, 0x63, 0x61, 0x66, 0xe9, 0x0a]));
  report.correctness[standalone ? 'standaloneLatin1BytePreservation' : 'latin1BytePreservation'] = true;
}
async function appearanceAndLanguage(context) {
  const { app, page, ssh, report } = context;
  await page.getByRole('banner').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Fonts', exact: true }).click();
  await page.getByRole('textbox', { name: 'Custom editor font', exact: true }).fill('Menlo, monospace');
  await page.getByRole('spinbutton').first().fill('16');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
  await page.getByRole('button', { name: 'Servers', exact: true }).click();
  await pane(page).locator('span').filter({ hasText: /^Benchmark 1$/ }).click();
  await pane(page).getByRole('button', { name: 'Files', exact: true }).click();
  await put(ssh, '/syntax.js', Buffer.from('const answer = 42;\n'));
  await pane(page).getByRole('button', { name: 'Refresh', exact: true }).last().click();
  await open(context, 'syntax.js', 0);
  const appearance = await page.locator('.cm-editor').evaluate(element => ({
    fontSize: getComputedStyle(element).fontSize,
    fontFamily: getComputedStyle(element.querySelector('.cm-scroller')).fontFamily,
    background: getComputedStyle(element).backgroundColor,
    theme: document.documentElement.getAttribute('data-theme'),
    hasColoredTokens: [...element.querySelectorAll('.cm-line span')].some(token => getComputedStyle(token).color !== getComputedStyle(element.querySelector('.cm-content')).color),
  }));
  assert.equal(appearance.fontSize, '16px');
  assert.match(appearance.fontFamily, /Menlo/);
  assert.ok(appearance.hasColoredTokens, 'JavaScript syntax highlighting remains enabled');
  await key(app, 'A', ['meta']);
  await paste(app, 'const answer = ');
  await nativeInput(app, textEvents('('));
  await firstLine(page, 'const answer = ()');
  await nativeInput(app, textEvents('42'));
  await key(app, 'Right');
  await nativeInput(app, textEvents(';'));
  const confirmation = page.waitForEvent('dialog');
  await key(app, 'Escape');
  const dialog = await confirmation;
  assert.equal(dialog.type(), 'confirm');
  await dialog.dismiss();
  await firstLine(page, 'const answer = (42);');
  report.correctness.cancelCloseRetainsDraft = true;
  await save(context, 'const answer = (42);', 'syntax.js');
  report.correctness.appearanceAndLanguage = { ...appearance, bracketCompletion: true, exactReread: true };
}
async function editorScenario(context) {
  const { app, page, ssh, profile, report, directory } = context;
  report.scenario = 'ticket-02-remote-editor';
  report.correctness.remoteRereads = [];
  report.scenarioScriptSha256 = hash(fs.readFileSync(__filename));
  report.fixtureText = { bytes: profile.textBytes, sha256: hash(text(profile.textBytes)) };
  const diagnosticProfiling = process.argv.includes('--diagnostic-profile');
  report.profiling = {
    enabled: diagnosticProfiling,
    intervalUs: diagnosticProfiling ? 1000 : null,
    artifact: diagnosticProfiling ? 'editor.cpuprofile' : null,
    purpose: diagnosticProfiling ? 'attribution only' : 'quiet acceptance',
  };
  await runMixed({ ...context, interactive: true });
  let cdp;
  if (diagnosticProfiling) {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
  }
  let expected = text(profile.textBytes).toString();
  try {
    for (let repetition = 0; repetition < schedule.repetitions; repetition++) {
      await open(context, 'editor.txt', repetition);
      await dirty(page, false);
      const content = await page.locator('.cm-content').boundingBox();
      const scroller = await page.locator('.cm-scroller').boundingBox();
      const region = { x: Math.ceil(content.x), y: Math.ceil(scroller.y + 5), width: Math.floor(Math.min(880, scroller.x + scroller.width - content.x - 20)), height: 18 };
      let inserted = '';
      for (let sample = 0; sample < schedule.samplesPerAction; sample++) {
        const char = String.fromCharCode(65 + sample % 26);
        inserted += char;
        const line = inserted + expected.slice(0, expected.indexOf('\n'));
        report.samples.push(await measureMixedFrame(context, { app, page, directory, id: `r${repetition}-typing-${sample}`, kind: 'typing', region,
          persistFrames: repetition === 0 && sample === 0,
          action: () => nativeInput(app, textEvents(char)), outcome: () => firstLine(page, line) }));
        if (repetition === 0 && sample === 0) console.log(`EDITOR_RAW_FRAMES ${path.join(directory, 'r0-typing-0-diagnostic.json')}`);
        await wait(schedule.actionIntervalMs);
      }
      expected = inserted + expected;
      await dirty(page, true);
      // Save immediately after the final event, without a debounce wait or document-state side channel.
      await nativeInput(app, textEvents('Q'));
      expected = expected.slice(0, 30) + 'Q' + expected.slice(30);
      await save(context, expected);
    }
  } finally {
    if (cdp) {
      const { profile: cpu } = await cdp.send('Profiler.stop');
      fs.writeFileSync(path.join(directory, 'editor.cpuprofile'), JSON.stringify(cpu));
      await cdp.detach();
    }
    report.summary.typing = quantiles(report.samples.filter(s => s.kind === 'typing'), profile.inputTargetMs);
  }
  report.correctness.immediateSave = true;
  report.targetMet = report.summary.typing.p95 <= profile.inputTargetMs;
  if (process.argv.includes('--typing-only')) {
    report.scenario = 'ticket-02-editor-typing-target';
    assert.ok(report.targetMet, `Typing p95 ${report.summary.typing.p95} ms exceeds unchanged ${profile.inputTargetMs} ms target`);
    return;
  }

  // Multiline Unicode paste and undo/redo must restore exact dirty/clean state.
  await open(context, 'editor.txt', 3);
  await key(app, 'Right', ['shift']);
  await nativeInput(app, textEvents('!'));
  await dirty(page, true);
  await key(app, 'Left');
  await key(app, 'Right', ['shift']);
  await nativeInput(app, textEvents(expected[0]));
  await firstLine(page, expected.slice(0, expected.indexOf('\n')));
  await dirty(page, false);
  await top(app, page);
  report.correctness.sameLengthRestoration = true;
  const prefix = 'paste café λ\nsecond line\n';
  await paste(app, prefix);
  await firstLine(page, 'paste café λ');
  await dirty(page, true);
  await key(app, 'Z', ['meta']);
  await firstLine(page, expected.slice(0, expected.indexOf('\n')));
  await dirty(page, false);
  await key(app, 'Z', ['meta', 'shift']);
  await firstLine(page, 'paste café λ');
  await save(context, prefix + expected);
  report.correctness.pasteUndoRedo = true;
  await open(context, 'editor.txt', 'unicode-reread');
  await firstLine(page, 'paste café λ');
  await key(app, 'Escape');
  await page.locator('.cm-content').waitFor({ state: 'detached' });
  report.correctness.unicodeReadEditSave = true;
  await latin1Roundtrip(context);

  // A single long line, retaining the profile byte size and existing file limit.
  const longLine = 'L'.repeat(profile.textBytes - 1) + '\n';
  await put(ssh, '/editor.txt', Buffer.from(longLine));
  await open(context, 'editor.txt', 4);
  await nativeInput(app, textEvents('X'));
  await dirty(page, true);
  await key(app, 'Z', ['meta']);
  await dirty(page, false);
  await key(app, 'Z', ['meta', 'shift']);
  await save(context, 'X' + longLine);
  report.correctness.longLineUndoRedo = { bytes: profile.textBytes, exactReread: true };

  // Denial is a real SFTP error before truncation, not a mocked renderer failure.
  assert.equal(typeof ssh.setWriteDenied, 'function', 'fixture must provide real protocol permission denial');
  await open(context, 'editor.txt', 5);
  await nativeInput(app, textEvents('E'));
  ssh.setWriteDenied('/editor.txt', true);
  await key(app, 'S', ['meta']);
  await page.getByText(/Save failed:/).waitFor();
  assert.equal(await page.locator('.cm-content').count(), 1, 'save failure must retain the draft');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Save' && !b.disabled));
  assert.deepEqual(await sftpRead(ssh, '/editor.txt'), Buffer.from('X' + longLine), 'denied save cannot truncate the remote file');
  await page.getByText(/^Save failed:/).waitFor({ state: 'hidden' });
  ssh.setWriteDenied('/editor.txt', false);
  await save(context, 'EX' + longLine);
  report.correctness.saveErrorRetainsDraft = true;

  await appearanceAndLanguage(context);
  await standaloneUnicode(context);
  report.diagnostics = { cpuProfile: diagnosticProfiling ? 'editor.cpuprofile' : null, scope: 'three complete mixed-load open/type/immediate-save/reread loops; optional diagnostic profiling includes idle and compositor matching work',
    stages: 'SFTP protocol spans, actual IPC transport timings in report.ipc, sampled local assembly/encoding/React/GC stacks, editor DOM readiness and screenshot completion are distinct evidence; protocol and IPC clocks are not subtracted across origins' };
}
async function scenario(context) {
  let deadline;
  try {
    await Promise.race([
      editorScenario(context),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Remote editor scenario exceeded its six-minute action deadline')), 360000); }),
    ]);
  } finally {
    clearTimeout(deadline);
    const observations = await context.page.evaluate(() => ({
      longTasks: globalThis.__perfLongTasks ?? [],
      eventTiming: globalThis.__perfEvents ?? [],
    }));
    Object.assign(context.report, observations);
  }
}
async function unicodeScenario(context) {
  const { app, page, profile, report } = context;
  report.scenario = 'ticket-02-unicode-save';
  report.scenarioScriptSha256 = hash(fs.readFileSync(__filename));
  report.correctness.remoteRereads = [];
  report.profiling = { enabled: false, intervalUs: null, artifact: null, purpose: 'quiet correctness' };
  await runMixed({ ...context, interactive: true });
  await open(context, 'editor.txt', 0);
  const prefix = 'paste café λ\nsecond line\n';
  await paste(app, prefix);
  await firstLine(page, 'paste café λ');
  await save(context, prefix + text(profile.textBytes).toString());
  await open(context, 'editor.txt', 'unicode-reread');
  await firstLine(page, 'paste café λ');
  await key(app, 'Escape');
  await page.locator('.cm-content').waitFor({ state: 'detached' });
  report.correctness.unicodeReadEditSave = true;
  await latin1Roundtrip(context);
  await standaloneUnicode(context);
}
async function appearanceScenario(context) {
  context.report.scenario = 'ticket-02-appearance-language';
  context.report.scenarioScriptSha256 = hash(fs.readFileSync(__filename));
  context.report.correctness.remoteRereads = [];
  context.report.profiling = { enabled: false, intervalUs: null, artifact: null, purpose: 'quiet correctness' };
  await runMixed({ ...context, interactive: true });
  await appearanceAndLanguage(context);
  await standaloneUnicode(context);
}
if (require.main === module) {
  const nameIndex = process.argv.indexOf('--profile');
  const name = nameIndex < 0 ? 'all' : process.argv[nameIndex + 1];
  const selectedScenario = process.argv.includes('--unicode-only') ? unicodeScenario : process.argv.includes('--appearance-only') ? appearanceScenario : scenario;
  (async () => {
    for (const profile of name === 'all' ? ['everyday', 'stress'] : [name]) {
      try { await runProfile(profile, selectedScenario); }
      catch (error) { console.error(error.stack); process.exitCode = 1; }
    }
  })().catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { scenario, unicodeScenario, appearanceScenario };
