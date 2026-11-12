// Prints the CSP sha256 sources for every inline <script> in the built docs,
// so the docs CSP can allow VitePress' inline scripts without 'unsafe-inline'.
// Usage: node docs/scripts/csp-hashes.mjs [distDir]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? new URL('../.vitepress/dist', import.meta.url).pathname;

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith('.html')) yield full;
  }
}

export function inlineScriptHashes(html) {
  const hashes = [];
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(attrs) || /type\s*=\s*["']?application\/(ld\+)?json/i.test(attrs)) continue;
    hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return hashes;
}

// Self-check against a known value: sha256("alert(1)").
const probe = inlineScriptHashes('<script>alert(1)</script><script src="/x.js"></script>');
if (probe.length !== 1 || probe[0] !== "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='") {
  throw new Error(`csp-hashes self-check failed: ${probe.join(' ')}`);
}

const all = new Set();
let files = 0;
for (const file of htmlFiles(dist)) {
  files++;
  for (const h of inlineScriptHashes(readFileSync(file, 'utf8'))) all.add(h);
}
if (files === 0) throw new Error(`No HTML files in ${dist}; build the docs first.`);
process.stdout.write([...all].sort().join(' '));
