'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runProfile } = require('./run.cjs');
const { runMixed, nativeClick, nativeInput } = require('./mixed-ui.cjs');
const { startDockerFixture } = require('./docker-fixture.cjs');
const { expandPane } = require('./ticket-12-workspace-ui.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pane = (page, index) => page.locator('span').filter({ hasText: new RegExp(`^Benchmark ${index}$`) }).locator('xpath=../../..').filter({ has: page.getByRole('button', { name: 'Terminal', exact: true }) });
async function scenario(context) {
  const { app, page, ssh, root, directory, report } = context;
  const fixture = await startDockerFixture(root);
  let pendingShellGate;
  report.scenario = { issue: 11, name: 'docker-lifecycle', resources: [], hidden: [] };
  const snapshot = name => {
    const state = { name, at: performance.now(), ...ssh.resources() };
    report.scenario.resources.push(state);
    return state;
  };
  const hideWorkspace = async kind => {
    await nativeClick(app, page.getByTitle('Settings', { exact: true }));
    await page.getByRole('button', { name: 'Close Settings', exact: true }).waitFor();
    const before = await page.evaluate(kind => globalThis.__dockerLifecycle[kind].bytes, kind);
    await wait(2200);
    const after = await page.evaluate(kind => globalThis.__dockerLifecycle[kind].bytes, kind);
    report.scenario.hidden.push({ kind, receivedBytes: after - before, at: performance.now() });
    assert.ok(after - before > 10000, `whole-workspace hiding must not terminate the real ${kind} task`);
    await nativeClick(app, page.getByRole('button', { name: 'Close Settings', exact: true }));
  };
  try {
    await runMixed({ ...context, interactive: true });
    fixture.enable(ssh);
    await page.locator('header button[title]').first().click(); await wait(250);
    const docker = pane(page, 3);
    const before = snapshot('before-docker');
    await docker.getByRole('button', { name: 'Docker', exact: true }).click();
    report.scenario.layout = await expandPane(context, docker);
    await docker.getByText(fixture.name, { exact: true }).click();
    await docker.getByRole('button', { name: 'Logs', exact: true }).click();
    await page.evaluate(() => {
      globalThis.__dockerLifecycle = { logs: { bytes: 0, text: '' }, console: { bytes: 0, text: '' } };
      globalThis.__stopLifecycleLogs = window.electronAPI.docker.onLogsStreamData(event => {
        const state = globalThis.__dockerLifecycle.logs;
        state.bytes += event.data.length; state.text = (state.text + event.data).slice(-65536);
      });
      globalThis.__stopLifecycleConsole = window.electronAPI.docker.onExecData(event => {
        const data = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const state = globalThis.__dockerLifecycle.console;
        state.bytes += data.length; state.text = (state.text + data).slice(-65536);
      });
    });
    await docker.getByRole('button', { name: 'Live', exact: true }).click();
    await page.waitForFunction(() => globalThis.__dockerLifecycle.logs.bytes > 100000);
    snapshot('log-stream-active');
    await hideWorkspace('logs');
    await docker.getByRole('button', { name: 'Stop Live', exact: true }).waitFor();
    await fixture.pause(); await wait(300); await fixture.marker('DOCKER_OUTER_VISIBLE');
    await docker.getByText('DOCKER_OUTER_VISIBLE', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(directory, 'docker-outer-log-catchup.png') });
    await docker.getByRole('button', { name: 'Console', exact: true }).click();
    await wait(2500);
    const afterLogs = snapshot('log-tab-closed');
    // Hold the actual SSH channel request: close the visible Console before
    // releasing it, rather than guessing whether a timed click beat the reply.
    pendingShellGate = ssh.holdNextProcessShell();
    let gateDeadline;
    try {
      await docker.getByRole('button', { name: 'Connect', exact: true }).click();
      await Promise.race([
        pendingShellGate.started,
        new Promise((_, reject) => { gateDeadline = setTimeout(() => reject(new Error('Real Docker shell request did not reach its hold gate')), 10000); }),
      ]);
      snapshot('pending-console-request-held');
      await docker.getByRole('button', { name: 'Logs', exact: true }).click();
      await docker.getByRole('button', { name: 'Live', exact: true }).waitFor();
      report.scenario.pendingAttach = { actualRequestHeld: true, uiClosedBeforeRelease: true };
    } finally {
      clearTimeout(gateDeadline);
      pendingShellGate.release();
      pendingShellGate = undefined;
    }
    await wait(2500);
    const afterPendingConsole = snapshot('pending-console-tab-closed');
    await docker.getByRole('button', { name: 'Console', exact: true }).click();
    await docker.getByRole('button', { name: 'Connect', exact: true }).click();
    const input = docker.locator('.xterm-helper-textarea:visible');
    await input.waitFor(); await wait(1000);
    const send = async command => {
      await input.focus();
      await app.evaluate(({ clipboard, BrowserWindow }, command) => { clipboard.writeText(command); BrowserWindow.getAllWindows()[0].webContents.paste(); }, command);
      await nativeInput(app, [{ type: 'keyDown', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }]);
    };
    await send('(i=0; while :; do j=0; while [ "$j" -lt 100 ]; do printf "OUTER_CONSOLE %010d\\n" "$i"; i=$((i+1)); j=$((j+1)); done; sleep 0.1; done) & console_pid=$!');
    await page.waitForFunction(() => globalThis.__dockerLifecycle.console.bytes > 20000);
    snapshot('console-active');
    await hideWorkspace('console');
    await send('kill "$console_pid"; wait "$console_pid"; printf "%s_%s\\n" CONSOLE OUTER_STOPPED');
    await page.waitForFunction(() => globalThis.__dockerLifecycle.console.text.includes('CONSOLE_OUTER_STOPPED'));
    await page.screenshot({ path: path.join(directory, 'docker-outer-console-catchup.png') });
    await docker.getByRole('button', { name: 'Logs', exact: true }).click();
    await wait(2500);
    const afterConsole = snapshot('console-tab-closed');
    await docker.getByRole('button', { name: 'Usage', exact: true }).click();
    await wait(5000);
    const beforeHistory = (await docker.locator('svg text').allTextContents()).filter(text => /^\d{2}:\d{2}:\d{2}$/.test(text));
    assert.ok(beforeHistory.length > 0, 'real Usage history must be visible');
    await nativeClick(app, page.getByTitle('Settings', { exact: true }));
    await page.getByRole('button', { name: 'Close Settings', exact: true }).waitFor();
    await wait(2200);
    await nativeClick(app, page.getByRole('button', { name: 'Close Settings', exact: true }));
    await docker.getByText(beforeHistory[0], { exact: true }).first().waitFor();
    const afterHistory = (await docker.locator('svg text').allTextContents()).filter(text => /^\d{2}:\d{2}:\d{2}$/.test(text));
    report.scenario.history = { before: beforeHistory, after: afterHistory };
    assert.equal(afterHistory[0], beforeHistory[0], 'whole-session hiding must retain real historical samples');
    await page.screenshot({ path: path.join(directory, 'docker-history-preserved.png') });
    await docker.getByRole('button', { name: 'Logs', exact: true }).click();
    await wait(1500);
    await nativeClick(app, docker.getByTitle('Close pane', { exact: true }));
    await wait(2500);
    snapshot('session-truly-closed');
    await page.evaluate(() => { globalThis.__stopLifecycleLogs(); globalThis.__stopLifecycleConsole(); });
    assert.equal(afterLogs.processes, 0, 'closing Logs must release the actual docker logs process');
    assert.equal(afterPendingConsole.processes, 0, 'closing a pending Console attach must release the shell when its start completes');
    assert.equal(afterConsole.processes, 0, 'closing Console must release the actual docker exec process');
    assert.ok(afterLogs.clients <= before.clients, 'the last closed Docker log stream must release its exclusively owned SSH transport');
    assert.ok(afterConsole.clients <= before.clients, 'closed Docker consoles must not accumulate ownerless SSH transports');
    report.correctness.dockerWholeSessionVisibility = true;
  } catch (error) {
    report.scenario.primaryError = error.stack;
    await page.screenshot({ path: path.join(directory, 'docker-lifecycle-failure.png') }).catch(() => {});
    throw error;
  } finally {
    pendingShellGate?.release();
    fs.writeFileSync(path.join(directory, 'docker-lifecycle-resource-events.json'), JSON.stringify(report.scenario, null, 2));
    try { await fixture.close(); report.scenario.containerRemoved = true; }
    catch (error) { report.scenario.cleanupError = error.stack; if (!report.scenario.primaryError) throw error; }
  }
}
if (require.main === module) runProfile('everyday', scenario).catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { scenario };
