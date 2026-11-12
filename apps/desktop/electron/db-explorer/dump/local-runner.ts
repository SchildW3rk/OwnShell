import * as fs from 'fs';
import { spawn } from 'child_process';
import { createGzip, createGunzip } from 'zlib';
import type { DBConnectionConfig } from '@ownshell/core';
import { logger } from '../../logger';
import { buildEnvVars, buildLocalDumpCommand, buildLocalRestoreCommand } from './command-builders';
import { formatBytes } from './format';
import { SQLFilterTransform } from './sql-filter';
import { checkLocalTools } from './tool-checker';
import type { DumpCommandOptions, ProgressCallback } from './types';

export async function exportLocal(
  config: DBConnectionConfig,
  outputPath: string,
  options: DumpCommandOptions,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string; outputPath: string }> {
  const toolCheck = await checkLocalTools(config.type, config.executionMode);
  if (!toolCheck.available) {
    throw new Error(`Required tools not found. Please install: ${toolCheck.installHint}`);
  }

  const { command, args } = buildLocalDumpCommand(config, options);
  logger.debug('Local export command', { command, args });

  onProgress?.({
    bytesProcessed: 0,
    stage: 'exporting',
    message: `Exporting ${config.type} database locally...`,
  });

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(outputPath);
    let bytesWritten = 0;

    const child = spawn(command, args, {
      env: buildEnvVars(config),
    });

    child.stdout.on('data', (chunk: Buffer) => {
      bytesWritten += chunk.length;
      onProgress?.({
        bytesProcessed: bytesWritten,
        stage: 'exporting',
        message: `Exported ${formatBytes(bytesWritten)}...`,
      });
    });

    if (options.compress) {
      const gzip = createGzip();
      child.stdout.pipe(gzip).pipe(writeStream);
    } else {
      child.stdout.pipe(writeStream);
    }

    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        writeStream.destroy();
        reject(new Error(stderr || `Export failed with exit code ${code}`));
        return;
      }

      try {
        const stats = await fs.promises.stat(outputPath);
        onProgress?.({
          bytesProcessed: stats.size,
          totalBytes: stats.size,
          percentage: 100,
          stage: 'completed',
          message: `Export completed (${formatBytes(stats.size)})`,
        });
        resolve({ success: true, outputPath });
      } catch (err) {
        reject(err);
      }
    });

    child.on('error', (err) => {
      writeStream.destroy();
      reject(new Error(`Failed to start export process: ${err.message}`));
    });
  });
}

export async function importLocal(
  config: DBConnectionConfig,
  inputPath: string,
  options: { compressed: boolean; totalBytes: number },
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string }> {
  const toolCheck = await checkLocalTools(config.type, config.executionMode);
  if (!toolCheck.available) {
    throw new Error(`Required tools not found. Please install: ${toolCheck.installHint}`);
  }

  const { command, args } = buildLocalRestoreCommand(config);
  logger.debug('Local import command', { command, args });

  onProgress?.({
    bytesProcessed: 0,
    totalBytes: options.totalBytes,
    percentage: 0,
    stage: 'importing',
    message: `Importing ${config.type} database locally...`,
  });

  return new Promise((resolve, reject) => {
    let bytesRead = 0;
    const readStream = fs.createReadStream(inputPath);

    readStream.on('data', (chunk: Buffer | string) => {
      const chunkLen = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      bytesRead += chunkLen;
      const percentage = Math.round((bytesRead / options.totalBytes) * 100);
      onProgress?.({
        bytesProcessed: bytesRead,
        totalBytes: options.totalBytes,
        percentage,
        stage: 'importing',
        message: `Imported ${formatBytes(bytesRead)} / ${formatBytes(options.totalBytes)}...`,
      });
    });

    readStream.on('error', (err) => {
      logger.error('Read stream error during import', { error: err.message });
      reject(new Error(`Failed to read import file: ${err.message}`));
    });

    const child = spawn(command, args, {
      env: buildEnvVars(config),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    logger.debug('Import child process spawned', { pid: child.pid });

    const MAX_STDOUT = 50 * 1024;
    let stdout = '';
    child.stdout.on('data', (data: Buffer) => {
      if (stdout.length < MAX_STDOUT) {
        stdout += data.toString();
      }
    });

    const MAX_STDERR = 100 * 1024;
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length < MAX_STDERR) {
        stderr += chunk;
      }
      logger.debug('Import stderr', { chunk: chunk.trim() });
    });

    const sqlFilter = config.type === 'postgres' ? new SQLFilterTransform() : null;

    if (sqlFilter) {
      sqlFilter.on('error', (err) => {
        logger.error('SQL filter error during import', { error: err.message });
        child.kill();
        reject(new Error(`Failed to filter import file: ${err.message}`));
      });
    }

    if (options.compressed) {
      const gunzip = createGunzip();
      gunzip.on('error', (err) => {
        logger.error('Gunzip error during import', { error: err.message });
        child.kill();
        reject(new Error(`Failed to decompress import file: ${err.message}`));
      });

      if (sqlFilter) {
        readStream.pipe(gunzip).pipe(sqlFilter).pipe(child.stdin);
      } else {
        readStream.pipe(gunzip).pipe(child.stdin);
      }
    } else if (sqlFilter) {
      readStream.pipe(sqlFilter).pipe(child.stdin);
    } else {
      readStream.pipe(child.stdin);
    }

    child.stdin.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
        logger.error('Import stdin error', { error: err.message });
      }
    });

    child.on('close', (code, signal) => {
      logger.info('Import process closed', { code, signal, stderrLength: stderr.length });

      if (code !== 0) {
        logger.error('Import failed', { code, signal, stderr: stderr.slice(0, 1000) });
        reject(new Error(stderr || `Import failed with exit code ${code}`));
        return;
      }

      onProgress?.({
        bytesProcessed: options.totalBytes,
        totalBytes: options.totalBytes,
        percentage: 100,
        stage: 'completed',
        message: 'Import completed',
      });

      logger.info('Import completed successfully');
      resolve({ success: true });
    });

    child.on('error', (err) => {
      logger.error('Import child process error', { error: err.message });
      reject(new Error(`Failed to start import process: ${err.message}`));
    });
  });
}

