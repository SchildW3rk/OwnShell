import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const repoRoot = resolve(packageDir, '..', '..');
const privateKeyPath = resolve(repoRoot, '.secrets', 'ownshell-license-private-key.jwk');
const wranglerTomlPath = resolve(packageDir, 'wrangler.toml');

const results = [];

function pass(label) {
  results.push({ ok: true, label });
}

function fail(label, detail) {
  results.push({ ok: false, label, detail });
}

function checkPrivateKey() {
  if (!existsSync(privateKeyPath)) {
    fail('Private entitlement key exists locally', `${privateKeyPath} is missing`);
    return;
  }

  try {
    const jwk = JSON.parse(readFileSync(privateKeyPath, 'utf8'));
    if (
      jwk?.kty !== 'EC' ||
      jwk?.crv !== 'P-256' ||
      typeof jwk?.x !== 'string' ||
      typeof jwk?.y !== 'string' ||
      typeof jwk?.d !== 'string'
    ) {
      fail('Private entitlement key is a P-256 private JWK', 'Unexpected JWK shape');
      return;
    }

    pass('Private entitlement key is present and valid');
  } catch (error) {
    fail(
      'Private entitlement key is readable JSON',
      error instanceof Error ? error.message : 'Invalid JSON'
    );
  }
}

function checkWranglerToml() {
  const toml = readFileSync(wranglerTomlPath, 'utf8');
  const required = [
    'ACTION_DEVICE_RATE_LIMITER',
    'ACTION_IP_RATE_LIMITER',
    'REFRESH_DEVICE_RATE_LIMITER',
    'REFRESH_IP_RATE_LIMITER',
  ];
  const missing = required.filter(
    (name) => !new RegExp(`^\\s*name\\s*=\\s*"${name}"`, 'm').test(toml)
  );

  if (!/^\s*\[\[ratelimits\]\]/m.test(toml) || missing.length > 0) {
    fail('Rate limit bindings are configured', `Missing: ${missing.join(', ') || '[[ratelimits]]'}`);
    return;
  }

  pass('Rate limit bindings are configured');
}

function checkWranglerAuth() {
  try {
    execFileSync('npx', ['wrangler', 'whoami'], {
      cwd: packageDir,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    pass('Wrangler is authenticated');
  } catch {
    fail('Wrangler is authenticated', 'Run: volta run --node 22.22.0 npx wrangler login');
  }
}

checkPrivateKey();
checkWranglerToml();
checkWranglerAuth();

for (const result of results) {
  const prefix = result.ok ? '[ok]' : '[missing]';
  console.log(`${prefix} ${result.label}`);
  if (result.detail) {
    console.log(`      ${result.detail}`);
  }
}

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}
