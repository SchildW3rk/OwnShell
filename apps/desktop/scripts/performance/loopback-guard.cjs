'use strict';
// Required in the main process and every Node worker before application imports.
if (process.env.OWNSHELL_BENCHMARK === '1') {
  const net = require('node:net');
  const tls = require('node:tls');
  const dns = require('node:dns');
  const blockedConnections = [];
  const allowed = host => host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === 'localhost';
  function assertHost(host) {
    if (!allowed(host)) { blockedConnections.push({ at: performance.now(), host }); throw new Error(`Benchmark forbids non-loopback connection: ${host}`); }
  }
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const value = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (value && typeof value === 'object') {
      if (value.path) throw new Error('Benchmark forbids Unix network sockets');
      assertHost(value.host ?? 'localhost');
    } else if (typeof value === 'number') assertHost(typeof args[1] === 'string' ? args[1] : 'localhost');
    else throw new Error('Benchmark forbids unrecognized network target');
    return connect.apply(this, args);
  };
  const tlsConnect = tls.connect;
  tls.connect = function (...args) {
    const options = args.find(a => a && typeof a === 'object' && !Array.isArray(a));
    if (options && !options.socket) assertHost(options.host ?? 'localhost');
    return tlsConnect.apply(this, args);
  };
  const lookup = dns.lookup;
  dns.lookup = function (host, ...args) { assertHost(host); return lookup.call(this, host, ...args); };
  const lookupPromise = dns.promises.lookup;
  dns.promises.lookup = async function (host, ...args) { assertHost(host); return lookupPromise.call(this, host, ...args); };
  const workerThreads = require('node:worker_threads');
  const Worker = workerThreads.Worker;
  const workers = new Set();
  const workerMessages = [];
  workerThreads.Worker = class extends Worker {
    constructor(filename, options = {}) {
      super(filename, { ...options, execArgv: [...(options.execArgv ?? process.execArgv).filter(a => !a.startsWith('--inspect')), '--require', __filename] });
      workers.add(this);
      this.on('exit', () => workers.delete(this));
      this.on('message', message => workerMessages.push({ at: performance.now(), direction: 'receive', threadId: this.threadId, type: message.type, execId: message.execId }));
    }
    postMessage(message, ...args) {
      workerMessages.push({ at: performance.now(), direction: 'send', threadId: this.threadId, type: message.type, execId: message.execId });
      return super.postMessage(message, ...args);
    }
  };
  async function workerResources() {
    return Promise.all([...workers].map(async worker => ({
      threadId: worker.threadId,
      cpu: typeof worker.cpuUsage === 'function' ? await worker.cpuUsage().catch(() => null) : 'unsupported',
      heap: typeof worker.getHeapStatistics === 'function' ? await worker.getHeapStatistics().catch(() => null) : 'unsupported',
    })));
  }
  module.exports = { allowed, assertHost, workerResources, workerMessages, blockedConnections };
}
