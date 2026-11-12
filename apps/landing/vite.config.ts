import { readFileSync } from 'node:fs';
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

const desktopPackage = JSON.parse(
  readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8')
) as { version: string };
const desktopVersion = desktopPackage.version;

function ownShellMetadataPlugin(): PluginOption {
  return {
    name: 'ownshell-metadata',
    transformIndexHtml(html) {
      return html.replaceAll('__OWNSHELL_DESKTOP_VERSION__', desktopVersion);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __OWNSHELL_DESKTOP_VERSION__: JSON.stringify(desktopVersion),
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-motion': ['motion'],
        },
      },
    },
  },
  plugins: [
    react(),
    ownShellMetadataPlugin(),
    // Cast needed due to Vite version mismatch in monorepo (root: 5.x, landing: 7.x)
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
    }) as unknown as PluginOption,
  ],
});
