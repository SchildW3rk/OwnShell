import * as fs from 'fs';
import type { DBConnectionConfig } from '@ownshell/core';
import { getSSHAdapter } from '../../ipc/ssh';
import { logger } from '../../logger';
import { buildDumpCommand, buildRestoreCommand, redactCommand } from './command-builders';
import { formatBytes } from './format';
import type { DumpCommandOptions, ProgressCallback } from './types';

export async function exportViaSSH(
  config: DBConnectionConfig,
  sshSessionId: string,
  port: number,
  outputPath: string,
  options: DumpCommandOptions,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string; outputPath: string }> {
  const sshClient = getSSHAdapter(sshSessionId);
  if (!sshClient) {
    throw new Error('SSH session not found');
  }

  const command = buildDumpCommand(config, port, options);
  logger.debug('Export command', { command: redactCommand(command) });

  onProgress?.({
    bytesProcessed: 0,
    stage: 'exporting',
    message: `Exporting ${config.type} database...`,
  });

  const result = await sshClient.execToFile(command, outputPath, (bytesWritten: number) => {
    onProgress?.({
      bytesProcessed: bytesWritten,
      stage: 'exporting',
      message: `Exported ${formatBytes(bytesWritten)}...`,
    });
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Export failed with exit code ${result.exitCode}`);
  }

  const stats = await fs.promises.stat(outputPath);

  onProgress?.({
    bytesProcessed: stats.size,
    totalBytes: stats.size,
    percentage: 100,
    stage: 'completed',
    message: `Export completed (${formatBytes(stats.size)})`,
  });

  return { success: true, outputPath };
}

export async function importViaSSH(
  config: DBConnectionConfig,
  sshSessionId: string,
  port: number,
  inputPath: string,
  options: { compressed: boolean; totalBytes: number },
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string }> {
  const sshClient = getSSHAdapter(sshSessionId);
  if (!sshClient) {
    throw new Error('SSH session not found');
  }

  const command = buildRestoreCommand(config, port, options.compressed);
  logger.debug('Import command', { command: redactCommand(command) });

  onProgress?.({
    bytesProcessed: 0,
    totalBytes: options.totalBytes,
    percentage: 0,
    stage: 'importing',
    message: `Importing ${config.type} database...`,
  });

  const result = await sshClient.execFromFile(command, inputPath, (bytesRead: number) => {
    const percentage = Math.round((bytesRead / options.totalBytes) * 100);
    onProgress?.({
      bytesProcessed: bytesRead,
      totalBytes: options.totalBytes,
      percentage,
      stage: 'importing',
      message: `Imported ${formatBytes(bytesRead)} / ${formatBytes(options.totalBytes)}...`,
    });
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Import failed with exit code ${result.exitCode}`);
  }

  onProgress?.({
    bytesProcessed: options.totalBytes,
    totalBytes: options.totalBytes,
    percentage: 100,
    stage: 'completed',
    message: 'Import completed',
  });

  return { success: true };
}

