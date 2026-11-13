import type { Client } from 'ssh2';
import type { SSHExecResult } from '@ownshell/core';
import { SSHConnectionError } from '@ownshell/core';
import { logger } from '../logger';
import * as fs from 'fs';

function assertConnected(connected: boolean): void {
  if (!connected) {
    throw new SSHConnectionError('Not connected to SSH server');
  }
}

export async function execCommand(
  client: Client,
  connected: boolean,
  command: string,
  stdin?: string
): Promise<SSHExecResult> {
  assertConnected(connected);

  return new Promise((resolve, reject) => {
    // Commands can carry passwords (PGPASSWORD=…); callers log a redacted form.
    logger.debug('Executing command', { length: command.length });

    client.exec(command, (err, stream) => {
      if (err) {
        logger.error('Failed to execute command', err);
        reject(new SSHConnectionError(err.message));
        return;
      }

      let stdout = '';
      let stderr = '';
      let exitCode = 0;
      if (stdin !== undefined) stream.end(stdin);

      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      stream.on('close', (code: number) => {
        exitCode = code || 0;
        logger.debug('Command executed', { exitCode, stdoutLength: stdout.length });
        resolve({ stdout, stderr, exitCode });
      });

      stream.on('error', (streamErr: Error) => {
        logger.error('Stream error during exec', streamErr);
        reject(new SSHConnectionError(streamErr.message));
      });
    });
  });
}

export async function execToFile(
  client: Client,
  connected: boolean,
  command: string,
  localPath: string,
  onProgress?: (bytesWritten: number) => void,
  stdin?: string
): Promise<{ exitCode: number; stderr: string }> {
  assertConnected(connected);

  return new Promise((resolve, reject) => {
    logger.info('Executing command with file output', { length: command.length, localPath });

    client.exec(command, (err, stream) => {
      if (err) {
        logger.error('Failed to execute command', err);
        reject(new SSHConnectionError(err.message));
        return;
      }

      let stderr = '';
      let exitCode = 0;
      let bytesWritten = 0;

      const writeStream = fs.createWriteStream(localPath);
      if (stdin !== undefined) stream.end(stdin);

      stream.on('data', (chunk: Buffer) => {
        bytesWritten += chunk.length;
        onProgress?.(bytesWritten);
      });

      stream.pipe(writeStream);

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      writeStream.on('error', (writeErr: Error) => {
        logger.error('Write stream error', { localPath, error: writeErr.message });
        stream.destroy();
        reject(new SSHConnectionError(`Failed to write to file: ${writeErr.message}`));
      });

      stream.on('close', (code: number) => {
        exitCode = code || 0;
        writeStream.end();
        logger.info('Command executed with file output', {
          exitCode,
          bytesWritten,
          localPath,
        });
        resolve({ exitCode, stderr });
      });

      stream.on('error', (streamErr: Error) => {
        logger.error('Stream error during exec', streamErr);
        writeStream.destroy();
        reject(new SSHConnectionError(streamErr.message));
      });
    });
  });
}

export async function execFromFile(
  client: Client,
  connected: boolean,
  command: string,
  localPath: string,
  onProgress?: (bytesRead: number) => void,
  stdinPrefix?: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  assertConnected(connected);

  const stats = await fs.promises.stat(localPath);
  const totalSize = stats.size;

  return new Promise((resolve, reject) => {
    logger.info('Executing command with file input', {
      length: command.length,
      localPath,
      totalSize,
    });

    client.exec(command, (err, stream) => {
      if (err) {
        logger.error('Failed to execute command', err);
        reject(new SSHConnectionError(err.message));
        return;
      }

      const MAX_OUTPUT = 50 * 1024;
      let stdout = '';
      let stderr = '';
      let exitCode = 0;
      let bytesRead = 0;

      const readStream = fs.createReadStream(localPath);

      readStream.on('data', (chunk: Buffer | string) => {
        const chunkLength = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        bytesRead += chunkLength;
        onProgress?.(bytesRead);
      });

      if (stdinPrefix !== undefined) stream.write(stdinPrefix);
      readStream.pipe(stream);

      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
        if (stdout.length > MAX_OUTPUT) {
          stdout = stdout.slice(-MAX_OUTPUT);
        }
      });

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > MAX_OUTPUT) {
          stderr = stderr.slice(-MAX_OUTPUT);
        }
      });

      readStream.on('error', (readErr: Error) => {
        logger.error('Read stream error', { localPath, error: readErr.message });
        stream.destroy();
        reject(new SSHConnectionError(`Failed to read file: ${readErr.message}`));
      });

      stream.on('close', (code: number) => {
        exitCode = code || 0;
        logger.info('Command executed with file input', {
          exitCode,
          bytesRead,
          totalSize,
          localPath,
        });
        resolve({ exitCode, stdout, stderr });
      });

      stream.on('error', (streamErr: Error) => {
        logger.error('Stream error during exec', streamErr);
        readStream.destroy();
        reject(new SSHConnectionError(streamErr.message));
      });
    });
  });
}
