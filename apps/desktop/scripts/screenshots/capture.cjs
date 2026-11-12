'use strict';
// Regenerates the product screenshots in docs/public/screenshots from local fixtures only.
// Usage: node apps/desktop/scripts/screenshots/capture.cjs [name ...]   (build:vite first)
// Isolated profile + HOME in a temp dir, loopback-only network (see ../performance/electron-bootstrap.cjs).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DESKTOP = path.resolve(__dirname, '../..');
const REPO = path.resolve(DESKTOP, '../..');
const PERF = path.join(DESKTOP, 'scripts/performance');
const OUT = process.env.SCREENSHOT_OUT || path.join(REPO, 'docs/public/screenshots');
const requireRepo = require('node:module').createRequire(path.join(REPO, 'package.json'));
const { _electron } = requireRepo('playwright-core');
const { startSSH } = require(path.join(PERF, 'ssh-fixture.cjs'));
const fixtures = require('./fixtures.cjs');

const PASSWORD = 'Screenshot-Only-2026!';
const WIDTH = 1440;
const HEIGHT = 900;
const only = process.argv.slice(2);
const wants = name => only.length === 0 || only.includes(name);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeRoot() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ownshell-benchmark-'));
  for (const dir of ['profile', 'bin', 'downloads']) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'ownshell-screenshots', version: require(path.join(DESKTOP, 'package.json')).version, main: path.join(PERF, 'electron-bootstrap.cjs') }));
  fs.writeFileSync(path.join(root, 'locale-preload.cjs'), `'use strict';\nwindow.localStorage.setItem('ownshell-language', 'en');\nwindow.localStorage.setItem('ownshell-theme', JSON.stringify({ state: { mode: 'dark' }, version: 0 }));\n`);
  return root;
}

async function launch(root, home) {
  const app = await _electron.launch({
    executablePath: require('node:module').createRequire(path.join(DESKTOP, 'package.json'))('electron'),
    args: [root],
    env: { ...process.env, HOME: home, OWNSHELL_BENCHMARK: '1', OWNSHELL_BENCHMARK_ROOT: root, OWNSHELL_BENCHMARK_LOCAL_PTY: '1', NODE_ENV: 'development', VITE_DEV_SERVER_URL: '', ELECTRON_RUN_AS_NODE: '' },
    timeout: 60000,
  });
  const log = fs.createWriteStream(path.join(root, 'electron.log'));
  app.process().stdout.pipe(log); app.process().stderr.pipe(log);
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(size.width, size.height);
    win.center();
  }, { width: WIDTH, height: HEIGHT });
  await page.waitForSelector('input');
  return { app, page };
}

async function fill(page, label, value) {
  const linked = page.getByLabel(label, { exact: true }).and(page.locator('input'));
  if (await linked.count()) return linked.first().fill(value);
  return page.locator('label').filter({ hasText: label }).first().locator('..').locator('input').fill(value);
}

// The SSH fixture only accepts user "benchmark" on 127.0.0.1:<random port>; show a fictitious address instead.
async function maskAddresses(page, ssh, home, remoteHome) {
  await page.evaluate(({ port, home, remoteHome }) => {
    const swap = s => s.replaceAll(remoteHome, '/home/deploy').replaceAll(home, '~').replaceAll(`benchmark@127.0.0.1:${port}`, 'deploy@10.0.0.12').replaceAll(`127.0.0.1:${port}`, '10.0.0.12').replaceAll('benchmark@127.0.0.1', 'deploy@10.0.0.12').replaceAll(`:${port}`, ':22');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.includes(String(port)) || n.nodeValue.includes('benchmark@') || n.nodeValue.includes(home) || n.nodeValue.includes(remoteHome)) n.nodeValue = swap(n.nodeValue);
    for (const el of document.querySelectorAll('input')) if (el.value.includes(String(port))) el.value = swap(el.value);
  }, { port: ssh.port, home, remoteHome });
}

// Panes without a path field: set the nearest React useState holding `from` (script-only shortcut).
async function setNearestState(locator, from, to) {
  const ok = await locator.first().evaluate((el, { from, to }) => {
    const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
    for (let fiber = el[key]; fiber; fiber = fiber.return) {
      for (let hook = fiber.tag === 0 ? fiber.memoizedState : null; hook; hook = hook.next) {
        if (hook.memoizedState === from && hook.queue?.dispatch) { hook.queue.dispatch(to); return true; }
      }
    }
    return false;
  }, { from, to });
  if (!ok) throw new Error(`no state ${from} found`);
}

// 256-colour palette PNG (UI screenshots stay crisp, ~half the bytes); skipped when ffmpeg is missing.
function optimize(file) {
  const tmp = file.replace(/\.png$/, '.tmp.png');
  try {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none', tmp]);
    fs.renameSync(tmp, file);
  } catch { fs.rmSync(tmp, { force: true }); }
}

async function shot(page, name) {
  await page.mouse.move(WIDTH - 2, HEIGHT - 2);
  await wait(400);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  optimize(file);
  console.log(`saved ${path.relative(REPO, file)}`);
}

async function setup(page, ssh) {
  await fill(page, 'Master Password', PASSWORD);
  await fill(page, 'Confirm Password', PASSWORD);
  await page.getByRole('button', { name: 'Create Master Password', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Got it!', exact: true }).click();
  await page.getByRole('button', { name: 'Add SSH Host', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add SSH Host', exact: true }).click();
  await fill(page, 'Label', 'acme-prod-1');
  await fill(page, 'Hostname / IP', '127.0.0.1');
  await fill(page, 'Port', String(ssh.port));
  await fill(page, 'Username', 'benchmark');
  await fill(page, 'Password', ssh.password);
  await page.getByRole('button', { name: 'Add Host', exact: true }).click();
  await page.getByRole('button', { name: 'acme-prod-1', exact: true }).waitFor();
}

module.exports = { setNearestState, launch, makeRoot, fill, maskAddresses, shot, setup, wait, wants, OUT, REPO, PASSWORD };

if (require.main === module) {
  (async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const root = makeRoot();
    let env, ssh, app, page;
    let failed = false;
    let cleaned = false;
    // Every resource is released even if startup fails half-way or the run is interrupted.
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      await app?.close().catch(() => {});
      await ssh?.close().catch(() => {});
      await env?.close().catch(() => {});
    };
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => { failed = true; cleanup().finally(() => process.exit(130)); });
    }
    try {
      env = await fixtures.start(root);
      ssh = await startSSH({ terminals: 1, outputTerminals: 0, textBytes: 1024, entries: 1, inputTargetMs: 50, switchTargetMs: 150 });
      ssh.enableProcessCommands(env.remote);
      await fixtures.seedSftp(ssh);
      ({ app, page } = await launch(root, env.localHome));
      await setup(page, ssh).catch(async error => { await page.screenshot({ path: path.join(root, 'failed-setup.png') }); failed = true; throw error; });
      const hostId = await page.evaluate(async () => (await window.electronAPI.hosts.getAll()).find(h => h.label === 'acme-prod-1').id);
      const scenes = require('./scenes.cjs');
      await scenes.seed(page, env, hostId);
      const ctx = { app, page, ssh, env, hostId, root };
      for (const scene of scenes) {
        if (!wants(scene.name)) continue;
        try { await scene.run(ctx); await maskAddresses(page, ssh, env.localHome, env.remote.cwd); await shot(page, scene.name); }
        catch (error) { failed = true; console.error(`FAILED ${scene.name}: ${error.message.split('\n')[0]}`); await page.screenshot({ path: path.join(root, `failed-${scene.name}.png`) }).catch(() => {}); }
        await scene.reset?.(ctx).catch(() => {});
      }
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      await cleanup();
      if (!failed && !process.env.SCREENSHOT_KEEP) fs.rmSync(root, { recursive: true, force: true });
      else console.log(`profile kept at ${root}`);
    }
    process.exit(failed ? 1 : 0);
  })().catch(error => { console.error(error); process.exit(1); });
}
