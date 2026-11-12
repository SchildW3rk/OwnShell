'use strict';
// Fictitious local data for the screenshots: remote home with a git repo, fake system commands,
// a local HTTP + WebSocket test server, a SQLite file and (when a local Docker socket exists) disposable containers.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '../../../..');
const requireRepo = require('node:module').createRequire(path.join(REPO, 'package.json'));

const write = (file, content, mode) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, mode ? { mode } : undefined); };

const REPO_FILES = {
  'README.md': '# acme-shop\n\nStorefront API, worker and web frontend.\n\n```sh\nmake dev\n```\n',
  'go.mod': 'module example.com/acme-shop\n\ngo 1.23\n',
  'cmd/api/main.go': `package main

import (
\t"log"
\t"net/http"
\t"os"

\t"example.com/acme-shop/internal/orders"
)

func main() {
\taddr := os.Getenv("LISTEN_ADDR")
\tif addr == "" {
\t\taddr = ":8080"
\t}

\tmux := http.NewServeMux()
\tmux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
\t\tw.WriteHeader(http.StatusOK)
\t})
\tmux.Handle("/v1/orders/", orders.Handler())

\tlog.Printf("api listening on %s", addr)
\tlog.Fatal(http.ListenAndServe(addr, mux))
}
`,
  'internal/orders/handler.go': `package orders

import (
\t"encoding/json"
\t"net/http"
)

type Order struct {
\tID       string  \`json:"id"\`
\tCustomer string  \`json:"customer"\`
\tTotal    float64 \`json:"total"\`
\tStatus   string  \`json:"status"\`
}

func Handler() http.Handler {
\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
\t\tw.Header().Set("Content-Type", "application/json")
\t\tjson.NewEncoder(w).Encode([]Order{{ID: "ord_1042", Customer: "cus_88", Total: 129.9, Status: "paid"}})
\t})
}
`,
  'web/src/api.ts': `export interface Order {
  id: string;
  customer: string;
  total: number;
  status: 'pending' | 'paid' | 'refunded';
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/v1';

export async function listOrders(signal?: AbortSignal): Promise<Order[]> {
  const response = await fetch(\`\${BASE_URL}/orders\`, { signal });
  if (!response.ok) throw new Error(\`orders: \${response.status}\`);
  return response.json();
}
`,
  'docker-compose.yml': 'services:\n  api:\n    build: .\n    env_file: .env\n    depends_on: [db, cache]\n  db:\n    image: postgres:17-alpine\n  cache:\n    image: redis:7-alpine\n  web:\n    image: caddy:2-alpine\n    ports: ["443:443"]\n',
  '.env.example': 'DATABASE_URL=postgres://app:change-me@db:5432/app\nREDIS_URL=redis://cache:6379\nLISTEN_ADDR=:8080\n',
  'Makefile': 'dev:\n\tdocker compose up --build\n\ntest:\n\tgo test ./...\n',
};

function gitRepo(dir) {
  const env = { ...process.env, HOME: path.dirname(dir), GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Sam Carter', GIT_AUTHOR_EMAIL: 'sam@example.com', GIT_COMMITTER_NAME: 'Sam Carter', GIT_COMMITTER_EMAIL: 'sam@example.com' };
  const git = (args, extra = {}) => execFileSync('git', args, { cwd: dir, env: { ...env, ...extra }, stdio: 'pipe' });
  fs.mkdirSync(dir, { recursive: true });
  git(['init', '-q', '-b', 'main']);
  const day = n => ({ GIT_AUTHOR_DATE: `2026-11-0${n}T10:${10 + n}:00Z`, GIT_COMMITTER_DATE: `2026-11-0${n}T10:${10 + n}:00Z` });
  const commit = (n, files, message, who) => {
    for (const f of files) write(path.join(dir, f), REPO_FILES[f]);
    git(['add', ...files]);
    git(['commit', '-q', '-m', message], { ...day(n), ...(who ? { GIT_AUTHOR_NAME: who, GIT_AUTHOR_EMAIL: 'jordan@example.com' } : {}) });
  };
  commit(1, ['README.md', 'go.mod', 'Makefile'], 'Initial project layout');
  commit(2, ['cmd/api/main.go'], 'api: add HTTP server with health check');
  commit(3, ['internal/orders/handler.go'], 'orders: list endpoint', 'Jordan Park');
  commit(4, ['docker-compose.yml', '.env.example'], 'compose: api, postgres, redis and caddy');
  commit(5, ['web/src/api.ts'], 'web: orders client', 'Jordan Park');
  git(['branch', 'feature/refunds']);
  // Pending change for the diff view.
  write(path.join(dir, 'internal/orders/handler.go'), REPO_FILES['internal/orders/handler.go']
    .replace('\t"net/http"\n)', '\t"net/http"\n\t"time"\n)')
    .replace('\tStatus   string  `json:"status"`\n}', '\tStatus   string  `json:"status"`\n\tPaidAt   time.Time `json:"paid_at"`\n}')
    .replace('json.NewEncoder(w).Encode([]Order{{ID: "ord_1042", Customer: "cus_88", Total: 129.9, Status: "paid"}})',
      'if r.Method != http.MethodGet {\n\t\t\thttp.Error(w, "method not allowed", http.StatusMethodNotAllowed)\n\t\t\treturn\n\t\t}\n\t\tjson.NewEncoder(w).Encode([]Order{{ID: "ord_1042", Customer: "cus_88", Total: 129.9, Status: "paid", PaidAt: time.Now()}})'));
  write(path.join(dir, 'web/src/api.ts'), REPO_FILES['web/src/api.ts'].replace("'pending' | 'paid' | 'refunded';", "'pending' | 'paid' | 'refunded';\n  paidAt?: string;"));
}

function remoteHome(root, dockerBin) {
  const home = path.join(root, 'remote', 'deploy');
  const bin = path.join(root, 'remote-bin');
  fs.mkdirSync(bin, { recursive: true });
  const stub = (name, body) => write(path.join(bin, name), `#!/bin/sh\n${body}\n`, 0o755);
  stub('uname', 'case "$1" in -a) echo "Linux acme-prod-1 6.8.0-49-generic #49-Ubuntu SMP x86_64 GNU/Linux" ;; -r) echo 6.8.0-49-generic ;; *) echo Linux ;; esac');
  stub('hostname', 'echo acme-prod-1');
  stub('uptime', 'echo " 10:42:17 up 23 days, 4:11, load average: 0.21, 0.18, 0.12"');
  stub('df', 'printf "%s\\n" "Filesystem      Size  Used Avail Use% Mounted on" "/dev/vda1        78G   31G   44G  42% /" "/dev/vdb1       197G   64G  124G  35% /var/lib/docker"');
  stub('free', 'printf "%s\\n" "               total        used        free      shared  buff/cache   available" "Mem:           7.7Gi       2.9Gi       1.1Gi        12Mi       3.7Gi       4.6Gi" "Swap:          2.0Gi          0B       2.0Gi"');
  if (dockerBin) fs.copyFileSync(dockerBin, path.join(bin, 'docker'));
  else stub('docker', 'echo "docker: not available in this fixture" >&2; exit 1');
  write(path.join(home, '.bashrc'), [
    'export PS1="\\[\\e[1;32m\\]deploy@acme-prod-1\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]\\$ "',
    "alias ls='ls -G'",
    "export CLICOLOR=1 LSCOLORS=ExGxFxdxCxegedabagacad",
    'export GIT_PAGER=cat PAGER=cat',
    "alias dps=\"docker ps --format 'table {{.Names}}\\t{{.Status}}'\"",
  ].join('\n') + '\n');
  write(path.join(home, '.gitconfig'), '[user]\n\tname = Sam Carter\n\temail = sam@example.com\n[color]\n\tui = always\n');
  gitRepo(path.join(home, 'acme-shop'));
  return {
    cwd: home, shell: '/bin/bash', native: 'all',
    env: { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: home, USER: 'deploy', LOGNAME: 'deploy', BASH_SILENCE_DEPRECATION_WARNING: '1', LANG: 'en_US.UTF-8', GIT_CONFIG_NOSYSTEM: '1' },
  };
}

function localHome(root) {
  const home = path.join(root, 'Users', 'sam');
  for (const dir of ['Desktop', 'Documents', 'Downloads', 'Projects/acme-shop', 'Projects/billing-api', 'backups']) fs.mkdirSync(path.join(home, dir), { recursive: true });
  write(path.join(home, 'Projects/acme-shop/docker-compose.yml'), REPO_FILES['docker-compose.yml']);
  write(path.join(home, 'Projects/acme-shop/.env.example'), REPO_FILES['.env.example']);
  write(path.join(home, 'backups/app-2026-11-10.sql.gz'), Buffer.alloc(184_320, 7));
  write(path.join(home, 'notes.md'), '# Deploy checklist\n');
  return home;
}

function sqliteFile(home) {
  const file = path.join(home, 'Documents', 'shop.sqlite');
  const customers = ['Avery Stone', 'Blake Rivers', 'Casey Moreno', 'Devon Hart', 'Emery Quinn', 'Finley Brooks', 'Harper Lane', 'Jules Navarro', 'Kai Mercer', 'Logan Reyes', 'Morgan Ellis', 'Parker Wynn'];
  const statuses = ['paid', 'paid', 'shipped', 'pending', 'paid', 'refunded'];
  const sql = ['CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, country TEXT, created_at TEXT);',
    'CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), total REAL NOT NULL, currency TEXT, status TEXT, created_at TEXT);',
    'CREATE TABLE products (id INTEGER PRIMARY KEY, sku TEXT, name TEXT, price REAL);'];
  customers.forEach((name, i) => sql.push(`INSERT INTO customers VALUES (${i + 1}, '${name}', '${name.split(' ')[0].toLowerCase()}@example.com', '${['DE', 'US', 'FR', 'NL', 'SE', 'AT'][i % 6]}', '2026-0${1 + (i % 9)}-1${i % 10}');`));
  for (let i = 1; i <= 40; i++) sql.push(`INSERT INTO orders VALUES (${1000 + i}, ${1 + ((i * 7) % 12)}, ${(19.9 + ((i * 37) % 230) + (i % 3) * 0.5).toFixed(2)}, 'EUR', '${statuses[i % statuses.length]}', '2026-11-${String(1 + (i % 11)).padStart(2, '0')} ${String(8 + (i % 12)).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}');`);
  ['Desk Lamp', 'Notebook A5', 'Wireless Mouse', 'USB-C Hub'].forEach((p, i) => sql.push(`INSERT INTO products VALUES (${i + 1}, 'SKU-${100 + i}', '${p}', ${(14.5 + i * 11).toFixed(2)});`));
  execFileSync('/usr/bin/sqlite3', [file], { input: sql.join('\n') });
  return file;
}

function httpServer() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => setTimeout(() => {
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'X-Request-Id': 'req_7f3a91c2' }); res.end(JSON.stringify(data)); };
      if (req.method === 'POST' && req.url.startsWith('/v1/invoices')) {
        let input = {};
        try { input = JSON.parse(body || '{}'); } catch { /* echo empty */ }
        return send(201, { id: 'inv_2026_0042', object: 'invoice', status: 'open', customer: input.customer ?? 'cus_88', currency: input.currency ?? 'eur', lines: input.lines ?? [], amount_due: 12990, due_date: '2026-12-12', created: '2026-11-12T10:42:17Z' });
      }
      if (req.url.startsWith('/v1/customers')) return send(200, { data: [{ id: 'cus_88', name: 'Avery Stone', email: 'avery@example.com' }], has_more: false });
      send(404, { error: 'not_found' });
    }, 40));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function wsServer() {
  const { WebSocketServer } = requireRepo('ws');
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  wss.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'welcome', channel: 'orders', server: 'acme-events' }));
    socket.on('message', data => {
      let msg = {};
      try { msg = JSON.parse(String(data)); } catch { /* plain text */ }
      if (msg.type === 'subscribe') socket.send(JSON.stringify({ type: 'subscribed', topic: msg.topic }));
      else socket.send(String(data));
      if (msg.type === 'subscribe') setTimeout(() => socket.send(JSON.stringify({ type: 'order.paid', id: 'ord_1042', total: 129.9, currency: 'EUR' })), 150);
    });
  });
  return new Promise(resolve => wss.on('listening', () => resolve(wss)));
}

// Varied, fictitious access log for the api container.
const API_LOG = [
  'echo "$(date -u +%FT%TZ) INFO  api listening on :8080"',
  'echo "$(date -u +%FT%TZ) INFO  connected to postgres db:5432 (pool=10)"',
  'echo "$(date -u +%FT%TZ) INFO  connected to redis cache:6379"',
  'i=0; set -- "GET /v1/orders 200" "GET /v1/orders/ord_1042 200" "POST /v1/invoices 201" "GET /healthz 200" "GET /v1/customers/cus_88 200" "PATCH /v1/customers/cus_88 200" "GET /v1/orders?status=open 200" "POST /v1/webhooks/payment 202" "GET /v1/products 304" "DELETE /v1/sessions/s_81 204" "GET /v1/orders/ord_9 404"',
  'while :; do n=$((i % $# + 1)); eval "r=\\${$n}"; lvl=INFO; case "$r" in *404) lvl=WARN ;; esac; echo "$(date -u +%FT%TZ) $lvl  $r $((i * 7 % 40 + 2))ms"; i=$((i+1)); sleep 0.4; done',
].join('; ');

  // The app may only read its fixture containers: ps (filtered), version and a few read-only
  // subcommands whose container arguments must all be ours. No run/rm/stop/compose.
function dockerWrapper(docker, socket, tag, own) {
  // Absolute node path: the fixture shell's PATH is minimal.
  return `#!${process.execPath}
const { spawnSync } = require('node:child_process');
const D = ${JSON.stringify(docker)}, H = ${JSON.stringify(socket)}, TAG = ${JSON.stringify(tag)};
const OWN = new Set(${JSON.stringify(own)});
const [sub, ...rest] = process.argv.slice(2);
const pass = args => process.exit(spawnSync(D, ['--host', H, ...args], { stdio: 'inherit' }).status ?? 1);
const deny = () => { process.stderr.write('docker: command not available in the screenshot fixture\\n'); process.exit(64); };
if (sub === 'ps') pass(['ps', '--filter', 'label=ownshell.screenshots=' + TAG, ...rest]);
if (sub === 'version' || sub === '--version') pass([sub, ...rest]);
if (!['inspect', 'logs', 'stats', 'top', 'port', 'exec'].includes(sub)) deny();
// Positional args must be our containers; a token right after a flag may be that flag's value.
// exec: everything after the container is the command to run inside it.
let ownSeen = false;
for (let i = 0; i < rest.length; i += 1) {
  const token = rest[i];
  if (token.startsWith('-')) continue;
  if (OWN.has(token)) { ownSeen = true; if (sub === 'exec') break; continue; }
  const prev = rest[i - 1];
  if (prev && prev.startsWith('-') && !prev.includes('=')) continue;
  deny();
}
if (!ownSeen) deny();
pass([sub, ...rest]);
`;
}

async function dockerContainers(root) {
  const socket = process.env.OWNSHELL_PERF_DOCKER_HOST ?? `unix://${path.join(os.homedir(), '.orbstack', 'run', 'docker.sock')}`;
  try { if (!fs.statSync(socket.slice('unix://'.length)).isSocket()) return null; } catch { return null; }
  const docker = execFileSync('/usr/bin/which', ['docker'], { encoding: 'utf8' }).trim();
  const run = args => execFileSync(docker, ['--host', socket, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).trim();
  const tag = `ownshell-screenshots-${process.pid}`;
  const specs = [
    ['web', 'caddy:2.11.4-alpine', []],
    ['api', 'alpine:3.21', ['/bin/sh', '-c', API_LOG]],
    ['db', 'postgres:17-alpine', [], ['--env', 'POSTGRES_PASSWORD=screenshot-only']],
    ['cache', 'redis:7-alpine', []],
    ['worker', 'alpine:3.21', ['/bin/sh', '-c', 'echo "worker finished"']],
  ];
  const names = [];
  const ids = [];
  // Only containers this run created are ever removed, by their full ID.
  const close = () => { for (const id of ids) { try { run(['rm', '-f', id]); } catch { /* already gone */ } } ids.length = 0; };
  try {
    for (const [service, image, cmd, extra = []] of specs) {
      const name = `acme-shop-${service}-1`;
      try { run(['image', 'inspect', image]); } catch { continue; }
      // Never touch a container we did not create: an existing one with this name stops the fixture.
      let existing = '';
      try { existing = run(['ps', '-aq', '--filter', `name=^/${name}$`]); } catch { /* treat as none */ }
      if (existing) throw new Error(`a container named ${name} already exists; remove or rename it to capture docker.png`);
      const id = run(['run', '-d', '--name', name, '--label', `ownshell.screenshots=${tag}`, '--label', 'com.docker.compose.project=acme-shop', '--label', `com.docker.compose.service=${service}`, '--network', 'none', '--memory', '128m', ...extra, image, ...cmd]);
      names.push(name);
      ids.push(id);
    }
  } catch (error) { close(); throw error; }
  const own = [...names, ...ids, ...ids.map(id => id.slice(0, 12))];
  const wrapper = dockerWrapper(docker, socket, tag, own);
  const file = path.join(root, 'docker-wrapper');
  write(file, wrapper, 0o755);
  return { file, names, close };
}

async function start(root) {
  const docker = await dockerContainers(root).catch(error => { console.warn(`docker fixture unavailable: ${error.message.split('\n')[0]}`); return null; });
  let api, ws, home, remote, sqlite;
  try {
    home = localHome(root);
    remote = remoteHome(root, docker?.file);
    sqlite = sqliteFile(home);
    api = await httpServer();
    ws = await wsServer();
  } catch (error) {
    // Partial start: release what already exists before failing.
    docker?.close();
    api?.close();
    ws?.close();
    throw error;
  }
  return {
    localHome: home, remote, sqlite, docker,
    apiUrl: `http://127.0.0.1:${api.address().port}`,
    wsUrl: `ws://127.0.0.1:${ws.address().port}`,
    async close() {
      docker?.close();
      await new Promise(resolve => api.close(resolve));
      await new Promise(resolve => ws.close(resolve));
    },
  };
}

// SFTP fixture keeps files in memory; directories are created over SFTP itself.
async function seedSftp(ssh) {
  const { Client } = requireRepo('ssh2');
  const base = '/srv/acme-shop';
  const dirs = ['/srv', base, `${base}/app`, `${base}/config`, `${base}/logs`, `${base}/scripts`, `${base}/web`];
  const conn = new Client();
  await new Promise((resolve, reject) => conn.once('ready', resolve).once('error', reject).connect({ host: '127.0.0.1', port: ssh.port, username: 'benchmark', password: ssh.password }));
  const sftp = await new Promise((resolve, reject) => conn.sftp((error, s) => error ? reject(error) : resolve(s)));
  for (const dir of dirs) await new Promise(resolve => sftp.mkdir(dir, () => resolve()));
  conn.end();
  const files = {
    'docker-compose.yml': REPO_FILES['docker-compose.yml'], '.env.example': REPO_FILES['.env.example'], 'README.md': REPO_FILES['README.md'],
    'Makefile': REPO_FILES.Makefile, 'Caddyfile': 'shop.example.com {\n\treverse_proxy api:8080\n}\n', 'go.mod': REPO_FILES['go.mod'],
    'logs/api.log': 'INFO api listening on :8080\n'.repeat(900), 'scripts/deploy.sh': '#!/bin/sh\nset -eu\ndocker compose pull && docker compose up -d\n',
  };
  for (const [name, content] of Object.entries(files)) ssh.files.set(`${base}/${name}`, Buffer.from(content));
  return base;
}

module.exports = { dockerWrapper, start, seedSftp };
