import { BrowserWindow } from 'electron';
import { chmod, mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Kysely } from 'kysely';
import { z } from 'zod';
import { Database, HostQueries, KeyQueries } from '@ownshell/core';
import { logger } from '../logger';
import { localPtyManager } from '../pty/local-pty-manager';
import { cryptoManager } from '../security/crypto';
import { safeHandle } from './safe-ipc';

const nativeSshCreateSchema = z.object({
  hostId: z.string().min(1),
  cols: z.number().finite().positive().optional(),
  rows: z.number().finite().positive().optional(),
});

interface NativeSshKeyMaterial {
  keyPath?: string;
  cleanupPath?: string;
}

export function setupNativeSshHandlers(mainWindow: BrowserWindow, db: Kysely<Database>): void {
  const hostQueries = new HostQueries(db);
  const keyQueries = new KeyQueries(db);
  localPtyManager.setMainWindow(mainWindow);

  safeHandle('native-ssh:create', nativeSshCreateSchema, async (_event, params) => {
    let keyMaterial: NativeSshKeyMaterial = {};

    try {
      if (!cryptoManager.isUnlocked()) {
        throw new Error('App is locked. Please unlock to connect.');
      }

      const host = await hostQueries.getById(params.hostId);
      if (!host) {
        throw new Error(`Host not found: ${params.hostId}`);
      }

      if (host.jump_host_id) {
        throw new Error('Native OpenSSH terminal does not support OwnShell jump hosts yet.');
      }

      const args = [
        '-tt',
        '-o',
        'ServerAliveInterval=30',
        '-o',
        'ServerAliveCountMax=3',
        '-o',
        'TCPKeepAlive=yes',
        '-p',
        String(normalizePort(host.port)),
      ];

      if (host.auth_type === 'key' && host.key_id) {
        const key = await keyQueries.getById(host.key_id);
        if (!key?.private_key_encrypted) {
          throw new Error('SSH key not found in database');
        }

        const privateKey = normalizePrivateKey(cryptoManager.decryptData(key.private_key_encrypted));
        keyMaterial = await writeTemporaryPrivateKey(privateKey);
        args.push('-i', keyMaterial.keyPath!, '-o', 'IdentitiesOnly=yes');
      } else if (host.auth_type === 'password') {
        args.push('-o', 'PreferredAuthentications=password,keyboard-interactive,publickey');
      }

      args.push(`${host.username}@${host.hostname}`);

      const result = localPtyManager.create({
        shell: '/usr/bin/ssh',
        args,
        cols: params.cols,
        rows: params.rows,
        env: {
          TERM_PROGRAM: 'OwnShell',
        },
        cleanupPaths: keyMaterial.cleanupPath ? [keyMaterial.cleanupPath] : [],
      });

      logger.info('Native OpenSSH PTY created', {
        sessionId: result.sessionId,
        hostId: host.id,
        hostname: host.hostname,
        username: host.username,
        authType: host.auth_type,
        hasTempKey: Boolean(keyMaterial.keyPath),
      });

      return { success: true, ...result };
    } catch (error) {
      if (keyMaterial.cleanupPath) {
        try {
          await rm(keyMaterial.cleanupPath, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup. The PTY manager handles cleanup after successful spawns.
        }
      }

      logger.error('Failed to create native OpenSSH PTY', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create native OpenSSH PTY',
      };
    }
  });

  logger.info('Native OpenSSH IPC handlers registered');
}

function normalizePort(port: number): number {
  if (!Number.isFinite(port)) return 22;
  return Math.min(65535, Math.max(1, Math.floor(port)));
}

function normalizePrivateKey(privateKey: string): string {
  const normalized = privateKey.trim();
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

async function writeTemporaryPrivateKey(privateKey: string): Promise<NativeSshKeyMaterial> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ownshell-ssh-'));
  await chmod(tempDir, 0o700);

  const keyPath = path.join(tempDir, 'id_ownshell');
  await writeFile(keyPath, privateKey, { mode: 0o600 });
  await chmod(keyPath, 0o600);

  return { keyPath, cleanupPath: tempDir };
}
