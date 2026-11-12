import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

function rendererManualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;

  const normalizedId = id.replaceAll('\\', '/');

  if (
    normalizedId.includes('/react/') ||
    normalizedId.includes('/react-dom/') ||
    normalizedId.includes('/scheduler/') ||
    normalizedId.includes('/@tanstack/react-query/') ||
    normalizedId.includes('/zustand/')
  ) {
    return 'vendor-react';
  }

  if (
    normalizedId.includes('/i18next/') ||
    normalizedId.includes('/react-i18next/') ||
    normalizedId.includes('/i18next-browser-languagedetector/')
  ) {
    return 'vendor-i18n';
  }

  if (normalizedId.includes('/lucide-react/')) {
    return 'vendor-icons';
  }

  if (normalizedId.includes('/@codemirror/lang-')) {
    return 'vendor-editor-langs';
  }

  if (normalizedId.includes('/@lezer/')) {
    return 'vendor-editor-lezer';
  }

  if (
    normalizedId.includes('/@codemirror/') ||
    normalizedId.includes('/codemirror/')
  ) {
    return 'vendor-editor';
  }

  if (normalizedId.includes('/@xterm/')) {
    return 'vendor-terminal';
  }

  if (normalizedId.includes('/recharts/') || normalizedId.includes('/d3-')) {
    return 'vendor-charts';
  }

  if (normalizedId.includes('/zod/')) {
    return 'vendor-validation';
  }

  return undefined;
}

// Release date this build reports for license coverage ("updates until"). Production builds only:
// CI can pin it via OWNSHELL_RELEASED_AT (ISO 8601), otherwise build time. Dev servers report none.
function releasedAtDefine(command: 'build' | 'serve'): string {
  if (command !== 'build') return 'undefined';
  const pinned = process.env.OWNSHELL_RELEASED_AT;
  if (pinned && !Number.isFinite(Date.parse(pinned))) {
    throw new Error(`OWNSHELL_RELEASED_AT is not a valid ISO 8601 date: ${pinned}`);
  }
  return JSON.stringify(pinned || new Date().toISOString());
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    react(),
    electron({
      main: {
        // Main process entry file
        entry: 'electron/main.ts',
        vite: {
          define: {
            __OWNSHELL_RELEASED_AT__: releasedAtDefine(command),
          },
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: (id) => {
                // Always external - native bindings that must be loaded at runtime
                const alwaysExternal = [
                  'better-sqlite3',
                  'ssh2',
                  'node-pty',
                  'electron-log',
                  'pg-native',
                ];
                if (alwaysExternal.includes(id)) return true;

                // MongoDB optional peer dependencies (auth, compression, cloud)
                const mongoOptional = [
                  'kerberos',
                  '@mongodb-js/zstd',
                  'snappy',
                  'mongodb-client-encryption',
                  '@aws-sdk/credential-providers',
                  'gcp-metadata',
                  'socks',
                ];
                if (mongoOptional.some((pkg) => id === pkg || id.startsWith(pkg + '/'))) {
                  return true;
                }

                return false;
              },
            },
          },
        },
      },
      preload: {
        // Preload scripts
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
      // Enable hot reload for Electron main process
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron'),
    },
  },
  // Base path for production
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: rendererManualChunks,
      },
    },
  },
  server: {
    port: 5173,
  },
}));
