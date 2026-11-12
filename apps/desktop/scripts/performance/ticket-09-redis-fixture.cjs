'use strict';
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const Redis = require('ioredis');
const dockerHost = process.env.OWNSHELL_PERF_DOCKER_HOST;
const image = 'redis:7-alpine';
const docker = (...args) => execFileSync('docker', ['--host', dockerHost, ...args], { encoding: 'utf8', timeout: 30000 }).trim();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scanOracle(client, pattern, type) {
  const pages = [];
  const deadline = performance.now() + 30000;
  let cursor = '0';
  do {
    assert.ok(performance.now() < deadline, 'real Redis oracle preparation exceeded its finite deadline');
    const args = [cursor, 'MATCH', pattern, 'COUNT', 100];
    if (type) args.push('TYPE', type);
    const [nextCursor, keys] = await client.scan(...args);
    pages.push({ cursor, nextCursor, keys });
    cursor = nextCursor;
  } while (cursor !== '0');
  const keys = pages.flatMap(page => page.keys);
  return { database: 0, pattern, type: type || null, count: 100, pages, keys, pagesHash: createHash('sha256').update(JSON.stringify(pages)).digest('hex') };
}

async function startRedis(count) {
  if (!dockerHost?.startsWith('unix:///')) throw new Error('OWNSHELL_PERF_DOCKER_HOST must explicitly select a local Unix Docker socket');
  const name = `ownshell-perf09-${process.pid}-${Date.now()}`;
  let client;
  try {
    const container = docker('run', '--detach', '--rm', '--pull', 'never', '--name', name, '--label', 'ownshell.performance.issue=9', '--publish', '127.0.0.1::6379', image, 'redis-server', '--save', '', '--appendonly', 'no');
    const inspect = JSON.parse(docker('inspect', container))[0];
    const port = Number(inspect.NetworkSettings.Ports['6379/tcp'][0].HostPort);
    client = new Redis({ host: '127.0.0.1', port, db: 0, lazyConnect: true, retryStrategy: null, connectTimeout: 1000, commandTimeout: 10000 });
    for (let attempt = 0; ; attempt++) {
      try { await client.connect(); await client.ping(); break; }
      catch (error) {
        client.disconnect();
        if (attempt >= 30) throw error;
        await wait(100);
        client = new Redis({ host: '127.0.0.1', port, db: 0, lazyConnect: true, retryStrategy: null, connectTimeout: 1000, commandTimeout: 10000 });
      }
    }
    const started = performance.now();
    for (let offset = 0; offset < count; offset += 1000) {
      const pipeline = client.pipeline();
      for (let index = offset; index < Math.min(count, offset + 1000); index++) {
        const key = `item:${String(index).padStart(6, '0')}`;
        switch (index % 5) {
          case 0: pipeline.set(key, `STRING ${index}`); break;
          case 1: pipeline.hset(key, 'name', `HASH ${index}`, 'ordinal', String(index)); break;
          case 2: pipeline.rpush(key, `LIST ${index} first`, `LIST ${index} second`); break;
          case 3: pipeline.sadd(key, `SET ${index} alpha`, `SET ${index} beta`); break;
          case 4: pipeline.zadd(key, 1, `ZSET ${index} first`, 2, `ZSET ${index} second`); break;
        }
      }
      const results = await pipeline.exec();
      for (const [error] of results) if (error) throw error;
    }
    await client.set('value:large', 'REDIS LARGE\n' + 'synthetic redis value\n'.repeat(50000));
    await client.rpush('value:list', ...Array.from({ length: 1500 }, (_, index) => `ROW ${String(index).padStart(6, '0')}`));
    const redisVersion = (await client.info('server')).match(/^redis_version:(.+)$/m)?.[1].trim();
    assert.match(redisVersion || '', /^7\./, 'fixture must run the actual required Redis 7 service');
    const metadata = { image, imageId: inspect.Image, redisVersion, container, host: '127.0.0.1', port, deterministicKeys: count, totalKeys: await client.dbsize(), seedMs: performance.now() - started, types: ['string', 'hash', 'list', 'set', 'zset'], listItems: 1500, listRange: [0, -1], commands: {}, scans: [] };
    // Settle post-seed dictionary iteration using real reads, never data writes
    // or a replacement search command, before capturing the independent oracle.
    const readStarted = performance.now();
    for (let offset = 0; offset < count + 2; offset += 1000) {
      const pipeline = client.pipeline();
      const end = Math.min(count + 2, offset + 1000);
      for (let index = offset; index < end; index++) {
        const key = index < count ? `item:${String(index).padStart(6, '0')}` : index === count ? 'value:large' : 'value:list';
        pipeline.type(key);
        pipeline.ttl(key);
      }
      const results = await pipeline.exec();
      for (let index = offset; index < end; index++) {
        const type = results[(index - offset) * 2], ttl = results[(index - offset) * 2 + 1];
        assert.ifError(type[0]); assert.ifError(ttl[0]);
        assert.equal(type[1], index < count ? metadata.types[index % 5] : index === count ? 'string' : 'list');
        assert.equal(ttl[1], -1, 'every fixture key must remain present without an expiry horizon');
      }
    }
    metadata.readPreparation = { version: 1, keys: count + 2, commands: ['TYPE', 'TTL'], elapsedMs: performance.now() - readStarted };
    const oracles = [];
    for (const [pattern, type] of [['*', null], ['item:000*', null], ['item:000*', 'hash'], ['item:00000?', null], ['no-such-key:*', null]]) {
      oracles.push(await scanOracle(client, pattern, type));
    }
    assert.equal(new Set(oracles[0].keys).size, count + 2, 'real Redis oracle must contain the entire seeded corpus');
    const repeated = await scanOracle(client, '*');
    assert.deepEqual([...new Set(repeated.keys)].sort(), [...new Set(oracles[0].keys)].sort(), 'immutable fixture membership must agree before app startup');
    assert.equal(repeated.pagesHash, oracles[0].pagesHash, 'fixed Redis fixture must have stable scan pages before app startup (membership verified separately)');
    const keyspace = await client.info('keyspace');
    assert.match(keyspace, new RegExp(`db0:keys=${count + 2},expires=0,`), 'fixture must have no TTL horizon during scans');
    metadata.oracle = { version: 1, database: 0, expires: 0, stablePagesAtSetup: true, immutableDuringScene: null, queries: oracles.map(({ pattern, type, count, pages, keys, pagesHash }) => ({ pattern, type, count, pages: pages.length, keys: keys.length, pagesHash })) };
    // Oracle setup is outside app measurement; keep server command statistics
    // scoped to the real app and the declared observation commands.
    await client.config('RESETSTAT');
    const monitor = await client.monitor();
    monitor.on('monitor', (time, args, _source, database) => {
      const command = args[0].toLowerCase();
      metadata.commands[command] = (metadata.commands[command] || 0) + 1;
      if (command === 'scan') metadata.scans.push({ database: Number(database), serverTime: time, observedAt: performance.now(), args: args.slice(1) });
    });
    return { client, port, metadata, oracles, close: async () => { monitor.disconnect(); client.disconnect(); docker('stop', name); } };
  } catch (error) {
    client?.disconnect();
    try { docker('stop', name); } catch {}
    throw error;
  }
}
module.exports = { startRedis };
