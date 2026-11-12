/**
 * Electron Main Process
 *
 * Entry point for the OwnShell desktop app
 */

import {
  app,
  autoUpdater as nativeAutoUpdater,
  BrowserWindow,
  shell,
  Menu,
  session,
  protocol,
} from 'electron';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { initDatabase, runMigrations, closeDatabase } from './db/init';
import { cryptoManager } from './security/crypto';
import { setupDatabaseHandlers } from './ipc/database';
import { setupCryptoHandlers } from './ipc/crypto';
import { setupSSHHandlers, cleanupAllSSHSessions } from './ipc/ssh';
import { setupS3Handlers, cleanupS3Clients } from './ipc/s3';
import { setupFilePickerHandlers } from './ipc/file-picker';
import { setupBackupHandlers } from './ipc/backup';
import { setupLicenseHandlers } from './ipc/license';
import { setupDBExplorerHandlers, cleanupAllDBConnections } from './ipc/database-explorer';
import { setupSFTPStandaloneHandlers } from './ipc/sftp-standalone';
import { setupVaultHandlers } from './ipc/vault';
import { setupApiClientHandlers } from './ipc/api-client';
import { setupLocalPtyHandlers, cleanupLocalPtySessions } from './ipc/local-pty';
import { setupLocalDockerHandlers } from './ipc/local-docker';
import { setupNativeSshHandlers } from './ipc/native-ssh';
import { setupAutoUpdater } from './ipc/updater';
import { setupReleasesHandlers } from './ipc/releases';
import { safeHandle } from './ipc/safe-ipc';
import { sftpConnectionManager } from './sftp/sftp-connection-manager';
import { licenseManager } from './license/license-manager';
import { runDevelopmentSeeder } from './dev/seeder';
import { buildContentSecurityPolicy } from './security/content-security-policy';
import { z } from 'zod';
import { noPayloadSchema } from './ipc/schemas/common';

const booleanSchema = z.boolean();

// Globals
let mainWindow: BrowserWindow | null = null;
let db: any = null;
let contentSecurityPolicyInstalled = false;
let appProtocolInstalled = false;
let quitCleanupStarted = false;
let quitCleanupComplete = false;
let allowWindowClose = false;

const APP_PROTOCOL = 'ownshell';
const APP_PROTOCOL_HOST = 'app';

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

type ResponseHeaders = Record<string, string | string[]>;

function getDevelopmentServerUrl(): string | undefined {
  return !app.isPackaged && process.env.VITE_DEV_SERVER_URL
    ? process.env.VITE_DEV_SERVER_URL
    : undefined;
}

function isDevelopmentRuntime(): boolean {
  return Boolean(getDevelopmentServerUrl());
}

function getProductionIndexPath(): string {
  return path.resolve(__dirname, '../dist/index.html');
}

function getProductionDistRoot(): string {
  return path.dirname(getProductionIndexPath());
}

function getProductionAppUrl(): string {
  return `${APP_PROTOCOL}://${APP_PROTOCOL_HOST}/index.html`;
}

function isExternalUrl(url: string): boolean {
  return url.startsWith('https:') || url.startsWith('http:');
}

function isExternalOpenUrl(url: string): boolean {
  return isExternalUrl(url) || url.startsWith('mailto:');
}

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    default:
      return 'application/octet-stream';
  }
}

function resolveAppProtocolFile(requestUrl: string): string | null {
  try {
    const parsedUrl = new URL(requestUrl);
    if (parsedUrl.protocol !== `${APP_PROTOCOL}:` || parsedUrl.hostname !== APP_PROTOCOL_HOST) {
      return null;
    }

    const relativePath = decodeURIComponent(parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname);
    const distRoot = getProductionDistRoot();
    const resolvedPath = path.normalize(path.join(distRoot, relativePath));
    const normalizedRoot = path.normalize(`${distRoot}${path.sep}`);

    if (resolvedPath !== distRoot && !resolvedPath.startsWith(normalizedRoot)) {
      return null;
    }

    return resolvedPath;
  } catch {
    return null;
  }
}

function installAppProtocol(): void {
  if (appProtocolInstalled) {
    return;
  }

  protocol.handle(APP_PROTOCOL, async (request) => {
    const filePath = resolveAppProtocolFile(request.url);
    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }

    try {
      const file = await fs.promises.readFile(filePath);
      const headers: Record<string, string> = {
        'Content-Type': getMimeType(filePath),
        'X-Content-Type-Options': 'nosniff',
      };

      if (path.extname(filePath).toLowerCase() === '.html') {
        headers['Content-Security-Policy'] = buildContentSecurityPolicy(false);
      }

      return new Response(file, {
        headers,
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  appProtocolInstalled = true;
}

function isAllowedAppNavigation(url: string, devServerUrl?: string): boolean {
  try {
    const parsedUrl = new URL(url);

    if (devServerUrl) {
      return parsedUrl.origin === new URL(devServerUrl).origin;
    }

    return parsedUrl.href === getProductionAppUrl();
  } catch {
    return false;
  }
}

function withContentSecurityPolicyHeader(
  responseHeaders: ResponseHeaders | undefined,
  contentSecurityPolicy: string
): ResponseHeaders {
  const headers: ResponseHeaders = { ...(responseHeaders ?? {}) };

  for (const headerName of Object.keys(headers)) {
    if (headerName.toLowerCase() === 'content-security-policy') {
      delete headers[headerName];
    }
  }

  headers['Content-Security-Policy'] = [contentSecurityPolicy];
  return headers;
}

function installContentSecurityPolicy(devServerUrl?: string): void {
  if (contentSecurityPolicyInstalled) {
    return;
  }

  const contentSecurityPolicy = buildContentSecurityPolicy(Boolean(devServerUrl));

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (
      details.resourceType !== 'mainFrame' ||
      !isAllowedAppNavigation(details.url, devServerUrl)
    ) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    callback({
      responseHeaders: withContentSecurityPolicyHeader(
        details.responseHeaders,
        contentSecurityPolicy
      ),
    });
  });

  contentSecurityPolicyInstalled = true;
}

/**
 * Create the main application window
 */
function createWindow() {
  logger.info('Creating main window');
  const devServerUrl = getDevelopmentServerUrl();
  const isDevelopment = Boolean(devServerUrl);

  if (!isDevelopment) {
    installAppProtocol();
  }

  installContentSecurityPolicy(devServerUrl);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    frame: false,
    backgroundColor: '#1E1E1E',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Security best practice
      contextIsolation: true, // Security best practice
      sandbox: true,
    },
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 15, y: 15 },
  });

  // Intercept new window creation (links, window.open, etc.)
  // Opens external URLs in system default browser instead of Electron popup
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Security check: Only open web links and mailto links externally.
    if (isExternalOpenUrl(url)) {
      void shell.openExternal(url);
    }
    // Prevent Electron from creating its own browser window
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url, devServerUrl)) {
      return;
    }

    event.preventDefault();
    logger.warn('Blocked unauthorized top-level navigation', { url });

    if (isExternalOpenUrl(url)) {
      void shell.openExternal(url);
    }
  });

  // Setup IPC handlers BEFORE loading the window to prevent race conditions
  setupIPC(mainWindow);

  // Create application menu with Edit menu (required for copy/paste to work)
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    // macOS App menu
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    // Edit menu (required for copy/paste shortcuts)
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    // View menu (dev tools only in development)
    ...(isDevelopment
      ? [
          {
            label: 'View',
            submenu: [
              {
                label: 'Toggle DevTools',
                accelerator: 'F12',
                click: () => {
                  if (mainWindow?.webContents.isDevToolsOpened()) {
                    mainWindow?.webContents.closeDevTools();
                  } else {
                    mainWindow?.webContents.openDevTools({ mode: 'bottom' });
                  }
                },
              },
              {
                label: 'Reload',
                accelerator: 'CmdOrCtrl+R',
                click: () => {
                  mainWindow?.reload();
                },
              },
            ],
          },
        ]
      : []),
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Enable console messages from renderer process
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logger.info(`[RENDERER] ${message}`, { level, line, sourceId });
  });

  // Track loading errors
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      logger.error('Failed to load URL', { errorCode, errorDescription, validatedURL });
    }
  );

  let lastRendererRecoveryAt = 0;

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process gone', details);

    const now = Date.now();
    const currentWindow = mainWindow;
    if (!currentWindow || now - lastRendererRecoveryAt < 30_000 || currentWindow.isDestroyed()) {
      return;
    }

    lastRendererRecoveryAt = now;
    currentWindow.reload();
  });

  mainWindow.on('unresponsive', () => {
    logger.warn('Main window renderer became unresponsive');
  });

  // Load the app
  if (devServerUrl) {
    // Development mode
    logger.info('Starting in development mode', { url: devServerUrl });

    // IMMEDIATELY open DevTools BEFORE loading URL (helps debug loading issues)
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    logger.info('DevTools opened BEFORE page load');

    mainWindow.loadURL(devServerUrl).catch((err) => {
      logger.error('Failed to load Vite URL', err);
    });

    // Track loading progress
    mainWindow.webContents.on('did-start-loading', () => {
      logger.info('Page started loading');
    });

    mainWindow.webContents.on('did-finish-load', () => {
      logger.info('Page finished loading successfully');
    });
  } else {
    // Production mode
    logger.info('Starting in production mode');
    mainWindow.loadURL(getProductionAppUrl()).catch((err) => {
      logger.error('Failed to load production app URL', err);
    });
  }

  // Add keyboard shortcut to toggle DevTools (F12 or Ctrl+Shift+I)
  if (isDevelopment) {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown') {
        if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
          logger.info('DevTools keyboard shortcut triggered');

          // Check if DevTools are open
          if (mainWindow?.webContents.isDevToolsOpened()) {
            logger.info('Closing DevTools');
            mainWindow?.webContents.closeDevTools();
          } else {
            logger.info('Opening DevTools in bottom mode');
            mainWindow?.webContents.openDevTools({ mode: 'bottom' });
          }
        }
      }
    });
  }

  // macOS keeps running without windows. Hide instead of destroying the window so the
  // IPC handlers (registered once, bound to this window) stay valid when the dock icon reopens it.
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !quitCleanupStarted && !allowWindowClose) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logger.info('Main window created successfully');
}

/**
 * Initialize the application
 */
async function initializeApp() {
  try {
    logger.info('Initializing OwnShell application');

    // Initialize database (better-sqlite3)
    db = await initDatabase();

    // Run migrations
    await runMigrations(db);

    // Initialize crypto manager
    cryptoManager.init(db);

    // Initialize license manager
    licenseManager.init(db);

    // Run development seeder (auto-setup for dev mode)
    await runDevelopmentSeeder(db);

    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application', error);
    app.quit();
  }
}

/**
 * Setup IPC handlers
 */
let ipcRegistered = false;

function setupIPC(window: BrowserWindow) {
  // ipcMain.handle throws on duplicate channels; handlers must only be registered once.
  if (ipcRegistered) return;
  ipcRegistered = true;
  logger.info('Setting up IPC handlers');

  // Database handlers
  setupDatabaseHandlers(db);

  // Crypto handlers
  setupCryptoHandlers(window, db);

  // SSH handlers
  setupSSHHandlers(window, db);

  // S3 handlers
  setupS3Handlers(db);

  // File picker handlers
  setupFilePickerHandlers(window);

  // Backup handlers
  setupBackupHandlers(db, window);

  // License handlers
  setupLicenseHandlers(window);

  // Database Explorer handlers
  setupDBExplorerHandlers(window, db);

  // SFTP Standalone handlers (v1.16.0)
  setupSFTPStandaloneHandlers(window, db);

  // Vault handlers (v1.17.0 Admin Vault & ENV Manager)
  setupVaultHandlers(db);

  // API Client handlers (v1.18.0)
  setupApiClientHandlers(db);

  // Local PTY handlers (macOS-only for now)
  setupLocalPtyHandlers(window);

  // Local Docker handlers (no SSH session required)
  setupLocalDockerHandlers();

  // Native OpenSSH terminal handlers (macOS-only for now)
  setupNativeSshHandlers(window, db);

  // Release notes handlers (What's New)
  setupReleasesHandlers();

  // App version handler - always available (used by What's New feature)
  safeHandle('updater:version', noPayloadSchema, () => app.getVersion());

  // Auto-updater (v1.18.0) - only in production
  if (!isDevelopmentRuntime() && !(!app.isPackaged && process.env.OWNSHELL_BENCHMARK === '1')) {
    setupAutoUpdater(window, db);
  } else {
    // Dev mode: register stub handlers to prevent errors
    logger.info('Dev mode: registering stub updater handlers');
    safeHandle('updater:getAutoUpdate', noPayloadSchema, () => ({ enabled: false }));
    safeHandle('updater:setAutoUpdate', booleanSchema, () => ({ success: true }));
    safeHandle('updater:getState', noPayloadSchema, () => ({
      status: 'idle',
      autoUpdateEnabled: false,
      updatedAt: Date.now(),
    }));
    safeHandle('updater:check', noPayloadSchema, () => {
      logger.info('Dev mode: update check skipped');
      return null;
    });
    safeHandle('updater:download', noPayloadSchema, () => {
      logger.info('Dev mode: update download skipped');
      return null;
    });
  }

  logger.info('IPC handlers setup complete');
}

/**
 * App lifecycle events
 */

// App is ready
app.whenReady().then(async () => {
  logger.info('Electron app ready');

  // Initialize app (DB, crypto, etc.)
  await initializeApp();

  // Create window (IPC handlers are setup inside createWindow before loading)
  createWindow();

  // macOS: Show the hidden window again when the dock icon is clicked
  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  if (process.platform === 'darwin') {
    // quitAndInstall closes windows before emitting before-quit; let them close for real.
    nativeAutoUpdater.on('before-quit-for-update', () => {
      allowWindowClose = true;
    });
  }
});

// All windows closed
app.on('window-all-closed', () => {
  // macOS: Don't quit app when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

async function performQuitCleanup() {
  logger.info('Application quitting');

  // Native PTYs must finish before Electron tears down Node.
  await cleanupLocalPtySessions();

  // Cleanup all SFTP standalone connections (v1.16.0)
  await sftpConnectionManager.disconnectAll();

  // Cleanup all database connections
  await cleanupAllDBConnections();

  // Cleanup all SSH sessions
  await cleanupAllSSHSessions();

  // Cleanup S3 clients
  cleanupS3Clients();

  // Lock app (wipe master key from memory)
  cryptoManager.lock();

  // Close database
  if (db) {
    closeDatabase(db);
  }
}

// App is quitting
app.on('before-quit', (event) => {
  if (quitCleanupComplete) return;

  event.preventDefault();
  if (quitCleanupStarted) return;

  quitCleanupStarted = true;
  void performQuitCleanup()
    .catch((error) => {
      logger.error('Failed during application quit cleanup', error);
    })
    .finally(() => {
      quitCleanupComplete = true;
      app.quit();
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
});

logger.info('Main process started');
