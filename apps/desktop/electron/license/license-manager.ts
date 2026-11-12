/**
 * License Manager
 *
 * Honor model: no feature is gated. A commercial license is only used to hide the
 * "personal use" reminder and to tell which builds it covers (`updatesUntil`).
 * The license itself still comes from the OwnShell License API as a short-lived,
 * signed, device-bound entitlement that is verified locally with the bundled public key.
 */

import { SETTINGS_KEYS, SettingsQueries, Database } from '@ownshell/core';
import { app } from 'electron';
import { Kysely } from 'kysely';
import { logger } from '../logger';
import { cryptoManager } from '../security/crypto';
import { getMachineId } from '../security/machine-id';
import {
  LicenseApiRejectedError,
  activateLicenseEntitlement,
  deactivateLicenseEntitlement,
  refreshLicenseEntitlement,
  type LicenseApiEntitlementResponse,
} from './license-api-client';
import {
  RefreshGate,
  shouldRefreshEntitlement,
  verifyEntitlementToken,
  type EntitlementPayload,
} from './entitlement';
import type { CommercialLicense, LicenseErrorCode, LicenseInfo } from './types';

export type { LicenseInfo } from './types';

// Injected by vite at build time (see vite.config.mts); undefined in tests.
declare const __OWNSHELL_RELEASED_AT__: string | undefined;
const BUILD_RELEASED_AT =
  typeof __OWNSHELL_RELEASED_AT__ === 'string' ? Date.parse(__OWNSHELL_RELEASED_AT__) : NaN;

function toLicenseErrorCode(error: unknown): LicenseErrorCode {
  if (!(error instanceof LicenseApiRejectedError)) return 'unavailable';
  return /activation limit/i.test(error.message) ? 'activationLimit' : 'rejected';
}

class LicenseManager {
  private settingsQueries: SettingsQueries | null = null;
  private refreshGate = new RefreshGate<void>();
  /** Called after a background refresh changed the stored license (e.g. renewal). */
  onStatusChanged: (() => void) | null = null;

  init(db: Kysely<Database>) {
    this.settingsQueries = new SettingsQueries(db);
    logger.info('License manager initialized');
  }

  private get settings(): SettingsQueries {
    if (!this.settingsQueries) {
      throw new Error('License manager not initialized');
    }
    return this.settingsQueries;
  }

  private maskKey(key: string): string {
    if (key.length <= 12) return key;
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
  }

  private async getDecryptedLicenseKey(): Promise<string | undefined> {
    const encryptedKey = await this.settings.get(SETTINGS_KEYS.LICENSE_KEY_ENCRYPTED);
    if (!encryptedKey) return undefined;

    try {
      return cryptoManager.decryptData(encryptedKey);
    } catch (error) {
      logger.warn('Could not decrypt stored license key', error);
      return undefined;
    }
  }

  private async getTimestampSetting(key: string): Promise<number | undefined> {
    const value = Number(await this.settings.get(key));
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }

  private async getFirstLaunchAt(): Promise<number> {
    const stored = await this.getTimestampSetting(SETTINGS_KEYS.EVALUATION_STARTED_AT);
    if (stored) return stored;
    const now = Date.now();
    await this.settings.set({
      key: SETTINGS_KEYS.EVALUATION_STARTED_AT,
      value: String(now),
      updated_at: now,
    });
    return now;
  }

  private toLicense(payload: EntitlementPayload, maskedKey?: string): CommercialLicense {
    return {
      maskedKey,
      licenseType: payload.licenseType,
      updatesUntil: payload.updatesUntil * 1000,
    };
  }

  private async storeEntitlement(response: LicenseApiEntitlementResponse): Promise<void> {
    await this.settings.set({
      key: SETTINGS_KEYS.LICENSE_ENTITLEMENT_TOKEN,
      value: response.entitlement,
      updated_at: Date.now(),
    });
    if (response.instanceId) {
      await this.settings.set({
        key: SETTINGS_KEYS.LICENSE_INSTANCE_ID,
        value: response.instanceId,
        updated_at: Date.now(),
      });
    }
  }

  private verifyResponseEntitlement(response: LicenseApiEntitlementResponse): EntitlementPayload {
    const verification = verifyEntitlementToken(response.entitlement, getMachineId());
    if (!verification.valid || !verification.payload) {
      throw new Error(verification.reason || 'License service returned an invalid entitlement');
    }
    return verification.payload;
  }

  private async refreshFromServer(licenseKey: string, previous?: EntitlementPayload): Promise<void> {
    const instanceId = await this.settings.get(SETTINGS_KEYS.LICENSE_INSTANCE_ID);
    const response = await refreshLicenseEntitlement({
      licenseKey,
      deviceId: getMachineId(),
      instanceId,
      appVersion: app.getVersion(),
      platform: process.platform,
    });
    const payload = this.verifyResponseEntitlement(response);
    await this.storeEntitlement(response);
    if (
      payload.updatesUntil !== previous?.updatesUntil ||
      payload.licenseType !== previous?.licenseType
    ) {
      this.onStatusChanged?.();
    }
  }

  async activate(
    key: string
  ): Promise<{ success: boolean; error?: LicenseErrorCode; info?: LicenseInfo }> {
    const licenseKey = key.trim();
    if (!licenseKey) {
      return { success: false, error: 'emptyKey' };
    }

    try {
      const request = {
        licenseKey,
        deviceId: getMachineId(),
        appVersion: app.getVersion(),
        platform: process.platform,
      };
      // Re-entering the key on a device that still has its instance (e.g. after a
      // recovery-key reset cleared the stored key) reuses that activation slot.
      const instanceId = await this.settings.get(SETTINGS_KEYS.LICENSE_INSTANCE_ID);
      const response =
        (instanceId &&
          (await refreshLicenseEntitlement({ ...request, instanceId }).catch(() => null))) ||
        (await activateLicenseEntitlement(request));
      this.verifyResponseEntitlement(response);

      await this.settings.set({
        key: SETTINGS_KEYS.LICENSE_KEY_ENCRYPTED,
        value: cryptoManager.encryptData(licenseKey),
        updated_at: Date.now(),
      });
      await this.storeEntitlement(response);

      logger.info('License activated with server-signed entitlement');
      return { success: true, info: await this.getStatus() };
    } catch (error) {
      logger.error('Failed to activate license', error);
      return { success: false, error: toLicenseErrorCode(error) };
    }
  }

  async getStatus(): Promise<LicenseInfo> {
    const now = Date.now();
    const firstLaunchAt = await this.getFirstLaunchAt();
    const personalConfirmedAt = await this.getTimestampSetting(
      SETTINGS_KEYS.PERSONAL_USE_CONFIRMED_AT
    );
    const token = await this.settings.get(SETTINGS_KEYS.LICENSE_ENTITLEMENT_TOKEN);
    const licenseKey = await this.getDecryptedLicenseKey();

    let payload: EntitlementPayload | undefined;
    if (token) {
      const verification = verifyEntitlementToken(token, getMachineId(), now, true);
      if (verification.valid) payload = verification.payload;
      else logger.warn('Stored entitlement token is invalid', { reason: verification.reason });
    }

    if (licenseKey && shouldRefreshEntitlement({ hasLicenseKey: true, payload, now })) {
      // Background only: nothing waits on the license. A failed refresh (offline, key
      // expired at Lemon Squeezy) keeps the last signed license and its updatesUntil.
      this.refreshGate
        .run(() => this.refreshFromServer(licenseKey, payload))
        ?.catch((error) => logger.warn('Could not refresh license entitlement', error));
    }

    return {
      license: payload
        ? this.toLicense(payload, licenseKey ? this.maskKey(licenseKey) : undefined)
        : null,
      firstLaunchAt,
      personalConfirmedAt,
      buildReleasedAt: Number.isFinite(BUILD_RELEASED_AT) ? BUILD_RELEASED_AT : undefined,
    };
  }

  async setPersonalUseConfirmed(confirmed: boolean): Promise<LicenseInfo> {
    if (confirmed) {
      await this.settings.set({
        key: SETTINGS_KEYS.PERSONAL_USE_CONFIRMED_AT,
        value: String(Date.now()),
        updated_at: Date.now(),
      });
    } else {
      await this.settings.delete(SETTINGS_KEYS.PERSONAL_USE_CONFIRMED_AT);
    }
    return this.getStatus();
  }

  async deactivate(): Promise<{
    success: boolean;
    error?: LicenseErrorCode;
    requiresOnline?: boolean;
  }> {
    try {
      const licenseKey = await this.getDecryptedLicenseKey();
      const instanceId = await this.settings.get(SETTINGS_KEYS.LICENSE_INSTANCE_ID);

      if (licenseKey && instanceId) {
        await deactivateLicenseEntitlement({ licenseKey, instanceId });
      } else if (licenseKey) {
        return {
          success: false,
          error: 'instanceMissing',
          requiresOnline: true,
        };
      }

      await this.settings.delete(SETTINGS_KEYS.LICENSE_KEY_ENCRYPTED);
      await this.settings.delete(SETTINGS_KEYS.LICENSE_INSTANCE_ID);
      await this.settings.delete(SETTINGS_KEYS.LICENSE_ENTITLEMENT_TOKEN);

      logger.info('License deactivated');
      return { success: true };
    } catch (error) {
      logger.warn('License deactivation requires online server confirmation', error);
      return {
        success: false,
        error: toLicenseErrorCode(error),
        requiresOnline: true,
      };
    }
  }
}

export const licenseManager = new LicenseManager();
