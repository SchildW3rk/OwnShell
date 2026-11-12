import { SETTINGS_KEYS, SettingsQueries } from '@ownshell/core';
import { logger } from '../../logger';
import { safeHandle, safeHandleArgs } from '../safe-ipc';
import { noPayloadSchema, settingKeySchema, settingSetArgsSchema } from './schemas';

const RENDERER_SETTING_KEYS = new Set<string>([
  SETTINGS_KEYS.LANGUAGE,
  'lastSeenVersion',
  'dbExplorer.queryHistory.enabled',
]);

function assertRendererSettingKey(key: string): void {
  if (!RENDERER_SETTING_KEYS.has(key)) {
    logger.warn('Blocked renderer access to protected setting', { key });
    throw new Error('Setting key is protected');
  }
}

export function registerSettingsHandlers(settingsQueries: SettingsQueries): void {
  safeHandle('db:settings:get', settingKeySchema, async (_event, key) => {
    try {
      assertRendererSettingKey(key);
      logger.debug('IPC: db:settings:get', { key });
      return await settingsQueries.get(key);
    } catch (error) {
      logger.error('Failed to get setting', error, { key });
      throw error;
    }
  });

  safeHandleArgs('db:settings:set', settingSetArgsSchema, async (_event, [key, value]) => {
    try {
      assertRendererSettingKey(key);
      logger.info('IPC: db:settings:set', { key });
      await settingsQueries.set({
        key,
        value,
        updated_at: Date.now(),
      });
      return { success: true };
    } catch (error) {
      logger.error('Failed to set setting', error, { key });
      throw error;
    }
  });

  safeHandle('db:settings:get-all', noPayloadSchema, async () => {
    try {
      logger.debug('IPC: db:settings:get-all');
      const settings = await settingsQueries.getAll();
      return Object.fromEntries(
        Object.entries(settings).filter(([key]) => RENDERER_SETTING_KEYS.has(key))
      );
    } catch (error) {
      logger.error('Failed to get all settings', error);
      throw error;
    }
  });
}
