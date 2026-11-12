import { execFile } from 'node:child_process';

import { buildExecutableEnv, resolveExecutable } from '../utils/executable-resolver';

export interface LocalDockerCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executableFound: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/**
 * Execute the local Docker CLI without a shell. Every caller must supply an
 * explicit argv array; renderer input can therefore never become shell syntax.
 */
export function runLocalDocker(
  args: readonly string[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<LocalDockerCommandResult> {
  const executable = resolveExecutable('docker');
  if (!executable) {
    return Promise.resolve({
      stdout: '',
      stderr: 'Docker executable not found',
      exitCode: 127,
      executableFound: false,
    });
  }

  return new Promise((resolve) => {
    execFile(
      executable,
      [...args],
      {
        encoding: 'utf8',
        env: buildExecutableEnv(),
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: timeoutMs,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const errorCode = (error as (Error & { code?: string | number }) | null)?.code;
        resolve({
          stdout: String(stdout || ''),
          stderr: String(stderr || error?.message || ''),
          exitCode: error ? (typeof errorCode === 'number' ? errorCode : 1) : 0,
          executableFound: true,
        });
      }
    );
  });
}
