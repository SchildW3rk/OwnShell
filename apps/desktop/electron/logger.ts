/**
 * Secure Logger for OwnShell
 *
 * ⚠️ CRITICAL SECURITY RULES:
 * - NEVER log passwords, private keys, SSH I/O, terminal content
 * - Only log app lifecycle events, errors, and metadata
 * - Automatically sanitize all logged data
 *
 * Logs are stored in: userData/logs/ownshell.log
 */

import log from 'electron-log';
import path from 'path';
import { app } from 'electron';

/**
 * Configure electron-log
 */
function configureLogger() {
  // File transport
  log.transports.file.resolvePathFn = () =>
    path.join(app.getPath('userData'), 'logs', 'ownshell.log');

  log.transports.file.level = 'info';
  log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';
  log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB

  // Console transport (development only)
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
  log.transports.console.format = '[{level}] {text}';
}

/**
 * Sensitive keys that should NEVER be logged
 */
const SENSITIVE_KEYS = [
  'password',
  'passphrase',
  'private_key',
  'privateKey',
  'private_key_encrypted',
  'password_encrypted',
  'passphrase_encrypted',
  'accessKeyId',
  'access_key_id',
  'secretAccessKey',
  'secret_access_key',
  'authorization',
  'cookie',
  'set-cookie',
  'credential',
  'credentials',
  'pwd', // MongoDB createUser/updateUser
  'recoveryKey',
  'recovery_key',
  'master_key',
  'masterKey',
  'token',
  'secret',
  'authConfig',
  'auth_config',
  'data', // SSH data/output
  'input', // User input
  'output', // Command output
  'content', // File content
  'value', // Generic value field (might contain passwords)
];

const MAX_LOG_STRING_LENGTH = 2048;
const MAX_LOG_DEPTH = 8;

/**
 * Sanitizes free-form strings. This catches secrets that appear in log messages
 * or non-sensitive field names, e.g. "password: test123".
 */
function sanitizeString(value: string): string {
  const redacted = value
    .replace(/(password|passphrase|secret|token|api[_-]?key|access[_-]?key|recovery[_-]?key)\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[REDACTED]')
    .replace(/\b(password|identified\s+by)\s+(['"])[^'"]*\2?/gi, '$1 [REDACTED]')
    .replace(/(authorization:\s*)(bearer|basic)\s+[a-z0-9._~+/=-]+/gi, '$1$2 [REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');

  if (redacted.length > MAX_LOG_STRING_LENGTH) {
    return `${redacted.slice(0, MAX_LOG_STRING_LENGTH)}...[TRUNCATED]`;
  }

  return redacted;
}

/**
 * Sanitizes metadata to remove sensitive information
 */
function sanitizeMeta(meta: any, depth = 0, seen = new WeakSet<object>()): any {
  if (!meta) return meta;

  // Primitive types
  if (typeof meta === 'string') return sanitizeString(meta);
  if (typeof meta !== 'object') return meta;

  if (depth > MAX_LOG_DEPTH) return '[MAX_DEPTH]';

  // Driver errors carry extra fields (e.g. mysql2 `sql` with bound values); keep only the message.
  if (meta instanceof Error) return { name: meta.name, message: sanitizeString(meta.message) };

  if (seen.has(meta)) {
    return '[CIRCULAR]';
  }
  seen.add(meta);

  // Arrays
  if (Array.isArray(meta)) {
    return meta.slice(0, 100).map((item) => sanitizeMeta(item, depth + 1, seen));
  }

  // Objects
  const sanitized: any = {};

  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();

    // Check if key contains sensitive data
    const isSensitive = SENSITIVE_KEYS.some((sensitiveKey) =>
      lowerKey.includes(sensitiveKey.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMeta(value, depth + 1, seen);
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Extracts a readable error message from various error types.
 * Handles Error instances, objects with error/message properties, and primitives.
 */
function extractErrorInfo(error: unknown): { message: string; stack?: string; name?: string } {
  // Standard Error instance
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  // Object with error or message property (common pattern in codebase)
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;

    // Check for nested error message
    if (typeof obj.error === 'string') {
      return { message: obj.error };
    }
    if (typeof obj.message === 'string') {
      return { message: obj.message };
    }

    // Object without known error properties - stringify it
    try {
      const sanitized = sanitizeMeta(obj);
      return { message: JSON.stringify(sanitized) };
    } catch {
      return { message: 'Unknown error (could not stringify)' };
    }
  }

  // Primitive types (string, number, etc.)
  if (error !== undefined && error !== null) {
    return { message: String(error) };
  }

  return { message: 'Unknown error' };
}

/**
 * Safe logger wrapper
 */
/** Driver error messages can quote user data ("Incorrect integer value: 'secret'"), so DB query
 * failures are logged by their codes only. */
export function dbErrorCodes(error: unknown) {
  const e = (error ?? {}) as Record<string, unknown>;
  const pick = (key: string) => (e[key] === undefined || e[key] === null ? undefined : String(e[key]));
  return { name: pick('name'), code: pick('code'), errno: pick('errno'), sqlState: pick('sqlState') };
}

export const logger = {
  /**
   * Info level - normal app events
   */
  info(message: string, meta?: any) {
    const sanitizedMessage = sanitizeString(message);
    const sanitized = sanitizeMeta(meta);
    if (sanitized) {
      log.info(sanitizedMessage, sanitized);
    } else {
      log.info(sanitizedMessage);
    }
  },

  /**
   * Warning level - potential issues
   */
  warn(message: string, meta?: any) {
    const sanitizedMessage = sanitizeString(message);
    const sanitized = sanitizeMeta(meta);
    if (sanitized) {
      log.warn(sanitizedMessage, sanitized);
    } else {
      log.warn(sanitizedMessage);
    }
  },

  /**
   * Error level - errors with stack traces
   *
   * Handles various error formats:
   * - Error instances: extracts message, stack, name
   * - Objects with error/message property: extracts the message
   * - Plain objects: JSON stringifies them
   * - Primitives: converts to string
   */
  error(message: string, error?: Error | unknown, meta?: any) {
    const sanitizedMessage = sanitizeString(message);
    const sanitized = sanitizeMeta(meta);
    const errorInfo = extractErrorInfo(error);

    log.error(sanitizedMessage, {
      error: sanitizeString(errorInfo.message),
      ...(errorInfo.stack && { stack: sanitizeString(errorInfo.stack) }),
      ...(errorInfo.name && { name: errorInfo.name }),
      ...sanitized,
    });
  },

  /**
   * Debug level - development only
   */
  debug(message: string, meta?: any) {
    if (process.env.NODE_ENV === 'development') {
      const sanitizedMessage = sanitizeString(message);
      const sanitized = sanitizeMeta(meta);
      if (sanitized) {
        log.debug(sanitizedMessage, sanitized);
      } else {
        log.debug(sanitizedMessage);
      }
    }
  },

  /**
   * Trace level - for high-frequency events (disabled by default)
   *
   * Use for events that fire very frequently (every keystroke, mouse move, etc.)
   * Enable with LOG_TRACE=true environment variable for debugging
   *
   * ⚠️ Performance: This should NEVER log in production or normal dev usage
   */
  trace(message: string, meta?: any) {
    if (process.env.LOG_TRACE === 'true') {
      const sanitizedMessage = sanitizeString(message);
      const sanitized = sanitizeMeta(meta);
      if (sanitized) {
        log.debug(`[TRACE] ${sanitizedMessage}`, sanitized);
      } else {
        log.debug(`[TRACE] ${sanitizedMessage}`);
      }
    }
  },
};

// Initialize logger on import
configureLogger();

// Log startup
logger.info('OwnShell logger initialized', {
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  node: process.versions.node,
});
