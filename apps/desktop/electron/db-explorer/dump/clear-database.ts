import { execSync } from 'child_process';
import type { DBConnectionConfig } from '@ownshell/core';
import { getSSHAdapter } from '../../ipc/ssh';
import { logger } from '../../logger';
import { buildClearCommand } from './clear-command-builder';
import { buildEnvVars, redactCommand } from './command-builders';
import { checkLocalTools } from './tool-checker';

export async function clearDatabase(
  config: DBConnectionConfig,
  sshSessionId: string | undefined,
  port: number,
  mode: 'truncate' | 'drop'
): Promise<void> {
  const { type, database, username, password, executionMode, dockerContainer } = config;

  logger.info('Clearing database', { type, database, mode });

  const clearCommand = buildClearCommand({
    type,
    database,
    username,
    password,
    executionMode,
    dockerContainer,
    port,
    mode,
  });

  if (!clearCommand) {
    logger.info('Clear not supported for database type', { type });
    return;
  }

  if (config.connectionMode !== 'ssh') {
    const toolCheck = await checkLocalTools(type, executionMode);
    if (!toolCheck.available) {
      throw new Error(`Required tools not found. Please install: ${toolCheck.installHint}`);
    }
  }

  logger.debug('Clear command', { clearCommand: redactCommand(clearCommand) });

  if (config.connectionMode === 'ssh' && sshSessionId) {
    await clearViaSSH(sshSessionId, clearCommand);
  } else {
    clearLocally(clearCommand, config);
  }

  logger.info('Database cleared successfully', { mode });
}

async function clearViaSSH(sshSessionId: string, clearCommand: string): Promise<void> {
  const sshClient = getSSHAdapter(sshSessionId);
  if (!sshClient) {
    throw new Error('SSH session not found for clearing database');
  }

  const result = await sshClient.exec(clearCommand);
  if (result.exitCode !== 0) {
    const errorLines = extractClearError(result.stderr || '');
    if (errorLines) {
      throw new Error(`Failed to clear database: ${errorLines}`);
    }
    logger.debug('Clear command had warnings but completed', { stderr: result.stderr });
  }
}

function clearLocally(clearCommand: string, config: DBConnectionConfig): void {
  try {
    execSync(clearCommand, { stdio: 'pipe', env: buildEnvVars(config) });
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || error.message || 'Unknown error';
    const errorLines = extractClearError(stderr);

    if (errorLines) {
      throw new Error(`Failed to clear database: ${errorLines}`);
    }
  }
}

function extractClearError(stderr: string): string {
  return stderr
    .split('\n')
    .filter(
      (line: string) =>
        !line.startsWith('NOTICE:') &&
        !line.startsWith('HINT:') &&
        !line.startsWith('HINWEIS:') &&
        !line.startsWith('DETAIL:') &&
        !line.startsWith('CONTEXT:') &&
        !line.startsWith('KONTEXT:') &&
        line.trim() !== ''
    )
    .join('\n')
    .trim();
}
