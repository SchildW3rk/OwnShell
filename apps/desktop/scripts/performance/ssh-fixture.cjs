'use strict';
const { Server, utils } = require('ssh2');
const { generateKeyPairSync, createHash, randomBytes } = require('node:crypto');
const path = require('node:path').posix;
const { spawn } = require('node:child_process');
const net = require('node:net');
const hostPath = require('node:path');
const { text, transferChunk, schedule } = require('./workloads.cjs');
const { STATUS_CODE } = utils.sftp;

async function startSSH(profile) {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const password = randomBytes(32).toString('hex');
  const files = new Map([['/editor.txt', text(profile.textBytes)]]);
  const events = [];
  const clients = new Set();
  let nextConnectionId = 0;
  const timers = new Set();
  const nextTransferSend = new Map();
  const pendingReads = new Map();
  let artificialDelay = true;
  let processCommands;
  const children = new Set();
  const forwards = new Set();
  const sockets = new Set();
  let closePromise;
  let closing = false;
  let nextProcessShellGate;
  const processShellGates = new Set();
  let nextSftpInitializationGate;
  const sftpInitializationGates = new Set();
  const allowedForwardPorts = new Set();
  const deniedWrites = new Set();
  const listingEntries = Array.from({ length: profile.entries }, (_, index) => `/listing/file-${String(index).padStart(6, '0')}.txt`);
  const directories = new Set(['/', '/listing']);
  const modes = new Map();
  const record = (type, detail = {}) => events.push({ type, at: performance.now(), ...detail });
  const canonical = p => path.resolve('/', p);
  const attributes = p => ({ mode: modes.get(p) ?? (directories.has(p) ? 0o40755 : 0o100644), uid: 1000, gid: 1000, size: files.get(p)?.length ?? (p.startsWith('/transfer-') ? schedule.transferBytes : 0), atime: 1700000000, mtime: 1700000000 });
  const entry = p => ({ filename: path.basename(p), longname: path.basename(p), attrs: attributes(p) });
  const rootEntries = () => ['/editor.txt', '/listing', '/transfer-a.bin', '/transfer-b.bin', ...[...files.keys()].filter(p => p !== '/editor.txt' && path.dirname(p) === '/')];
  const realCommandsFor = native => processCommands && (processCommands.native === 'all' || processCommands.native === native);
  const runProcess = (stream, config, command, terminalOptions) => {
    const environment = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: config.cwd, TERM: 'xterm-256color', ...config.env };
    const file = config.shell || '/bin/sh';
    const args = command === undefined ? ['-i'] : ['-c', command];
    const child = terminalOptions
      ? spawn(require('electron'), [hostPath.join(__dirname, 'pty-fixture-child.cjs')], { env: { ...environment, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
      : spawn(file, args, { cwd: config.cwd, env: environment, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child);
    record('process-created', { command: command ?? null, pid: child.pid, pty: !!terminalOptions });
    let finished = false;
    let terminateTimer;
    const send = message => { if (child.connected) child.send(message); };
    child.exited = new Promise(resolve => {
      child.once('exit', () => { clearTimeout(terminateTimer); children.delete(child); resolve(); });
      child.once('error', () => { clearTimeout(terminateTimer); children.delete(child); resolve(); });
    });
    const finish = (code, signal) => {
      if (finished) return;
      finished = true;
      record('process-exit', { command: command ?? null, pid: child.pid, code, signal });
      if (!stream.destroyed) { stream.exit(code ?? 1); stream.end(); }
    };
    child.on('close', (code, signal) => finish(code, signal));
    child.on('error', error => { record('process-error', { message: error.message }); finish(1); });
    child.stop = () => {
      if (!child.pid || terminateTimer || child.exitCode !== null || child.signalCode !== null) return;
      if (terminalOptions && child.connected) send({ type: 'close' });
      else if (terminalOptions) child.kill('SIGTERM');
      else { try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
      terminateTimer = setTimeout(() => {
        if (terminalOptions) child.kill('SIGKILL');
        else { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
      }, 2000);
      terminateTimer.unref();
    };
    stream.on('close', () => child.stop());
    if (terminalOptions) {
      child.on('message', message => {
        if (message.type === 'data') {
          record('process-output', { pid: child.pid, bytes: Buffer.byteLength(message.data) });
          if (!stream.write(message.data)) send({ type: 'pause' });
        } else if (message.type === 'started') record('process-start', { command: command ?? null, pid: message.pid, helperPid: child.pid, pty: true });
        else if (message.type === 'exit') { finish(message.exitCode, message.signal); child.disconnect(); }
        else if (message.type === 'error') { record('process-error', { message: message.message }); finish(1); }
      });
      child.stderr.on('data', bytes => record('process-helper-stderr', { text: bytes.toString() }));
      send({ type: 'start', file, args, options: { cwd: config.cwd, env: environment, name: 'xterm-256color', cols: terminalOptions.cols || 80, rows: terminalOptions.rows || 24 } });
      stream.on('data', bytes => { record('process-input', { pid: child.pid, bytes: bytes.length }); send({ type: 'data', data: bytes.toString() }); });
      stream.on('drain', () => send({ type: 'resume' }));
      return (cols, rows) => { send({ type: 'resize', cols, rows }); record('process-resize', { pid: child.pid, cols, rows }); };
    }
    record('process-start', { command, pid: child.pid, pty: false });
    child.stdout.on('data', bytes => record('process-output', { pid: child.pid, bytes: bytes.length }));
    child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream.stderr, { end: false }); stream.pipe(child.stdin);
    return () => {};
  };
  const server = new Server({ hostKeys: [key.privateKey] }, (client, info) => {
    const connectionId = ++nextConnectionId;
    const native = info.header.identRaw.includes('OpenSSH');
    clients.add(client);
    record('client-open', { native, connectionId });
    client.on('error', error => record('client-error', { message: error.message }));
    client.on('close', () => { clients.delete(client); record('client-close', { native, connectionId }); });
    client.on('authentication', ctx => ctx.username === 'benchmark' && ctx.method === 'password' && ctx.password === password ? ctx.accept() : ctx.reject(['password']));
    client.on('ready', () => {
      client.on('tcpip', (accept, reject, destination) => {
        if (destination.destIP !== '127.0.0.1' || !allowedForwardPorts.has(destination.destPort)) return reject();
        const socket = net.connect({ host: '127.0.0.1', port: destination.destPort });
        forwards.add(socket);
        socket.once('connect', () => {
          const channel = accept();
          record('forward-open', { port: destination.destPort });
          channel.pipe(socket).pipe(channel);
          channel.once('close', () => socket.destroy());
        });
        socket.once('error', error => { record('forward-error', { message: error.message }); reject(); });
        socket.once('close', () => { forwards.delete(socket); record('forward-close', { port: destination.destPort }); });
      });
      client.on('session', accept => {
      const session = accept();
      let terminalOptions;
      let resizeProcess;
      session.on('pty', (accept, _reject, options) => { terminalOptions = options; record('pty-request', { native, cols: options.cols, rows: options.rows }); accept?.(); });
      session.on('window-change', (accept, _reject, options) => { record('window-change', { native, cols: options.cols, rows: options.rows }); resizeProcess?.(options.cols, options.rows); accept?.(); });
      session.on('exec', (accept, reject, info) => {
        const stream = accept();
        const command = info.command;
        record('exec', { command });
        if (realCommandsFor(native) && (!processCommands.accepts || processCommands.accepts(command))) {
          resizeProcess = runProcess(stream, processCommands, command, terminalOptions);
          return;
        }
        if (/pwd/.test(command)) stream.write('/\n');
        else if (/uname/.test(command)) stream.write('Linux benchmark 6.0 synthetic x86_64 GNU/Linux\n');
        else if (/whoami/.test(command)) stream.write('benchmark\n');
        else if (/echo/.test(command)) stream.write(command.replace(/^.*echo\s+/, '').replace(/["']/g, '') + '\n');
        stream.exit(0); stream.end();
      });
      session.on('shell', async accept => {
        const gate = !native && realCommandsFor(native) ? nextProcessShellGate : undefined;
        if (gate) {
          nextProcessShellGate = undefined;
          let closed = false;
          const onClosed = () => { closed = true; gate.release(); };
          session.once('close', onClosed);
          record('process-shell-held');
          gate.begin();
          await gate.held;
          session.removeListener('close', onClosed);
          if (closed || closing) return;
          record('process-shell-released');
        }
        const stream = accept();
        record('shell-open', { native, peer: info.header.identRaw });
        if (realCommandsFor(native)) {
          resizeProcess = runProcess(stream, processCommands, undefined, terminalOptions || { cols: 80, rows: 24 });
          stream.on('close', () => record('shell-close', { native, realProcess: true }));
          return;
        }
        stream.write('OwnShell synthetic loopback fixture\r\nbenchmark$ ');
        let command = '', sequence = 0, output;
        stream.on('data', bytes => {
          for (const ch of bytes.toString()) {
            if (ch === '\r' || ch === '\n') {
              stream.write('\r\n');
              if (command.trim() === 'bench-output' && !output) {
                output = setInterval(() => {
                  for (let i = 0; i < 10; i++) stream.write(('BENCH ' + String(sequence++).padStart(10, '0') + ' ').padEnd(126, '.') + '\r\n');
                  record('output', { throughSequence: sequence - 1, bytes: 1280 });
                }, 100);
                timers.add(output); record('output-start');
              } else if (command.trim()) { stream.write('ECHO ' + command + '\r\nbenchmark$ '); record('echo', { text: command }); }
              command = '';
            } else if (ch === '\x03') { if (output) { clearInterval(output); timers.delete(output); output = undefined; } command = ''; stream.write('^C\r\nbenchmark$ '); }
            else if (ch === '\x7f') command = command.slice(0, -1);
            else { command += ch; stream.write(ch); }
          }
        });
        stream.on('close', () => { clearInterval(output); timers.delete(output); record('shell-close', { native }); });
      });
      session.on('sftp', async accept => {
        const gate = nextSftpInitializationGate;
        if (gate) {
          nextSftpInitializationGate = undefined;
          let closed = false;
          const onClosed = () => { closed = true; gate.release(); };
          session.once('close', onClosed);
          client.once('close', onClosed);
          record('sftp-init-held');
          gate.begin();
          await gate.held;
          session.removeListener('close', onClosed);
          client.removeListener('close', onClosed);
          if (closed || closing) return;
          record('sftp-init-released');
        }
        const sftp = accept();
        const handles = new Map(); let next = 1;
        const makeHandle = value => { const h = Buffer.alloc(4); h.writeUInt32BE(next++); handles.set(h.toString('hex'), value); return h; };
        const fail = (id, code = STATUS_CODE.NO_SUCH_FILE) => sftp.status(id, code);
        sftp.on('REALPATH', (id, p) => sftp.name(id, [{ ...entry(canonical(p)), filename: canonical(p) }]));
        for (const op of ['STAT', 'LSTAT']) sftp.on(op, (id, p) => sftp.attrs(id, attributes(canonical(p))));
        sftp.on('FSTAT', (id, h) => { const v = handles.get(h.toString('hex')); v ? sftp.attrs(id, attributes(v.path)) : fail(id); });
        sftp.on('OPENDIR', (id, p) => { p = canonical(p); record('list-start', { path: p }); sftp.handle(id, makeHandle({ path: p, offset: 0, directory: true })); });
        sftp.on('READDIR', (id, h) => {
          const v = handles.get(h.toString('hex')); if (!v) return fail(id);
          const entries = v.path === '/listing' ? listingEntries : v.path === '/' ? rootEntries() : [...files.keys(), ...directories].filter(p => p !== v.path && path.dirname(p) === v.path);
          const count = entries.length;
          if (v.offset >= count) { record('list-end', { path: v.path, entries: count }); return fail(id, STATUS_CODE.EOF); }
          const batch = [];
          for (let i = 0; i < 100 && v.offset < count; i++, v.offset++) batch.push(entry(entries[v.offset]));
          sftp.name(id, batch);
        });
        sftp.on('OPEN', (id, p, flags) => { p = canonical(p); if (deniedWrites.has(p) && (flags & (2 | 4 | 8 | 16))) return fail(id, STATUS_CODE.PERMISSION_DENIED); if (flags & 8) files.set(p, Buffer.alloc(0)); record('file-open', { path: p, flags, connectionId }); sftp.handle(id, makeHandle({ path: p })); });
        sftp.on('READ', (id, h, offset, length) => {
          const v = handles.get(h.toString('hex')); if (!v) return fail(id);
          const transfer = v.path.startsWith('/transfer-'); const size = attributes(v.path).size;
          if (offset >= size) return fail(id, STATUS_CODE.EOF);
          const count = Math.min(length, size - offset, transfer ? schedule.transferReadBytes : length);
          const data = transfer ? transferChunk(offset, count) : files.get(v.path)?.subarray(offset, offset + count);
          if (!data) return fail(id);
          const send = () => { sftp.data(id, data); record(transfer ? 'transfer-read' : 'file-read', { path: v.path, offset, bytes: count, connectionId }); };
          if (transfer && artificialDelay) {
            const now = performance.now();
            const due = Math.max(now, nextTransferSend.get(v.path) ?? now) + schedule.transferDelayMs;
            nextTransferSend.set(v.path, due);
            const flush = () => { if (!sftp.destroyed) send(); };
            const t = setTimeout(() => { timers.delete(t); pendingReads.delete(t); flush(); }, due - now);
            timers.add(t); pendingReads.set(t, flush);
          } else send();
        });
        sftp.on('WRITE', (id, h, offset, data) => { const v = handles.get(h.toString('hex')); if (!v) return fail(id); if (deniedWrites.has(v.path)) return fail(id, STATUS_CODE.PERMISSION_DENIED); const old = files.get(v.path) ?? Buffer.alloc(0); const bytes = Buffer.alloc(Math.max(old.length, offset + data.length)); old.copy(bytes); data.copy(bytes, offset); files.set(v.path, bytes); record('write', { path: v.path, offset, bytes: data.length }); sftp.status(id, STATUS_CODE.OK); });
        sftp.on('CLOSE', (id, h) => { const v = handles.get(h.toString('hex')); if (v) record('file-close', { path: v.path, sha256: files.has(v.path) ? createHash('sha256').update(files.get(v.path)).digest('hex') : null }); handles.delete(h.toString('hex')); sftp.status(id, STATUS_CODE.OK); });
        sftp.on('RENAME', (id, oldPath, newPath) => {
          oldPath = canonical(oldPath); newPath = canonical(newPath);
          const index = listingEntries.indexOf(oldPath);
          if (index < 0 && !files.has(oldPath)) return fail(id);
          if (index >= 0) listingEntries[index] = newPath;
          files.set(newPath, files.get(oldPath) ?? Buffer.alloc(0)); files.delete(oldPath);
          if (modes.has(oldPath)) { modes.set(newPath, modes.get(oldPath)); modes.delete(oldPath); }
          record('rename', { oldPath, newPath }); sftp.status(id, STATUS_CODE.OK);
        });
        sftp.on('REMOVE', (id, p) => {
          p = canonical(p);
          const index = listingEntries.indexOf(p);
          if (index < 0 && !files.has(p)) return fail(id);
          if (index >= 0) listingEntries.splice(index, 1);
          files.delete(p); modes.delete(p); record('remove', { path: p }); sftp.status(id, STATUS_CODE.OK);
        });
        sftp.on('MKDIR', (id, p) => {
          p = canonical(p);
          if (directories.has(p)) return fail(id, STATUS_CODE.FAILURE);
          directories.add(p); record('mkdir', { path: p }); sftp.status(id, STATUS_CODE.OK);
        });
        sftp.on('SETSTAT', (id, p, attrs) => {
          p = canonical(p);
          if (attrs.mode !== undefined) modes.set(p, (directories.has(p) ? 0o40000 : 0o100000) | attrs.mode);
          record('setstat', { path: p, mode: attrs.mode }); sftp.status(id, STATUS_CODE.OK);
        });
        sftp.on('FSETSTAT', (id) => sftp.status(id, STATUS_CODE.OK));
      });
      });
    });
  });
  // Own every transport socket, including peers that never finish the SSH
  // handshake. ssh2's documented injectSocket API keeps forced teardown off
  // its private connection fields.
  const listener = net.createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    server.injectSocket(socket);
  });
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  return {
    port: listener.address().port, password, events, files,
    holdNextProcessShell() {
      if (nextProcessShellGate) throw new Error('A real process shell is already scheduled to be held');
      let begin, releaseHeld;
      const started = new Promise(resolve => { begin = resolve; });
      const held = new Promise(resolve => { releaseHeld = resolve; });
      const gate = {
        begin, held,
        release() {
          if (nextProcessShellGate === gate) nextProcessShellGate = undefined;
          processShellGates.delete(gate);
          releaseHeld();
        },
      };
      nextProcessShellGate = gate;
      processShellGates.add(gate);
      return { started, release: () => gate.release() };
    },
    holdNextSftpInitialization() {
      if (nextSftpInitializationGate) throw new Error('An SFTP initialization is already scheduled to be held');
      let begin, releaseHeld;
      const started = new Promise(resolve => { begin = resolve; });
      const held = new Promise(resolve => { releaseHeld = resolve; });
      const gate = {
        begin, held,
        release() {
          if (nextSftpInitializationGate === gate) nextSftpInitializationGate = undefined;
          sftpInitializationGates.delete(gate);
          releaseHeld();
        },
      };
      nextSftpInitializationGate = gate;
      sftpInitializationGates.add(gate);
      return { started, release: () => gate.release() };
    },
    enableProcessCommands(options) {
      if (!options?.cwd || !require('node:fs').statSync(options.cwd).isDirectory()) throw new Error('Real process fixture requires an existing isolated cwd');
      processCommands = { ...options, native: options.native ?? 'all' };
    },
    allowForwardTo(port) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid loopback forward port');
      allowedForwardPorts.add(port);
    },
    setWriteDenied(p, denied) { if (denied) deniedWrites.add(canonical(p)); else deniedWrites.delete(canonical(p)); },
    resources: () => ({ clients: clients.size, timers: timers.size, pendingReads: pendingReads.size, processes: children.size, forwards: forwards.size, sockets: sockets.size, pendingProcessShells: processShellGates.size, pendingSftpInitializations: sftpInitializationGates.size }),
    beginUnmeasuredDrain() {
      artificialDelay = false;
      const phase = { phase: 'unmeasured-transfer-drain', transferDelayMs: 0, previousTransferDelayMs: schedule.transferDelayMs };
      record('phase-change', phase);
      for (const [timer, flush] of pendingReads) { clearTimeout(timer); timers.delete(timer); flush(); }
      pendingReads.clear();
      return { ...phase, at: performance.now() };
    },
    close: () => closePromise ??= (async () => {
      closing = true;
      for (const gate of processShellGates) gate.release();
      for (const gate of sftpInitializationGates) gate.release();
      record('fixture-close-start', { clients: clients.size, sockets: sockets.size, children: [...children].map(child => ({ pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode })) });
      const listenerClosed = new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
      for (const t of timers) clearInterval(t);
      timers.clear(); pendingReads.clear();
      const exited = [...children].map(child => child.exited);
      for (const c of clients) c.end();
      for (const socket of [...sockets, ...forwards]) socket.destroy();
      for (const child of children) child.stop();
      await Promise.all([listenerClosed, ...exited]);
      record('fixture-close-end', { clients: clients.size, sockets: sockets.size, processes: children.size, forwards: forwards.size });
    })(),
  };
}
module.exports = { startSSH };
