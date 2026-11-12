/**
 * Database Dump Service
 *
 * Orchestrates database export/import operations. Command building, local
 * process execution, SSH streaming, SQLite copying and clear operations live in
 * focused modules under ./dump.
 */

import * as fs from 'fs';
import type { DBConnectionConfig, DBType } from '@ownshell/core';
import { dbConnectionManager } from './connection-manager';
import { findSessionByHostId } from '../ipc/ssh';
import { logger } from '../logger';
import { clearDatabase } from './dump/clear-database';
import { exportLocal, importLocal } from './dump/local-runner';
import { exportSQLite, importSQLite } from './dump/sqlite-runner';
import { exportViaSSH, importViaSSH } from './dump/ssh-runner';
import { checkLocalTools } from './dump/tool-checker';
import type { ExportOptions, ImportOptions, ProgressCallback } from './dump/types';

export type { ExportOptions, ImportOptions, ProgressCallback } from './dump/types';

class DatabaseDumpService {
  /**
   * Export a database to a local file.
   */
  async exportDatabase(
    options: ExportOptions,
    onProgress?: ProgressCallback
  ): Promise<{ success: boolean; error?: string; outputPath: string }> {
    const {
      connectionId,
      config,
      outputPath,
      compress,
      tables,
      schemaOnly,
      dataOnly,
      clean,
      noOwner,
      create,
    } = options;

    try {
      const connectionInfo = dbConnectionManager.getConnectionInfo(connectionId);
      if (!connectionInfo) {
        throw new Error('Connection not found. Please connect to the database first.');
      }

      if (connectionInfo.status !== 'connected') {
        throw new Error('Database is not connected.');
      }

      const { sshSessionId, localPort } = connectionInfo;

      logger.info('Starting database export', {
        connectionId,
        type: config.type,
        database: config.database,
        outputPath,
        compress,
        connectionMode: config.connectionMode,
        sshSessionId: sshSessionId || 'NOT_SET',
        localPort: localPort || 'NOT_SET',
      });

      onProgress?.({
        bytesProcessed: 0,
        stage: 'preparing',
        message: 'Preparing export...',
      });

      if (config.type === 'sqlite') {
        return await exportSQLite(config, outputPath, onProgress);
      }

      const effectiveSshSessionId = this.resolveSSHSessionId(sshSessionId, config);
      const commandOptions = { compress, tables, schemaOnly, dataOnly, clean, noOwner, create };

      if (config.connectionMode === 'ssh' && effectiveSshSessionId) {
        return await exportViaSSH(
          config,
          effectiveSshSessionId,
          config.port || 5432,
          outputPath,
          commandOptions,
          onProgress
        );
      }

      if (config.connectionMode === 'ssh') {
        throw new Error(
          'SSH session not found. Please ensure you have an active SSH connection to the host.'
        );
      }

      return await exportLocal(config, outputPath, commandOptions, onProgress);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database export failed', { connectionId, error: message });

      onProgress?.({
        bytesProcessed: 0,
        stage: 'error',
        message,
      });

      return { success: false, error: message, outputPath };
    }
  }

  /**
   * Import a database from a local file.
   */
  async importDatabase(
    options: ImportOptions,
    onProgress?: ProgressCallback
  ): Promise<{ success: boolean; error?: string }> {
    const { connectionId, config, inputPath, compressed, clearMode } = options;

    try {
      const connectionInfo = dbConnectionManager.getConnectionInfo(connectionId);
      if (!connectionInfo) {
        throw new Error('Connection not found. Please connect to the database first.');
      }

      if (connectionInfo.status !== 'connected') {
        throw new Error('Database is not connected.');
      }

      const { sshSessionId, localPort } = connectionInfo;
      const stats = await fs.promises.stat(inputPath);
      const totalBytes = stats.size;

      logger.info('Starting database import', {
        connectionId,
        type: config.type,
        database: config.database,
        inputPath,
        compressed,
        totalBytes,
        connectionMode: config.connectionMode,
        clearMode: clearMode || 'none',
      });

      onProgress?.({
        bytesProcessed: 0,
        totalBytes,
        percentage: 0,
        stage: 'preparing',
        message: 'Preparing import...',
      });

      if (config.type === 'sqlite') {
        return await importSQLite(config, inputPath, onProgress);
      }

      const effectiveSshSessionId = this.resolveSSHSessionId(sshSessionId, config);
      const port =
        config.connectionMode === 'ssh'
          ? config.port || 5432
          : localPort || config.port || 5432;

      if (clearMode && clearMode !== 'none') {
        onProgress?.({
          bytesProcessed: 0,
          totalBytes,
          percentage: 0,
          stage: 'preparing',
          message: clearMode === 'truncate' ? 'Clearing database data...' : 'Dropping tables...',
        });

        await clearDatabase(config, effectiveSshSessionId, port, clearMode);
      }

      if (config.connectionMode === 'ssh' && effectiveSshSessionId) {
        return await importViaSSH(
          config,
          effectiveSshSessionId,
          port,
          inputPath,
          { compressed, totalBytes },
          onProgress
        );
      }

      if (config.connectionMode === 'ssh') {
        throw new Error(
          'SSH session not found. Please ensure you have an active SSH connection to the host.'
        );
      }

      return await importLocal(config, inputPath, { compressed, totalBytes }, onProgress);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database import failed', { connectionId, error: message });

      onProgress?.({
        bytesProcessed: 0,
        stage: 'error',
        message,
      });

      return { success: false, error: message };
    }
  }

  /**
   * Check if required tools are installed locally.
   */
  async checkLocalTools(
    dbType: DBType,
    executionMode?: 'direct' | 'docker'
  ): Promise<{
    available: boolean;
    dumpTool?: string;
    restoreTool?: string;
    installHint?: string;
  }> {
    return checkLocalTools(dbType, executionMode);
  }

  private resolveSSHSessionId(
    sshSessionId: string | undefined,
    config: DBConnectionConfig
  ): string | undefined {
    if (sshSessionId) return sshSessionId;
    if (config.connectionMode !== 'ssh' || !config.sshHostId) return undefined;

    const found = findSessionByHostId(config.sshHostId) || undefined;
    logger.info('Looked up SSH session by host ID', {
      sshHostId: config.sshHostId,
      foundSessionId: found || 'NOT_FOUND',
    });
    return found;
  }
}

export const databaseDumpService = new DatabaseDumpService();
