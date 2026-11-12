'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

// Every byte shown by the Docker UI comes from this disposable real container.
// The wrapper only confines CLI requests to its explicit local daemon/container.
async function startDockerFixture(root) {
  const socket = process.env.OWNSHELL_PERF_DOCKER_HOST ?? `unix://${path.join(require('node:os').homedir(), '.orbstack', 'run', 'docker.sock')}`;
  if (!socket?.startsWith('unix:///') || !fs.statSync(socket.slice('unix://'.length)).isSocket()) {
    throw new Error('Docker fixture requires an existing local Unix socket; set OWNSHELL_PERF_DOCKER_HOST explicitly for non-OrbStack daemons');
  }
  const docker = (await run('/usr/bin/which', ['docker'], { timeout: 10000 })).stdout.trim();
  const name = `ownshell-perf-11-${process.pid}-${Date.now()}`;
  const label = `ownshell.performance.fixture=${name}`;
  const directory = path.join(root, 'docker-fixture');
  fs.mkdirSync(directory, { recursive: true });
  const cli = (...args) => run(docker, ['--host', socket, ...args], { maxBuffer: 16 * 1024 * 1024, timeout: 30000, killSignal: 'SIGKILL' });
  const generator = 'i=0; while :; do if [ ! -f /tmp/paused ]; then j=0; while [ "$j" -lt 100 ]; do printf "DOCKER_LOG %010d deterministic-container-output............................................................\\n" "$i"; i=$((i+1)); j=$((j+1)); done; fi; sleep 0.1; done';
  const image = JSON.parse((await cli('image', 'inspect', 'alpine:3.21')).stdout)[0];
  let id;
  try {
    id = (await cli('run', '-d', '--name', name, '--label', label, '--network', 'none', '--memory', '64m', '--cpus', '0.5', '--log-opt', 'max-size=8m', '--log-opt', 'max-file=2', 'alpine:3.21', '/bin/sh', '-c', generator)).stdout.trim();
    const wrapper = `#!/bin/sh\ncase "$1" in\n  ps) shift; exec ${quote(docker)} --host ${quote(socket)} ps --filter ${quote('label=' + label)} "$@" ;;\n  --version) exec ${quote(docker)} --host ${quote(socket)} "$@" ;;\n  logs|stats|inspect|exec|stop|start|restart)\n    case " $* " in *${quote(id)}*|*${quote(id.slice(0, 12))}*|*${quote(name)}*) exec ${quote(docker)} --host ${quote(socket)} "$@" ;; esac ;;\nesac\necho 'Docker fixture rejected command outside its disposable container' >&2\nexit 64\n`;
    fs.writeFileSync(path.join(directory, 'docker'), wrapper, { mode: 0o700 });
    return {
      id, name, image: { id: image.Id, repoDigests: image.RepoDigests },
      workload: { linesPerBatch: 100, batchIntervalMs: 100, linePrefix: 'DOCKER_LOG', network: 'none', memoryLimit: '64m', cpuLimit: 0.5 },
      enable(ssh) { ssh.enableProcessCommands({ cwd: directory, env: { PATH: `${directory}:/usr/bin:/bin:/usr/sbin:/sbin`, DOCKER_HOST: socket, PS1: 'docker-fixture$ ' }, shell: '/bin/sh', native: false, accepts: command => /\bdocker\b/.test(command) }); },
      async pause() { await cli('exec', id, '/bin/sh', '-c', 'touch /tmp/paused'); },
      async resume() { await cli('exec', id, '/bin/sh', '-c', 'rm -f /tmp/paused'); },
      async marker(value) { if (!/^[A-Z0-9_]+$/.test(value)) throw new Error('Unsafe fixture marker'); await cli('exec', id, '/bin/sh', '-c', `printf '${value}\\n' > /proc/1/fd/1`); },
      async close() { if (id) { await cli('rm', '-f', id); id = null; } },
    };
  } catch (error) {
    if (id) {
      try { await cli('rm', '-f', id); }
      catch (cleanupError) { error.fixtureCleanupError = cleanupError.message; }
    }
    throw error;
  }
}
module.exports = { startDockerFixture };
