import * as fs from 'fs';
import type { DBConnectionConfig } from '@ownshell/core';
import type { ProgressCallback } from './types';

export async function exportSQLite(
  config: DBConnectionConfig,
  outputPath: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string; outputPath: string }> {
  const dbPath = config.host;

  if (!dbPath) {
    throw new Error('SQLite database path not specified');
  }

  onProgress?.({
    bytesProcessed: 0,
    stage: 'exporting',
    message: 'Copying SQLite database...',
  });

  await fs.promises.copyFile(dbPath, outputPath);

  const stats = await fs.promises.stat(outputPath);

  onProgress?.({
    bytesProcessed: stats.size,
    totalBytes: stats.size,
    percentage: 100,
    stage: 'completed',
    message: 'Export completed',
  });

  return { success: true, outputPath };
}

export async function importSQLite(
  config: DBConnectionConfig,
  inputPath: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string }> {
  const dbPath = config.host;

  if (!dbPath) {
    throw new Error('SQLite database path not specified');
  }

  onProgress?.({
    bytesProcessed: 0,
    stage: 'importing',
    message: 'Restoring SQLite database...',
  });

  const backupPath = `${dbPath}.backup-${Date.now()}`;
  try {
    await fs.promises.copyFile(dbPath, backupPath);
  } catch {
    // Original file might not exist.
  }

  await fs.promises.copyFile(inputPath, dbPath);

  const stats = await fs.promises.stat(inputPath);

  onProgress?.({
    bytesProcessed: stats.size,
    totalBytes: stats.size,
    percentage: 100,
    stage: 'completed',
    message: 'Import completed',
  });

  return { success: true };
}

