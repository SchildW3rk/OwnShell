#!/usr/bin/env node

const { Module } = require('node:module');
const path = require('node:path');
const esbuild = require('esbuild');

async function runTest(name) {
  const testFile = path.join(__dirname, name);
  const result = await esbuild.build({
    entryPoints: [testFile],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'electron-test-mock',
        setup(build) {
          build.onResolve({ filter: /^electron$/ }, () => ({
            path: 'electron',
            namespace: 'electron-test-mock',
          }));
          build.onLoad({ filter: /.*/, namespace: 'electron-test-mock' }, () => ({
            loader: 'js',
            contents: `
              const ipcHandlers = new Map();
              exports.__testIpcMainHandlers = ipcHandlers;
              const crypto = require('node:crypto');
              const storageKey = crypto.randomBytes(32);
              exports.safeStorage = {
                isEncryptionAvailable: () => true,
                encryptString(value) {
                  const iv = crypto.randomBytes(12);
                  const cipher = crypto.createCipheriv('aes-256-gcm', storageKey, iv);
                  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
                  return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
                },
                decryptString(bytes) {
                  const decipher = crypto.createDecipheriv('aes-256-gcm', storageKey, bytes.subarray(0, 12));
                  decipher.setAuthTag(bytes.subarray(12, 28));
                  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
                }
              };
              exports.app = {
                isPackaged: true,
                getPath: () => process.env.TMPDIR || '/tmp',
                getVersion: () => '0.0.0-test'
              };
              exports.ipcMain = {
                handle(channel, handler) {
                  ipcHandlers.set(channel, handler);
                },
                on() {}
              };
              exports.BrowserWindow = class BrowserWindow {};
              exports.dialog = {};
              exports.shell = {};
            `,
          }));
        },
      },
    ],
  });

  const mod = new Module(testFile, module);
  mod.filename = testFile;
  mod.paths = Module._nodeModulePaths(__dirname);
  mod._compile(result.outputFiles[0].text, testFile);
}

async function main() {
  const testFiles = process.argv[2]
    ? [process.argv[2]]
    : require('node:fs').readdirSync(__dirname).filter((name) => name.endsWith('.test.ts')).sort();
  for (const name of testFiles) {
    try {
      await runTest(name);
    } catch (error) {
      console.error(`${name} failed:`, error);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
