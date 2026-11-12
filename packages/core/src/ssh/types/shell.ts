/**
 * SSH Shell Interface
 * Represents an interactive shell session
 */
export interface ISSHShell {
  /**
   * Registers a callback for incoming data from the shell
   */
  onData(callback: (data: Buffer) => void): void;

  /**
   * Registers a callback for when the shell closes
   */
  onClose(callback: () => void): void;

  /**
   * Registers a callback for errors
   */
  onError(callback: (error: Error) => void): void;

  /**
   * Get the exit code of the shell (if available)
   */
  getExitCode?(): number | null;

  /**
   * Get the exit signal of the shell (if available)
   */
  getExitSignal?(): string | null;

  /**
   * Writes data to the shell (user input)
   */
  write(data: string | Buffer): void;

  /**
   * Resizes the terminal
   */
  resize(cols: number, rows: number): void;

  /**
   * Closes the shell
   */
  close(): void;
}

/**
 * Shell creation options
 */
export interface ShellOptions {
  /**
   * Terminal type (default: 'xterm-256color')
   */
  term?: string;

  /**
   * Number of columns (default: 80)
   */
  cols?: number;

  /**
   * Number of rows (default: 24)
   */
  rows?: number;

  /**
   * Environment variables
   */
  env?: Record<string, string>;
}
