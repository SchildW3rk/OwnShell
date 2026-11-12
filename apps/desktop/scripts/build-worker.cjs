/**
 * Build script for SSH Worker Thread
 *
 * Uses esbuild to bundle the worker separately from the main Electron build.
 * Worker must be built before running the app (dev or production).
 *
 * Output: dist-electron/ssh-worker.js
 */

const esbuild = require('esbuild');
const path = require('path');

const isDev = process.argv.includes('--dev');

async function buildWorker() {
  const startTime = Date.now();

  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, '../electron/ssh/ssh-worker.ts')],
      bundle: true,
      platform: 'node',
      target: 'node20',
      outfile: path.join(__dirname, '../dist-electron/ssh-worker.js'),
      external: [
        // Native modules - must be loaded at runtime
        'ssh2',
        'better-sqlite3',
        // Electron - not available in worker, but referenced by shared types
        'electron',
      ],
      format: 'cjs',
      sourcemap: isDev ? 'inline' : false,
      minify: !isDev,
      // Define for conditional compilation
      define: {
        'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
      },
      // Log level
      logLevel: 'info',
    });

    const elapsed = Date.now() - startTime;
    console.log(`\x1b[32m✓ SSH Worker built successfully (${elapsed}ms)\x1b[0m`);
  } catch (error) {
    console.error('\x1b[31m✗ Failed to build SSH Worker:\x1b[0m', error);
    process.exit(1);
  }
}

buildWorker();
