'use strict';
const { execFileSync, execFile } = require('node:child_process');
const fs = require('node:fs');
const { MongoClient, ObjectId, Binary } = require('mongodb');
const socket = process.env.OWNSHELL_PERF_DOCKER_HOST;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const docker = (...args) => execFileSync('docker', ['--host', socket, ...args], { encoding: 'utf8', timeout: 120000 }).trim();

async function startMongo(profile) {
  if (!socket?.startsWith('unix:///') || !fs.statSync(socket.slice(7)).isSocket()) {
    throw new Error('OWNSHELL_PERF_DOCKER_HOST must explicitly name a local Unix Docker socket');
  }
  const name = `ownshell-perf08-${process.pid}-${Date.now()}`;
  let client;
  try {
    const image = docker('image', 'inspect', 'mongo:8', '--format', '{{.Id}}');
    docker('run', '--detach', '--rm', '--pull=never', '--name', name, '--label', 'ownshell.performance=08', '--publish', '127.0.0.1::27017', image, '--bind_ip_all', '--setParameter', 'enableTestCommands=1');
    const port = Number(docker('port', name, '27017/tcp').split(':').at(-1));
    const uri = `mongodb://127.0.0.1:${port}/ownshell_perf08?directConnection=true`;
    for (let attempt = 0; attempt < 100; attempt++) {
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 300 });
      try { await client.connect(); break; }
      catch (error) { await client.close(); client = null; if (attempt === 99) throw error; await wait(100); }
    }
    const db = client.db();
    const count = profile === 'stress' ? 100000 : 25000;
    const counts = { alpha: count, beta: count + 37 };
    const id = (collection, ordinal) => new ObjectId(`${collection}${ordinal.toString(16).padStart(22, '0')}`);
    for (const [collection, prefix] of [['alpha', '01'], ['beta', '02']]) {
      for (let start = 0; start < counts[collection]; start += 500) {
        await db.collection(collection).insertMany(Array.from({ length: Math.min(500, counts[collection] - start) }, (_, offset) => {
          const ordinal = start + offset;
          return { _id: id(prefix, ordinal), collection, ordinal, group: ordinal % 10, name: `${collection}-${String(ordinal).padStart(6, '0')}`, date: new Date('2026-01-02T03:04:05.000Z'), reference: id('03', ordinal), binary: new Binary(Buffer.from([0, 1, 2, 253, 254, 255])), nil: null, enabled: ordinal % 2 === 0, nested: { unicode: 'Grüße 世界 🐚', values: [ordinal, null, false, { leaf: 'nested-leaf' }] }, payload: 'synthetic-08-'.repeat(320) };
        }));
      }
      await db.collection(collection).createIndex({ ordinal: 1 });
      await db.collection(collection).createIndex({ group: 1 });
    }
    const wideFields = Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`field_${String(index).padStart(3, '0')}`, `supported-wide-${index}-` + 'x'.repeat(96)]));
    const largeBytes = profile === 'stress' ? 9 * 1024 * 1024 : 1024 * 1024;
    await db.collection('wide').insertMany(Array.from({ length: 100 }, (_, ordinal) => ({ _id: id('04', ordinal), collection: 'wide', ordinal, ...wideFields, nested: { rows: Array.from({ length: ordinal === 0 ? Math.ceil(largeBytes / 128) : 32 }, (_, row) => ({ row, text: `ROW ${String(row).padStart(8, '0')} ` + 'z'.repeat(96), child: [row, true, null] })) } })));
    await db.createCollection('error_view', { viewOn: 'beta', pipeline: [{ $project: { failure: { $divide: [1, 0] } } }] });
    await db.command({ profile: 2, slowms: 0 });
    const resources = [];
    const sampler = setInterval(() => {
      execFile('docker', ['--host', socket, 'stats', '--no-stream', '--format', '{{json .}}', name], { timeout: 4000 }, (error, stdout) => {
        if (!error) resources.push({ at: performance.now(), raw: stdout.trim() });
      });
    }, 5000);
    sampler.unref();
    return {
      uri, port, client, db,
      manifest: { service: 'MongoDB 8', image, loopback: '127.0.0.1', counts, collections: ['alpha', 'beta', 'wide', 'error_view'], wideFields: 256, wideDocuments: 100, largeNestedRows: Math.ceil(largeBytes / 128), largeRequestedBytes: largeBytes, supportedTypes: ['ObjectId', 'Date', 'Binary', 'string', 'number', 'boolean', 'null', 'array', 'nested object'] },
      resources,
      async observations() { return db.collection('system.profile').find({ op: { $in: ['query', 'command', 'getmore'] }, ns: { $ne: 'ownshell_perf08.system.profile' } }).project({ ts: 1, op: 1, ns: 1, command: 1, millis: 1, nreturned: 1, responseLength: 1, errMsg: 1 }).toArray(); },
      async close() {
        clearInterval(sampler);
        try { await client.close(); }
        finally { docker('stop', '--time', '2', name); }
      },
    };
  } catch (error) {
    if (client) await client.close().catch(() => {});
    try { docker('stop', '--time', '2', name); } catch {}
    throw error;
  }
}
module.exports = { startMongo };
