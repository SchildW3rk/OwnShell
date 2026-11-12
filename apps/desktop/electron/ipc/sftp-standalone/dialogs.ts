import { dialog } from 'electron';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { errorResponse, getErrorMessage } from './helpers';
import { localDirectorySchema, openDialogSchema, saveDialogSchema } from './schemas';
import * as os from 'os';
import * as path from 'path';

export function registerSFTPDialogHandlers(): void {
  safeHandle('sftp:show-save-dialog', saveDialogSchema, async (_event, params) => {
    try {
      const defaultPath = params.defaultPath
        ? path.join(os.homedir(), 'Downloads', path.basename(params.defaultPath))
        : os.homedir();

      const result = await dialog.showSaveDialog({
        title: params.title || 'Save File',
        defaultPath,
      });

      return {
        success: true,
        canceled: result.canceled,
        filePath: result.filePath,
      };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:show-open-dialog', openDialogSchema, async (_event, params) => {
    try {
      const properties: Array<'openFile' | 'openDirectory' | 'multiSelections'> = [];

      if (params.directories) {
        properties.push('openDirectory');
      } else {
        properties.push('openFile');
      }

      if (params.multiple) {
        properties.push('multiSelections');
      }

      const result = await dialog.showOpenDialog({
        title: params.title || 'Select Files',
        properties,
      });

      return {
        success: true,
        canceled: result.canceled,
        filePaths: result.filePaths,
      };
    } catch (error) {
      return errorResponse(error);
    }
  });

  safeHandle('sftp:list-local-directory', localDirectorySchema, async (_event, params) => {
    try {
      const fs = await import('fs/promises');
      const pathModule = await import('path');

      const dirPath = params.path || os.homedir();
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      const files = await Promise.all(
        entries
          .filter((entry) => !entry.name.startsWith('.'))
          .map(async (entry) => {
            const fullPath = pathModule.join(dirPath, entry.name);
            try {
              const stats = await fs.stat(fullPath);
              return {
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                size: stats.size,
                modifiedAt: stats.mtimeMs,
              };
            } catch {
              return null;
            }
          })
      );

      const validFiles = files.filter((file): file is NonNullable<typeof file> => file !== null);
      validFiles.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      return { success: true, files: validFiles };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to list local directory', { path: params.path, error: errorMessage });
      return { success: false, error: { message: errorMessage } };
    }
  });
}
