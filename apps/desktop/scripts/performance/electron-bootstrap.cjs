'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const electron = require('electron');
const { app, ipcMain, session, shell } = electron;
if (app.isPackaged || process.env.OWNSHELL_BENCHMARK !== '1') throw new Error('Benchmark bootstrap is unpackaged and explicit opt-in only');
const root = fs.realpathSync(process.env.OWNSHELL_BENCHMARK_ROOT);
const temporaryRoot = fs.realpathSync(os.tmpdir());
if (!root.startsWith(temporaryRoot + path.sep) || !path.basename(root).startsWith('ownshell-benchmark-')) throw new Error('Benchmark requires a dedicated temporary directory');
app.setPath('userData', path.join(root, 'profile'));
app.setPath('logs', path.join(root, 'logs'));
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1');
const { allowed, assertHost, workerResources, workerMessages, blockedConnections } = require('./loopback-guard.cjs');
// Native OpenSSH ignores user/system SSH config, agents, proxies and known-host files.
const pty = require('node-pty');
const spawnPty = pty.spawn;
const allowLocalPty = process.env.OWNSHELL_BENCHMARK_LOCAL_PTY === '1';
if (allowLocalPty) process.env.SHELL = '/bin/sh';
pty.spawn = function (file, args, options) {
  if (allowLocalPty && file === '/bin/sh') {
    return spawnPty('/bin/sh', ['-i'], {
      ...options, cwd: root,
      env: { HOME: root, SHELL: '/bin/sh', PATH: `${path.join(root, 'bin')}:/usr/bin:/bin:/usr/sbin:/sbin`, TERM: 'xterm-256color', PS1: 'benchmark-local$ ', ENV: '/dev/null' },
    });
  }
  if (file !== '/usr/bin/ssh') throw new Error(`Benchmark forbids subprocess PTY: ${file}`);
  const destination = args.at(-1);
  assertHost(destination?.split('@').at(-1));
  return spawnPty(file, ['-F', '/dev/null', '-o', 'ProxyCommand=none', '-o', 'ProxyJump=none', '-o', 'IdentityAgent=none', '-o', 'IdentityFile=none', '-o', 'CertificateFile=none', '-o', 'PubkeyAuthentication=no', '-o', 'GlobalKnownHostsFile=/dev/null', '-o', `UserKnownHostsFile=${path.join(root, 'known_hosts')}`, '-o', 'StrictHostKeyChecking=no', ...args], { ...options, env: { ...options.env, SSH_AUTH_SOCK: '', HOME: root } });
};
shell.openExternal = async () => { throw new Error('Benchmark forbids external applications'); };
const ipc = [];
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => originalHandle(channel, async (...args) => {
  const start = performance.now();
  try { return await handler(...args); }
  finally { ipc.push({ channel, start, durationMs: performance.now() - start }); }
});
const metrics = [];
let sampler;
let frameCapture;
const frameCapturePolicy = { version: 2, api: 'webContents.capturePage(region)', cooldownMs: 4, windowMs: 8000, maxDistinctFrames: 960 };
let phase = 'startup';
const blockedRequests = [];
const nativeInputEvents = [];
const startupEvents = [{ kind: 'benchmark-bootstrap', at: performance.now(), timeOrigin: performance.timeOrigin }];
const screenLocks = [];
app.once('ready', () => startupEvents.push({ kind: 'electron-ready', at: performance.now() }));
app.on('browser-window-created', (_event, window) => {
  startupEvents.push({ kind: 'browser-window-created', at: performance.now() });
  for (const kind of ['dom-ready', 'did-finish-load']) window.webContents.on(kind, () => startupEvents.push({ kind, at: performance.now() }));
  window.once('ready-to-show', () => startupEvents.push({ kind: 'ready-to-show', at: performance.now() }));
  window.webContents.on('before-input-event', (_event, input) => nativeInputEvents.push({ at: performance.now(), type: input.type }));
});
function recordFrameImage(region, state, image, requestedAt, at, source) {
  const metadataStart = at;
  const size = image.getSize();
  const bitmap = image.toBitmap();
  const previous = state.frames.at(-1);
  const repeated = previous && previous.width === size.width && previous.height === size.height && state.lastBitmap.equals(bitmap);
  const readback = { requestedAt, at, durationMs: at - requestedAt };
  if (source) readback.source = source;
  state.readbacks.push(readback);
  let frame = previous;
  if (repeated) {
    previous.lastObservedAt = at;
    previous.observations++;
  } else {
    if (state.frames.length >= frameCapturePolicy.maxDistinctFrames) {
      state.metadataMs += performance.now() - metadataStart;
      state.stopReason = 'distinct-frame-limit';
      return false;
    }
    frame = { at, lastObservedAt: at, observations: 1, image, width: size.width, height: size.height, dirtyRect: null, scale: { x: size.width / region.width, y: size.height / region.height }, callbackMs: 0 };
    state.frames.push(frame);
    state.lastBitmap = bitmap;
    state.retainedImageBytes += bitmap.length;
  }
  const metadataMs = performance.now() - metadataStart;
  frame.callbackMs += metadataMs;
  state.metadataMs += metadataMs;
  return true;
}
global.__ownshellBenchmark = {
  startFrames(window, region) {
    if (frameCapture) frameCapture.stopped = true;
    const state = frameCapture = { startedAt: performance.now(), stopped: false, frames: [], readbacks: [], metadataMs: 0, retainedImageBytes: 0 };
    state.task = (async () => {
      try {
        while (!state.stopped && performance.now() - state.startedAt < frameCapturePolicy.windowMs) {
          const requestedAt = performance.now();
          const image = await window.webContents.capturePage(region);
          const at = performance.now();
          if (!recordFrameImage(region, state, image, requestedAt, at)) break;
          await new Promise(resolve => setTimeout(resolve, frameCapturePolicy.cooldownMs));
        }
        state.stopReason ??= state.stopped ? 'requested' : 'window-limit';
      } catch (error) {
        state.error = error;
        state.stopReason = 'capture-error';
      }
    })();
  },
  captureReadyFrame(window, region) {
    const state = frameCapture;
    if (!state || state.stopped) throw new Error('No active frame capture');
    if (state.error) throw state.error;
    if (state.outcomeRequested) throw new Error('Outcome readback already requested');
    const requestedAt = performance.now();
    if (requestedAt - state.startedAt >= frameCapturePolicy.windowMs) throw new Error('Frame capture window ended');
    if (state.frames.length >= frameCapturePolicy.maxDistinctFrames || state.stopReason === 'distinct-frame-limit') throw new Error('Distinct-frame limit reached');
    state.outcomeRequested = true;
    state.outcomeTask = (async () => {
      try {
        const image = await window.webContents.capturePage(region);
        const at = performance.now();
        recordFrameImage(region, state, image, requestedAt, at, 'semantic-outcome');
        state.outcomeReadbacks = 1;
      } catch (error) {
        state.error = error;
        state.stopReason = 'capture-error';
        throw error;
      }
    })();
    return state.outcomeTask;
  },
  async finishFrames(window, region) {
    const state = frameCapture;
    state.stopped = true;
    if (state.outcomeTask) await Promise.allSettled([state.task, state.outcomeTask]);
    else await state.task;
    frameCapture = null;
    if (state.error) throw state.error;
    const referenceStart = performance.now();
    const reference = await window.webContents.capturePage(region);
    const referenceCaptureMs = performance.now() - referenceStart;
    const encodingStart = performance.now();
    const frames = state.frames.map(({ image, ...frame }) => ({ ...frame, png: image.toPNG().toString('base64') }));
    const captureStats = { ...frameCapturePolicy, totalReadbacks: state.readbacks.length, distinctFrames: frames.length, retainedImageBytes: state.retainedImageBytes, lastBitmapBytes: state.lastBitmap?.length ?? 0, metadataMs: state.metadataMs, stopReason: state.stopReason, readbacks: state.readbacks };
    if (state.outcomeRequested) Object.assign(captureStats, { mode: 'sequential-plus-outcome', modeVersion: 1, outcomeReadbacks: state.outcomeReadbacks ?? 0 });
    return {
      captureStart: state.startedAt, reference: reference.toPNG().toString('base64'), frames,
      referenceCaptureMs, encodingMs: performance.now() - encodingStart,
      captureStats,
    };
  },
  ipc: () => ipc,
  metrics: () => metrics,
  startupEvents: () => startupEvents,
  screenLocks: () => screenLocks,
  markPhase: value => { phase = value; return performance.now(); },
  blockedRequests: () => blockedRequests,
  clock: () => ({ at: performance.now(), timeOrigin: performance.timeOrigin }),
  workerMessages: () => workerMessages,
  runtime: () => ({ versions: process.versions, timeOrigin: performance.timeOrigin, frameCapture: frameCapturePolicy, systemIdleState: electron.powerMonitor.getSystemIdleState(1), displays: electron.screen.getAllDisplays().map(({ bounds, scaleFactor, displayFrequency }) => ({ bounds, scaleFactor, displayFrequency })) }),
  blockedConnections: () => blockedConnections,
  nativeInputEvents: () => nativeInputEvents,
  async input(events) {
    const window = electron.BrowserWindow.getAllWindows()[0];
    const focusStartedAt = performance.now();
    const activationRequested = !window.isFocused();
    if (activationRequested) await new Promise((resolve, reject) => {
      const focused = () => { clearTimeout(timer); window.removeListener('focus', focused); resolve(); };
      const timer = setTimeout(() => {
        window.removeListener('focus', focused);
        reject(new Error('Benchmark native foreground focus prerequisite timed out'));
      }, 2000);
      window.on('focus', focused);
      app.focus({ steal: true });
      window.focus();
      if (window.isFocused()) focused();
    });
    if (!window.webContents.isFocused()) window.webContents.focus();
    const nativeFocus = { windowFocused: window.isFocused(), webContentsFocused: window.webContents.isFocused(), activationRequested, setupDurationMs: performance.now() - focusStartedAt };
    if (!nativeFocus.windowFocused || !nativeFocus.webContentsFocused) throw new Error('Benchmark native input requires an active foreground window');
    const at = performance.now();
    for (const event of events) window.webContents.sendInputEvent(event);
    return { at, source: 'Electron.webContents.sendInputEvent', types: events.map(event => event.type), nativeFocus };
  },
  async probeConfinement() {
    let main = false, native = false;
    try { require('node:net').connect({ host: '198.51.100.1', port: 443 }); } catch (error) { main = error.message.startsWith('Benchmark forbids'); }
    try { pty.spawn('/usr/bin/ssh', ['benchmark@198.51.100.1'], {}); } catch (error) { native = error.message.startsWith('Benchmark forbids'); }
    const worker = new (require('node:worker_threads').Worker)(`const { parentPort } = require('node:worker_threads'); try { require('node:net').connect({host:'198.51.100.1',port:443}); parentPort.postMessage({type:'safety-probe',blocked:false}); } catch(error) { parentPort.postMessage({type:'safety-probe',blocked:error.message.startsWith('Benchmark forbids')}); }`, { eval: true });
    const workerBlocked = await new Promise((resolve, reject) => { worker.once('message', message => resolve(message.blocked)); worker.once('error', reject); });
    await worker.terminate();
    return { main, native, worker: workerBlocked };
  },
};
app.whenReady().then(async () => {
  session.defaultSession.registerPreloadScript({ type: 'frame', filePath: path.join(root, 'locale-preload.cjs') });
  electron.powerMonitor.on('lock-screen', () => screenLocks.push({ at: performance.now(), phase }));
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const cancel = ['http:', 'https:', 'ws:', 'wss:', 'ftp:'].includes(url.protocol) && !allowed(url.hostname);
    if (cancel) blockedRequests.push({ protocol: url.protocol, hostname: url.hostname });
    callback({ cancel });
  });
  sampler = setInterval(async () => {
    const start = performance.now();
    const sample = { at: start, phase, processes: app.getAppMetrics(), mainHeap: process.memoryUsage(), workers: await workerResources() };
    sample.samplingMs = performance.now() - start;
    metrics.push(sample);
  }, 1000);
});
app.on('before-quit', () => { clearInterval(sampler); fs.writeFileSync(path.join(root, 'main-metrics.json'), JSON.stringify({ metrics, ipc })); });
process.env.NODE_ENV = 'development';
process.env.OWNSHELL_BENCHMARK_ROOT = root;
require('../../dist-electron/main.js');
