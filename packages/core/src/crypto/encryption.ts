/**
 * Encryption Utilities
 *
 * Uses AES-256-GCM for encrypting sensitive data (passwords, private keys)
 * Uses PBKDF2 for deriving master key from password
 * Uses bcrypt-style hashing for master password verification
 *
 * ⚠️ SECURITY:
 * - Master key is NEVER stored, only kept in memory
 * - Salt is stored in app_settings table
 * - Master password hash is stored in app_settings table for verification
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, scryptSync } from 'crypto';

/**
 * Encryption/Decryption parameters
 */
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const TAG_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100000;

/**
 * Derives a master key from a password using PBKDF2
 *
 * @param password - User's master password
 * @param salt - Salt (32 bytes)
 * @returns Derived key (32 bytes)
 */
export function deriveMasterKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Generates a random salt for PBKDF2
 *
 * @returns Salt (32 bytes, hex-encoded)
 */
export function generateSalt(): string {
  return randomBytes(SALT_LENGTH).toString('hex');
}

/**
 * Hashes a password for verification (similar to bcrypt)
 * Uses scrypt which is recommended over bcrypt for new applications
 *
 * @param password - Password to hash
 * @returns Hash in format: salt$hash (both hex-encoded)
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verifies a password against a hash
 *
 * @param password - Password to verify
 * @param storedHash - Hash from database (format: salt$hash)
 * @returns True if password matches
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split('$');
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');

  const derivedHash = scryptSync(password, salt, 64);

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(hash, derivedHash);
}

/**
 * Timing-safe equality check
 */
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Encrypts data using AES-256-GCM
 *
 * @param plaintext - Data to encrypt
 * @param masterKey - Master key (32 bytes)
 * @returns Encrypted data in format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string, masterKey: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex-encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypts data using AES-256-GCM
 *
 * @param encrypted - Encrypted data in format: iv:authTag:ciphertext
 * @param masterKey - Master key (32 bytes)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong key or corrupted data)
 */
export function decrypt(encrypted: string, masterKey: Buffer): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  if (authTag.length !== TAG_LENGTH) {
    throw new Error('Invalid encrypted data format');
  }

  // Pin the tag length: GCM otherwise accepts truncated tags.
  const decipher = createDecipheriv(ALGORITHM, masterKey, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Wipes a buffer from memory (security best practice)
 *
 * @param buffer - Buffer to wipe
 */
export function wipeBuffer(buffer: Buffer): void {
  buffer.fill(0);
}

/**
 * Validates that a string is a valid hex-encoded salt
 */
export function isValidSalt(salt: string): boolean {
  return /^[0-9a-f]{64}$/i.test(salt); // 32 bytes = 64 hex chars
}

/**
 * Validates that a string is a valid password hash
 */
export function isValidPasswordHash(hash: string): boolean {
  const parts = hash.split('$');
  if (parts.length !== 2) return false;

  const [salt, hashPart] = parts;
  // Salt: 16 bytes = 32 hex chars
  // Hash: 64 bytes = 128 hex chars
  return /^[0-9a-f]{32}$/i.test(salt) && /^[0-9a-f]{128}$/i.test(hashPart);
}

// ============================================
// RECOVERY KEY FUNCTIONS
// ============================================

/**
 * Character set for recovery keys (uppercase letters + digits, excluding confusing chars)
 * Excluded: 0, O, I, L, 1 to avoid confusion
 */
const RECOVERY_KEY_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a cryptographically secure recovery key
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (24 chars + 5 dashes)
 *
 * This key allows users to reset their master password if forgotten.
 * The key should be shown ONCE during setup and stored securely by the user.
 *
 * @returns Recovery key in format XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */
export function generateRecoveryKey(): string {
  const bytes = randomBytes(24);
  const chars: string[] = [];

  for (let i = 0; i < 24; i++) {
    // Map each byte to a character in our charset
    const index = bytes[i] % RECOVERY_KEY_CHARSET.length;
    chars.push(RECOVERY_KEY_CHARSET[index]);
  }

  // Format as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    groups.push(chars.slice(i * 4, (i + 1) * 4).join(''));
  }

  return groups.join('-');
}

/**
 * Normalize a recovery key (uppercase, remove extra spaces/dashes)
 * Allows flexible input: with or without dashes, any case
 */
export function normalizeRecoveryKey(key: string): string {
  return key
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // Remove all non-alphanumeric
    .slice(0, 24); // Max 24 chars
}

/**
 * Format a recovery key for display (adds dashes)
 */
export function formatRecoveryKey(key: string): string {
  const normalized = normalizeRecoveryKey(key);
  const groups: string[] = [];
  for (let i = 0; i < normalized.length; i += 4) {
    groups.push(normalized.slice(i, i + 4));
  }
  return groups.join('-');
}

/**
 * Hash a recovery key for secure storage
 * Uses scrypt with high cost factor for brute-force resistance
 *
 * @param recoveryKey - The recovery key to hash
 * @returns Hash in format: salt$hash (both hex-encoded)
 */
export function hashRecoveryKey(recoveryKey: string): string {
  const normalized = normalizeRecoveryKey(recoveryKey);
  const salt = randomBytes(16);
  // Use scrypt with higher cost for brute-force resistance
  // Node.js uses: cost (N), blockSize (r), parallelization (p)
  const hash = scryptSync(normalized, salt, 64, { cost: 16384, blockSize: 8, parallelization: 1 });
  return `${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verify a recovery key against its stored hash
 *
 * @param recoveryKey - The recovery key to verify
 * @param storedHash - The stored hash (format: salt$hash)
 * @returns True if the key matches
 */
export function verifyRecoveryKey(recoveryKey: string, storedHash: string): boolean {
  try {
    const normalized = normalizeRecoveryKey(recoveryKey);
    const [saltHex, hashHex] = storedHash.split('$');

    if (!saltHex || !hashHex) {
      return false;
    }

    const salt = Buffer.from(saltHex, 'hex');
    const storedHashBuffer = Buffer.from(hashHex, 'hex');

    // Derive hash with same parameters (must match hashRecoveryKey)
    const derivedHash = scryptSync(normalized, salt, 64, {
      cost: 16384,
      blockSize: 8,
      parallelization: 1,
    });

    // Constant-time comparison
    return timingSafeEqual(storedHashBuffer, derivedHash);
  } catch {
    return false;
  }
}

/**
 * Validate recovery key format
 * @param key - Recovery key to validate
 * @returns True if key has valid format (24 chars from allowed charset)
 */
export function isValidRecoveryKeyFormat(key: string): boolean {
  const normalized = normalizeRecoveryKey(key);
  if (normalized.length !== 24) {
    return false;
  }
  // Check all chars are in our charset
  return [...normalized].every((char) => RECOVERY_KEY_CHARSET.includes(char));
}
