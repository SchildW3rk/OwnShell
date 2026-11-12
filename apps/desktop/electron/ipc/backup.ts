/**
 * Backup IPC Handlers
 *
 * Handles encrypted vault export and import operations
 */

import { dialog, BrowserWindow } from 'electron';
import { writeFile, readFile } from 'fs/promises';
import { Kysely } from 'kysely';
import { z } from 'zod';
import { Database } from '@ownshell/core';
import { BackupManager } from '../backup/backup-manager';
import { VAULT_EXTENSION, ExportResult, ImportResult, VaultCounts, countVaultItems } from '../backup/types';
import { logger } from '../logger';
import { safeHandle } from './safe-ipc';

const backupPasswordSchema = z.string().min(4).max(1024);

/**
 * Setup backup IPC handlers
 */
export function setupBackupHandlers(db: Kysely<Database>, mainWindow: BrowserWindow) {
  const backupManager = new BackupManager(db);

  logger.info('Setting up backup IPC handlers');

  /**
   * Export vault to file
   *
   * Opens save dialog, encrypts data, writes to file
   */
  safeHandle(
    'system:backup:export',
    backupPasswordSchema,
    async (_event, password): Promise<ExportResult> => {
      try {
        logger.info('IPC: system:backup:export');

        if (!password || password.length < 4) {
          return {
            success: false,
            error: 'Password must be at least 4 characters',
          };
        }

        // Generate default filename with date
        const date = new Date().toISOString().split('T')[0];
        const defaultFilename = `ownshell-backup-${date}${VAULT_EXTENSION}`;

        // Show save dialog
        const result = await dialog.showSaveDialog(mainWindow, {
          title: 'Export Encrypted Backup',
          defaultPath: defaultFilename,
          filters: [
            { name: 'OwnShell Vault', extensions: ['ownshell-vault'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (result.canceled || !result.filePath) {
          return {
            success: false,
            error: 'Export canceled',
          };
        }

        // Export vault
        const vaultBuffer = await backupManager.exportVault(password);

        // Write to file
        await writeFile(result.filePath, vaultBuffer);

        logger.info('Vault exported successfully', {
          path: result.filePath,
          size: vaultBuffer.length,
        });

        return {
          success: true,
          filePath: result.filePath,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        logger.error('Vault export failed', error);
        return {
          success: false,
          error: message,
        };
      }
    }
  );

  /**
   * Import vault from file
   *
   * Opens file dialog, decrypts data, restores to database
   */
  safeHandle(
    'system:backup:import',
    backupPasswordSchema,
    async (_event, password): Promise<ImportResult> => {
      try {
        logger.info('IPC: system:backup:import');

        if (!password) {
          return {
            success: false,
            error: 'Password is required',
          };
        }

        // Show open dialog
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Import Encrypted Backup',
          filters: [
            { name: 'OwnShell Vault', extensions: ['ownshell-vault'] },
            { name: 'All Files', extensions: ['*'] },
          ],
          properties: ['openFile'],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return {
            success: false,
            error: 'Import canceled',
          };
        }

        const filePath = result.filePaths[0];

        // Read file
        const vaultBuffer = await readFile(filePath);

        logger.info('Vault file loaded', {
          path: filePath,
          size: vaultBuffer.length,
        });

        // Decrypt vault
        const vaultData = await backupManager.decryptVault(vaultBuffer, password);

        // Restore to database (atomic transaction)
        await backupManager.restoreVault(vaultData);

        logger.info('Vault imported successfully');

        return {
          success: true,
          counts: countVaultItems(vaultData),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed';
        logger.error('Vault import failed', error);
        return {
          success: false,
          error: message,
        };
      }
    }
  );

  /**
   * Preview vault contents without importing
   *
   * Decrypts and returns item counts for confirmation UI
   */
  safeHandle(
    'system:backup:preview',
    backupPasswordSchema,
    async (
      _event,
      password
    ): Promise<{
      success: boolean;
      preview?: {
        exportedAt: number;
        appVersion: string;
        counts: VaultCounts;
      };
      error?: string;
    }> => {
      try {
        logger.info('IPC: system:backup:preview');

        // Show open dialog
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Select Backup File',
          filters: [
            { name: 'OwnShell Vault', extensions: ['ownshell-vault'] },
            { name: 'All Files', extensions: ['*'] },
          ],
          properties: ['openFile'],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return {
            success: false,
            error: 'Selection canceled',
          };
        }

        const filePath = result.filePaths[0];
        const vaultBuffer = await readFile(filePath);

        // Decrypt to get preview
        const vaultData = await backupManager.decryptVault(vaultBuffer, password);

        return {
          success: true,
          preview: {
            exportedAt: vaultData.exportedAt,
            appVersion: vaultData.appVersion,
            counts: countVaultItems(vaultData),
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preview failed';
        logger.error('Vault preview failed', error);
        return {
          success: false,
          error: message,
        };
      }
    }
  );

  logger.info('Backup IPC handlers setup complete');
}
