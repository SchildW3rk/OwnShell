/**
 * Development Seeder
 *
 * Auto-seeds the database in development mode to save time during testing.
 *
 * ⚠️ ONLY RUNS IN DEVELOPMENT MODE
 *
 * What it does:
 * 1. Checks if master password is already set
 * 2. If not: Sets default password "dev123"
 * 3. Unlocks the app automatically
 * 4. Creates 1-2 test hosts
 *
 * This saves time during hot-reload in development mode
 */

import { Kysely } from 'kysely';
import { app } from 'electron';
import { Database } from '@ownshell/core';
import { cryptoManager } from '../security/crypto';
import { HostQueries } from '@ownshell/core';
import { logger } from '../logger';
import { v4 as uuidv4 } from 'uuid';

const DEV_MASTER_PASSWORD = 'dev123';

export async function runDevelopmentSeeder(db: Kysely<Database>): Promise<void> {
  // Only run in development
  if (app.isPackaged || process.env.NODE_ENV !== 'development') {
    return;
  }
  // The isolated performance launcher provisions only real loopback fixtures via UI.
  if (process.env.OWNSHELL_BENCHMARK === '1') return;

  logger.info('🌱 Development Seeder: Checking if seeding is needed...');

  try {
    // Check if master password is already set
    const isSetup = await cryptoManager.isSetup();

    if (isSetup) {
      logger.info('✓ Development Seeder: Master password already exists, skipping seed');

      // Try to auto-unlock with dev password
      const unlocked = await cryptoManager.unlock(DEV_MASTER_PASSWORD);
      if (unlocked) {
        logger.info('✓ Development Seeder: Auto-unlocked with dev password');
      } else {
        logger.warn('⚠️ Development Seeder: Could not auto-unlock (password changed?)');
      }

      return;
    }

    logger.info('🌱 Development Seeder: No master password found, starting seed...');

    // 1. Initialize master password
    await cryptoManager.initialize(DEV_MASTER_PASSWORD);
    logger.info('✓ Created master password: "dev123"');

    // 2. Create test hosts
    const hostQueries = new HostQueries(db);

    const testHosts = [
      {
        id: uuidv4(),
        label: '🖥️ Test Server (Ubuntu)',
        hostname: '192.168.1.100',
        port: 22,
        username: 'admin',
        auth_type: 'password' as const,
        password_encrypted: cryptoManager.encryptData('test123'),
        key_id: null,
        jump_host_id: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      {
        id: uuidv4(),
        label: '🐳 Docker Host (Production)',
        hostname: '10.0.0.50',
        port: 2222,
        username: 'root',
        auth_type: 'password' as const,
        password_encrypted: cryptoManager.encryptData('production456'),
        key_id: null,
        jump_host_id: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ];

    for (const host of testHosts) {
      await hostQueries.create(host);
      logger.info(`✓ Created test host: ${host.label} @ ${host.hostname}`);
    }

    logger.info('🎉 Development Seeder: Seeding complete!');
    logger.info('');
    logger.info('📋 Development Credentials:');
    logger.info('   Master Password: dev123');
    logger.info('   Test Host 1: admin@192.168.1.100 (password: test123)');
    logger.info('   Test Host 2: root@10.0.0.50:2222 (password: production456)');
    logger.info('');
    logger.info('✨ App is unlocked and ready to use!');
  } catch (error) {
    logger.error('❌ Development Seeder failed', error);
  }
}
