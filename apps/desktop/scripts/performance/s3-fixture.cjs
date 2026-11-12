'use strict';
const { execFileSync } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PNG } = require('pngjs');
const { S3Client, CreateBucketCommand, PutObjectCommand, ListBucketsCommand } = require('@aws-sdk/client-s3');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function startS3(count) {
  const socket = process.env.OWNSHELL_PERF_DOCKER_HOST ?? `unix://${path.join(os.homedir(), '.orbstack', 'run', 'docker.sock')}`;
  if (!socket?.startsWith('unix:///') || !fs.statSync(socket.slice('unix://'.length)).isSocket()) {
    throw new Error('Docker fixture requires an existing local Unix socket; set OWNSHELL_PERF_DOCKER_HOST explicitly for non-OrbStack daemons');
  }
  function docker(...args) {
    try {
      return execFileSync('docker', ['--host', socket, ...args], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      throw new Error(error.message.replace(/RUSTFS_(ACCESS_KEY|SECRET_KEY)=[^\s]+/g, 'RUSTFS_$1=<REDACTED>'));
    }
  }
  const name = `ownshell-perf10-${randomBytes(6).toString('hex')}`;
  const accessKeyId = `bench${randomBytes(10).toString('hex')}`;
  const secretAccessKey = randomBytes(24).toString('hex');
  const events = [], buckets = ['benchmark-objects', 'benchmark-other'];
  let proxy, client, started = false;
  let phase = 'container-start', seeded = 0;
  const close = async () => {
    client?.destroy();
    if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
    if (started) docker('rm', '-f', name);
  };
  try {
    docker('run', '-d', '--rm', '--pull', 'never', '--name', name, '--label', 'ownshell.performance=10', '-p', '127.0.0.1::9000', '-e', `RUSTFS_ACCESS_KEY=${accessKeyId}`, '-e', `RUSTFS_SECRET_KEY=${secretAccessKey}`, '-e', 'RUSTFS_CONSOLE_ENABLE=false', 'rustfs/rustfs@sha256:ed9210d6411d77ffceb70d94b964a3cb7d225983368bc25bebe01e995293dcc2', '/data');
    started = true;
    const image = JSON.parse(docker('inspect', name))[0].Image;
    const port = Number(docker('port', name, '9000/tcp').trim().split(':').at(-1));
    proxy = http.createServer((request, response) => {
      const at = performance.now();
      const url = new URL(request.url, 'http://127.0.0.1');
      const event = { at, method: request.method, path: url.pathname, prefix: url.searchParams.get('prefix'), continuation: url.searchParams.has('continuation-token'), kind: url.searchParams.has('list-type') ? 'listing' : request.method === 'GET' && url.pathname.split('/').filter(Boolean).length >= 2 ? 'object-download' : 'service', signed: !!request.headers.authorization || url.searchParams.has('X-Amz-Signature'), auth: url.searchParams.has('X-Amz-Signature') ? 'presigned' : request.headers.authorization ? 'header' : 'none', bytes: 0 };
      events.push(event);
      const upstream = http.request({ hostname: '127.0.0.1', port, path: request.url, method: request.method, headers: request.headers }, incoming => {
        event.headersMs = performance.now() - at; event.status = incoming.statusCode;
        response.writeHead(incoming.statusCode, incoming.headers);
        const hash = createHash('sha256'), chunks = [];
        incoming.on('data', chunk => { event.bytes += chunk.length; hash.update(chunk); if (event.kind === 'listing') chunks.push(chunk); });
        incoming.on('end', () => {
          event.durationMs = performance.now() - at; event.sha256 = hash.digest('hex');
          if (event.kind === 'listing') {
            const xml = Buffer.concat(chunks).toString('utf8');
            event.keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(match => match[1]);
            event.truncated = xml.includes('<IsTruncated>true</IsTruncated>');
          }
        });
        incoming.pipe(response);
      });
      upstream.on('error', error => { event.error = error.message; response.destroy(error); });
      request.pipe(upstream);
    });
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${proxy.address().port}`;
    client = new S3Client({ endpoint, region: 'us-east-1', credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true, maxAttempts: 1 });
    phase = 'service-readiness';
    const deadline = Date.now() + 60000;
    for (;;) {
      try { await client.send(new ListBucketsCommand({})); break; }
      catch (error) { if (Date.now() > deadline) throw error; await wait(500); }
    }
    phase = 'bucket-create';
    for (const Bucket of buckets) await client.send(new CreateBucketCommand({ Bucket }));
    const png = new PNG({ width: 96, height: 96 });
    for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 30; png.data[i + 1] = 180; png.data[i + 2] = 80; png.data[i + 3] = 255; }
    const green = PNG.sync.write(png);
    for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 200; png.data[i + 1] = 40; png.data[i + 2] = 70; }
    const red = PNG.sync.write(png);
    const images = { '00-green.png': green, '01-red.png': red, '02-broken.png': Buffer.from('not an image'), '04-missing.png': red };
    for (const [extension, codec, format] of [['jpg', 'mjpeg', 'image2pipe'], ['jpeg', 'mjpeg', 'image2pipe'], ['gif', 'gif', 'gif']]) {
      images[`03-green.${extension}`] = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-c:v', codec, '-f', format, 'pipe:1'], { input: green, timeout: 10000 });
    }
    const imageDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ownshell-s3-images-'));
    try {
      const input = path.join(imageDirectory, 'green.png'), output = path.join(imageDirectory, 'green.webp');
      fs.writeFileSync(input, green);
      execFileSync('cwebp', ['-quiet', '-lossless', input, '-o', output], { timeout: 10000 });
      images['03-green.webp'] = fs.readFileSync(output);
    } finally { fs.rmSync(imageDirectory, { recursive: true, force: true }); }
    phase = 'image-seed';
    for (const [Key, Body] of Object.entries(images)) {
      const extension = Key.split('.').at(-1);
      await client.send(new PutObjectCommand({ Bucket: buckets[0], Key, Body, ContentType: `image/${extension === 'jpg' ? 'jpeg' : extension}` }));
    }
    let next = 0;
    phase = 'listing-seed';
    await Promise.all(Array.from({ length: 24 }, async () => {
      while (next < count) {
        const index = next++;
        await client.send(new PutObjectCommand({ Bucket: buckets[0], Key: `listing/object-${String(index).padStart(6, '0')}.txt`, Body: `synthetic object ${index}\n`, ContentType: 'text/plain' }));
        seeded++;
      }
    }));
    phase = 'additional-prefix-seed';
    await client.send(new PutObjectCommand({ Bucket: buckets[1], Key: 'other-only.txt', Body: 'other bucket\n' }));
    await client.send(new PutObjectCommand({ Bucket: buckets[0], Key: 'alternate/alternate-only.txt', Body: 'alternate prefix\n' }));
    events.length = 0;
    return { endpoint, accessKeyId, secretAccessKey, buckets, events, client, close, image, count,
      stats: () => JSON.parse(docker('stats', '--no-stream', '--format', '{{json .}}', name)),
      images: Object.fromEntries(Object.entries(images).map(([key, bytes]) => [key, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }])) };
  } catch (error) {
    let state, serverLog;
    try {
      const current = JSON.parse(docker('inspect', '--format', '{{json .State}}', name));
      state = { status: current.Status, running: current.Running, oomKilled: current.OOMKilled, exitCode: current.ExitCode };
      serverLog = docker('logs', '--tail', '20', name).split(accessKeyId).join('<redacted>').split(secretAccessKey).join('<redacted>');
    } catch { state ??= { diagnosticUnavailable: true }; }
    console.error('S3_FIXTURE_FAILURE', JSON.stringify({ phase, requestedObjects: count, completedObjects: seeded, recentRequests: events.slice(-5).map(({ method, path, kind, status }) => ({ method, path, kind, status })), state, serverLog }));
    try { await close(); }
    catch (cleanupError) { error.cleanupError = cleanupError.message; }
    throw error;
  }
}
module.exports = { startS3 };
