/**
 * Crypto Security Module
 *
 * Manages master password and encryption/decryption of sensitive data
 *
 * ⚠️ CRITICAL SECURITY:
 * - Master key is ONLY stored in memory (never persisted)
 * - Wiped from memory when app is locked
 * - Salt and password hash stored in database
 */

import {
  deriveMasterKey,
  generateSalt,
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
  wipeBuffer,
  generateRecoveryKey,
  hashRecoveryKey,
  verifyRecoveryKey,
  SETTINGS_KEYS,
  SettingsQueries,
  Database,
} from '@ownshell/core';
import { Kysely } from 'kysely';
import { logger } from '../logger';

/**
 * Crypto Manager Class
 * Singleton that manages the master key in memory
 */
class CryptoManager {
  private masterKey: Buffer | null = null;
  private settingsQueries: SettingsQueries | null = null;
  private db: Kysely<Database> | null = null;

  /**
   * Initialize the crypto manager with database queries
   */
  init(db: Kysely<Database>) {
    this.db = db;
    this.settingsQueries = new SettingsQueries(db);
    logger.info('Crypto manager initialized');
  }

  /**
   * Checks if master password has been set up
   */
  async isSetup(): Promise<boolean> {
    if (!this.settingsQueries) throw new Error('Crypto manager not initialized');

    const hash = await this.settingsQueries.get(SETTINGS_KEYS.MASTER_PASSWORD_HASH);
    return !!hash;
  }

  /**
   * Initial setup: Create master password and generate recovery key
   *
   * @param password - The master password
   * @returns The generated recovery key (show to user ONCE!)
   */
  async initialize(password: string): Promise<{ recoveryKey: string }> {
    if (!this.settingsQueries) throw new Error('Crypto manager not initialized');

    logger.info('Initializing master password');

    // Check if already setup
    const alreadySetup = await this.isSetup();
    if (alreadySetup) {
      throw new Error('Master password already initialized');
    }

    // Generate salt and hash password
    const salt = generateSalt();
    const passwordHash = hashPassword(password);

    // Generate recovery key and hash it for storage
    const recoveryKey = generateRecoveryKey();
    const recoveryKeyHash = hashRecoveryKey(recoveryKey);

    // Store in database
    await this.settingsQueries.set({
      key: SETTINGS_KEYS.MASTER_KEY_SALT,
      value: salt,
      updated_at: Date.now(),
    });

    await this.settingsQueries.set({
      key: SETTINGS_KEYS.MASTER_PASSWORD_HASH,
      value: passwordHash,
      updated_at: Date.now(),
    });

    await this.settingsQueries.set({
      key: SETTINGS_KEYS.RECOVERY_KEY_HASH,
      value: recoveryKeyHash,
      updated_at: Date.now(),
    });

    // Derive and store master key in memory
    this.masterKey = deriveMasterKey(password, Buffer.from(salt, 'hex'));

    logger.info('Master password initialized with recovery key');

    return { recoveryKey };
  }

  /**
   * Reset master password using recovery key
   *
   * IMPORTANT: This deletes all encrypted data (passwords, private keys)
   * because we cannot decrypt them without the old master key.
   * Host/connection metadata is preserved.
   *
   * @param recoveryKey - The user's recovery key
   * @param newPassword - The new master password
   * @returns Success status and new recovery key
   */
  async resetWithRecoveryKey(
    recoveryKey: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string; newRecoveryKey?: string }> {
    if (!this.settingsQueries) throw new Error('Crypto manager not initialized');

    logger.info('Attempting password reset with recovery key');

    try {
      // Get stored recovery key hash
      const storedHash = await this.settingsQueries.get(SETTINGS_KEYS.RECOVERY_KEY_HASH);
      if (!storedHash) {
        logger.warn('No recovery key hash found - recovery not available');
        return { success: false, error: 'Recovery key not set up for this account' };
      }

      // Verify recovery key
      if (!verifyRecoveryKey(recoveryKey, storedHash)) {
        logger.warn('Recovery key verification failed');
        return { success: false, error: 'Invalid recovery key' };
      }

      logger.info('Recovery key verified - resetting password');

      // Generate new salt and hash for new password
      const newSalt = generateSalt();
      const newPasswordHash = hashPassword(newPassword);

      // Generate new recovery key
      const newRecoveryKey = generateRecoveryKey();
      const newRecoveryKeyHash = hashRecoveryKey(newRecoveryKey);

      const newMasterKey = deriveMasterKey(newPassword, Buffer.from(newSalt, 'hex'));
      const db = this.db;
      if (!db) throw new Error('Crypto manager not initialized');

      // One transaction: a crash must never leave new credentials next to secrets
      // that are still encrypted with the old (unrecoverable) key.
      await db.transaction().execute(async (trx) => {
        const settings = new SettingsQueries(trx);
        const now = Date.now();
        await settings.set({ key: SETTINGS_KEYS.MASTER_KEY_SALT, value: newSalt, updated_at: now });
        await settings.set({
          key: SETTINGS_KEYS.MASTER_PASSWORD_HASH,
          value: newPasswordHash,
          updated_at: now,
        });
        await settings.set({
          key: SETTINGS_KEYS.RECOVERY_KEY_HASH,
          value: newRecoveryKeyHash,
          updated_at: now,
        });
        // Clear all encrypted data (we can't decrypt it with the new key).
        // This is the "soft" approach - keep metadata, clear secrets.
        await clearEncryptedData(trx, encrypt('', newMasterKey));
      });

      // Store new master key in memory only after the reset is committed
      this.lock();
      this.masterKey = newMasterKey;

      logger.info('Password reset successful - encrypted data cleared');

      return { success: true, newRecoveryKey };
    } catch (error) {
      logger.error('Password reset failed', error);
      return { success: false, error: 'Password reset failed' };
    }
  }

  /**
   * Unlock the app with master password
   */
  async unlock(password: string): Promise<boolean> {
    if (!this.settingsQueries) throw new Error('Crypto manager not initialized');

    logger.info('Attempting to unlock app');

    // Get stored password hash
    const storedHash = await this.settingsQueries.get(SETTINGS_KEYS.MASTER_PASSWORD_HASH);
    if (!storedHash) {
      throw new Error('Master password not initialized');
    }

    // Verify password
    const isValid = verifyPassword(password, storedHash);
    if (!isValid) {
      logger.warn('Unlock failed: Invalid password');
      return false;
    }

    // Get salt and derive master key
    const salt = await this.settingsQueries.get(SETTINGS_KEYS.MASTER_KEY_SALT);
    if (!salt) {
      throw new Error('Salt not found in database');
    }

    this.masterKey = deriveMasterKey(password, Buffer.from(salt, 'hex'));

    logger.info('App unlocked successfully');
    return true;
  }

  /**
   * Lock the app (wipe master key from memory)
   */
  lock(): void {
    if (this.masterKey) {
      wipeBuffer(this.masterKey);
      this.masterKey = null;
    }
    logger.info('App locked - master key wiped from memory');
  }

  /**
   * Check if app is currently unlocked
   */
  isUnlocked(): boolean {
    return this.masterKey !== null;
  }

  /**
   * Encrypt data with master key
   */
  encryptData(plaintext: string): string {
    if (!this.masterKey) {
      throw new Error('App is locked - cannot encrypt data');
    }
    return encrypt(plaintext, this.masterKey);
  }

  /**
   * Decrypt data with master key
   */
  decryptData(encrypted: string): string {
    if (!this.masterKey) {
      throw new Error('App is locked - cannot decrypt data');
    }
    return decrypt(encrypted, this.masterKey);
  }
}

/**
 * Clear every value encrypted with the master key (called during recovery: the old
 * key is gone). Columns that must stay decryptable get `emptySecret`, the empty
 * string encrypted with the new key.
 */
export async function clearEncryptedData(
  db: Kysely<Database>,
  emptySecret: string
): Promise<void> {
  const now = Date.now();

  await db
    .updateTable('hosts')
    .set({ password_encrypted: null, updated_at: now })
    .where('password_encrypted', 'is not', null)
    .execute();

  // Keys become unusable - the user has to re-import them
  await db
    .updateTable('keys')
    .set({ private_key_encrypted: '', passphrase_encrypted: null, updated_at: now })
    .execute();

  await db
    .updateTable('s3_connections')
    .set({ access_key_id_encrypted: '', secret_access_key_encrypted: '', updated_at: now })
    .execute();

  await db
    .updateTable('db_connections')
    .set({ password_encrypted: null, updated_at: now })
    .where('password_encrypted', 'is not', null)
    .execute();

  await db
    .updateTable('vault_credentials')
    .set({ password_encrypted: emptySecret, updated_at: now })
    .execute();

  // Environment variable values live encrypted inside the JSON `variables` column
  const environments = await db
    .selectFrom('vault_environments')
    .select(['id', 'variables'])
    .execute();
  for (const env of environments) {
    let variables: unknown;
    try {
      variables = JSON.parse(env.variables);
    } catch {
      variables = [];
    }
    const cleared = Array.isArray(variables)
      ? variables.map((variable) => ({ ...variable, value_encrypted: emptySecret }))
      : [];
    await db
      .updateTable('vault_environments')
      .set({ variables: JSON.stringify(cleared), updated_at: now })
      .where('id', '=', env.id)
      .execute();
  }

  // The license key cannot be decrypted any more. The signed entitlement and the
  // instance id stay, so the license keeps working until the user re-enters the key.
  await db.deleteFrom('app_settings').where('key', '=', SETTINGS_KEYS.LICENSE_KEY_ENCRYPTED).execute();

  logger.info('Cleared all encrypted data from database');
}

// Export singleton instance
export const cryptoManager = new CryptoManager();
