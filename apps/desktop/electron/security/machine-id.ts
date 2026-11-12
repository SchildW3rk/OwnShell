/**
 * Machine ID Module
 *
 * Gets a stable, hashed hardware identifier that binds a signed license entitlement to this device.
 * We hash the UUID for privacy - no raw hardware IDs stored in DB.
 *
 * Platform support:
 * - macOS: IOPlatformUUID (stable across OS reinstalls)
 * - Windows: WMIC product UUID
 * - Linux: /etc/machine-id or /var/lib/dbus/machine-id
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { logger } from '../logger';

// Cache the machine ID to avoid repeated system calls
let cachedMachineId: string | null = null;

/**
 * Get the raw hardware UUID based on platform
 */
function getRawMachineId(): string {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // macOS: Get IOPlatformUUID from ioreg
      const output = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', {
        encoding: 'utf8',
        timeout: 5000,
      });
      // Output format: "IOPlatformUUID" = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
      const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match && match[1]) {
        return match[1];
      }
      throw new Error('Could not parse IOPlatformUUID from ioreg output');
    }

    if (platform === 'win32') {
      // Windows: Get UUID from WMIC
      const output = execSync('wmic csproduct get UUID', {
        encoding: 'utf8',
        timeout: 5000,
      });
      // Output format:
      // UUID
      // XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
      const lines = output.trim().split('\n');
      if (lines.length >= 2) {
        const uuid = lines[1].trim();
        if (uuid && uuid !== 'UUID') {
          return uuid;
        }
      }
      throw new Error('Could not parse UUID from wmic output');
    }

    if (platform === 'linux') {
      // Linux: Read machine-id file
      const paths = ['/etc/machine-id', '/var/lib/dbus/machine-id'];

      for (const path of paths) {
        if (existsSync(path)) {
          const id = readFileSync(path, 'utf8').trim();
          if (id) {
            return id;
          }
        }
      }
      throw new Error('Could not find machine-id file');
    }

    // Unsupported platform - generate a fallback based on hostname + user
    logger.warn(`Unsupported platform ${platform}, using fallback machine ID`);
    const hostname = execSync('hostname', { encoding: 'utf8' }).trim();
    const user = process.env.USER || process.env.USERNAME || 'unknown';
    return `fallback-${hostname}-${user}`;
  } catch (error) {
    logger.error('Failed to get raw machine ID', error);
    // Return a fallback that's still somewhat unique
    return `error-fallback-${Date.now()}-${Math.random().toString(36)}`;
  }
}

/**
 * Get a hashed, stable machine identifier
 *
 * The hash ensures:
 * 1. Privacy - raw hardware UUID never stored
 * 2. Consistency - same machine always produces same hash
 * 3. Security - hard to forge or predict
 *
 * @returns SHA-256 hash of the machine's hardware UUID (64 hex chars)
 */
export function getMachineId(): string {
  // Return cached value if available
  if (cachedMachineId) {
    return cachedMachineId;
  }

  try {
    const rawId = getRawMachineId();

    // Add app-specific salt to prevent cross-app correlation
    const saltedId = `ownshell-machine-v1:${rawId}`;

    // Hash with SHA-256 for privacy
    cachedMachineId = createHash('sha256').update(saltedId).digest('hex');

    logger.debug('Machine ID generated successfully');
    return cachedMachineId;
  } catch (error) {
    logger.error('Failed to generate machine ID', error);
    throw new Error('Could not generate stable machine identifier');
  }
}

/**
 * Clear the cached machine ID (useful for testing)
 */
export function clearMachineIdCache(): void {
  cachedMachineId = null;
}
