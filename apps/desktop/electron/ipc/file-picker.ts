/**
 * File Picker IPC Handlers
 *
 * Provides file/folder selection dialogs for the renderer process
 */

import { dialog, BrowserWindow } from 'electron';
import { readFile, stat } from 'fs/promises';
import { utils } from 'ssh2';
import { noPayloadSchema } from './schemas/common';
import { logger } from '../logger';
import { safeHandle } from './safe-ipc';

const MAX_SSH_KEY_FILE_SIZE = 1024 * 1024;

/**
 * Setup file picker IPC handlers
 */
export function setupFilePickerHandlers(mainWindow: BrowserWindow) {
  logger.info('Setting up file picker IPC handlers');

  /**
   * Open file dialog for SSH private key
   */
  safeHandle('file-picker:open-ssh-key', noPayloadSchema, async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import SSH Private Key',
        properties: ['openFile', 'showHiddenFiles'], // WICHTIG: showHiddenFiles muss bleiben!
        // filters removed completely for Linux/GTK compatibility
        // Without filters, the OS allows all files by default, including extensionless files
      });

      if (result.canceled || result.filePaths.length === 0) {
        return {
          success: false,
          canceled: true,
        };
      }

      const filePath = result.filePaths[0];
      const fileStats = await stat(filePath);
      if (fileStats.size > MAX_SSH_KEY_FILE_SIZE) {
        return {
          success: false,
          error: {
            message: 'SSH private key file is too large',
            code: 'FILE_TOO_LARGE',
          },
        };
      }

      // Read file content
      const content = await readFile(filePath, 'utf-8');

      // Validate it looks like a private key
      if (!content.includes('PRIVATE KEY')) {
        return {
          success: false,
          error: {
            message: 'File does not appear to be a valid SSH private key',
            code: 'INVALID_KEY_FORMAT',
          },
        };
      }

      // OpenSSH stores every key type as "BEGIN OPENSSH PRIVATE KEY", so parse the real type when possible.
      const parsed = utils.parseKey(content);
      const parsedType = parsed instanceof Error ? undefined : (Array.isArray(parsed) ? parsed[0] : parsed).type;
      const keyType: 'rsa' | 'ed25519' =
        parsedType === 'ssh-ed25519' ||
        (!parsedType && (content.includes('BEGIN OPENSSH PRIVATE KEY') || content.includes('ssh-ed25519')))
          ? 'ed25519'
          : 'rsa';

      logger.info('SSH key file selected and read', {
        path: filePath,
        type: keyType,
        size: content.length,
      });

      return {
        success: true,
        filePath,
        content,
        keyType,
      };
    } catch (error) {
      logger.error('Failed to open/read SSH key file', error);

      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to read key file',
          code: 'READ_ERROR',
        },
      };
    }
  });

  /**
   * Open file dialog for SQLite database file
   */
  safeHandle('file-picker:open-sqlite-file', noPayloadSchema, async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select SQLite Database File',
        properties: ['openFile'],
        filters: [
          { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return {
          success: false,
          canceled: true,
        };
      }

      const filePath = result.filePaths[0];

      logger.info('SQLite file selected', { path: filePath });

      return {
        success: true,
        filePath,
      };
    } catch (error) {
      logger.error('Failed to select SQLite file', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to select file',
      };
    }
  });

  logger.info('File picker IPC handlers setup complete');
}
