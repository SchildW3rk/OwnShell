/**
 * License Manager
 *
 * The desktop app never decides paid entitlement by itself. It asks the
 * OwnShell License API for a short-lived, signed entitlement token and verifies
 * that token locally with the bundled public key.
 * The native evaluation trial is separate and uses an OS-protected local record.
 */

import { SETTINGS_KEYS, SettingsQueries, Database } from '@ownshell/core';
import { app } from 'electron';
import { Kysely } from 'kysely';
import { logger } from '../logger';
import { cryptoManager } from '../security/crypto';
import { getMachineId } from '../security/machine-id';
import {
  activateLicenseEntitlement,
  deactivateLicenseEntitlement,
  refreshLicenseEntitlement,
  type LicenseApiEntitlementResponse,
} from './license-api-client';
import {
  getEntitlementExpiresAt,
  RefreshGate,
  shouldRefreshEntitlement,
  verifyEntitlementToken,
  type EntitlementPayload,
} from './entitlement';
import {
  evaluateEntitlementFeatures,
  normalizeEntitlementFeatures,
  type EntitlementFeature,
  type FeatureEntitlementDecision,
  type LicenseInfo,
} from './types';
import { LocalTrial } from './local-trial';

export type { LicenseInfo, LicenseStatus } from './types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
// Highest wall-clock time seen, so rolling the system clock back cannot extend an entitlement.
const LICENSE_LAST_SEEN_AT = 'license_last_seen_at';

class LicenseManager {
  private settingsQueries: SettingsQueries | null = null;
  private localTrial: LocalTrial | null = null;
  private refreshGate = new RefreshGate<LicenseInfo | null>();
  private lastSeenAt: number | null = null;
  private persistedLastSeenAt = 0;

  init(db: Kysely<Database>) {
    this.settingsQueries = new SettingsQueries(db);
    this.localTrial = new LocalTrial(this.settingsQueries, getMachineId());
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

  /** max(now, highest time seen before); persisted at most hourly. */
  private async trustedNow(): Promise<number> {
    if (this.lastSeenAt === null) {
      this.persistedLastSeenAt = Number(await this.settings.get(LICENSE_LAST_SEEN_AT)) || 0;
      this.lastSeenAt = this.persistedLastSeenAt;
    }
    this.lastSeenAt = Math.max(this.lastSeenAt, Date.now());
    if (this.lastSeenAt - this.persistedLastSeenAt > ONE_HOUR_MS) {
      await this.persistLastSeen(this.lastSeenAt);
    }
    return this.lastSeenAt;
  }

  private async persistLastSeen(value: number): Promise<void> {
    await this.settings.set({ key: LICENSE_LAST_SEEN_AT, value: String(value), updated_at: Date.now() });
    this.persistedLastSeenAt = value;
  }

  /** A fresh server entitlement carries trusted time; it also clears a bogus future clock. */
  private async syncClockWithServer(payload: EntitlementPayload): Promise<void> {
    this.lastSeenAt = Math.max(Date.now(), payload.iat * 1000);
    await this.persistLastSeen(this.lastSeenAt);
  }

  private async clearEntitlementSettings(): Promise<void> {
    await this.settings.delete(SETTINGS_KEYS.LICENSE_ENTITLEMENT_TOKEN);
    await this.settings.delete(SETTINGS_KEYS.LICENSE_ENTITLEMENT_EXPIRES_AT);
  }

  private async markExpired(): Promise<void> {
    await this.clearEntitlementSettings();
    await this.settings.set({
      key: SETTINGS_KEYS.LICENSE_STATUS,
      value: 'expired',
      updated_at: Date.now(),
    });
  }

  private toLicenseInfo(payload: EntitlementPayload, maskedKey?: string): LicenseInfo {
    const features = normalizeEntitlementFeatures(payload.features);

    if (payload.status === 'trial') {
      const trialDaysLeft = Math.max(
        0,
        Math.ceil((getEntitlementExpiresAt(payload) - Date.now()) / ONE_DAY_MS)
      );
      return {
        status: trialDaysLeft > 0 ? 'trial' : 'expired',
        trialDaysLeft,
        trialExpiresAt: getEntitlementExpiresAt(payload),
        licenseType: payload.licenseType,
        features,
      };
    }

    return {
      status: 'active',
      maskedKey,
      licenseType: payload.licenseType,
      features,
    };
  }

  private async storeEntitlement(
    response: LicenseApiEntitlementResponse,
    payload: EntitlementPayload
  ): Promise<void> {
    await this.settings.set({
      key: SETTINGS_KEYS.LICENSE_ENTITLEMENT_TOKEN,
      value: response.entitlement,
      updated_at: Date.now(),
    });
    await this.settings.set({
      key: SETTINGS_KEYS.LICENSE_ENTITLEMENT_EXPIRES_AT,
      value: String(response.expiresAt),
      updated_at: Date.now(),
    });
    await this.settings.set({
      key: SETTINGS_KEYS.LICENSE_STATUS,
      value: payload.status,
      updated_at: Date.now(),
    });

    if (response.instanceId || payload.instanceId) {
      await this.settings.set({
        key: SETTINGS_KEYS.LICENSE_INSTANCE_ID,
        value: response.instanceId || payload.instanceId || '',
        updated_at: Date.now(),
      });
    }

    if (response.licenseType || payload.licenseType) {
      await this.settings.set({
        key: SETTINGS_KEYS.LICENSE_TYPE,
        value: response.licenseType || payload.licenseType || '',
        updated_at: Date.now(),
      });
    }

    await this.settings.set({
      key: SETTINGS_KEYS.LICENSE_EVER_ACTIVATED,
      value: 'true',
      updated_at: Date.now(),
    });
  }

  private verifyResponseEntitlement(response: LicenseApiEntitlementResponse): EntitlementPayload {
    const deviceId = getMachineId();
    const verification = verifyEntitlementToken(response.entitlement, deviceId);
    if (!verification.valid || !verification.payload) {
      throw new Error(verification.reason || 'License service returned an invalid entitlement');
    }
    return verification.payload;
  }

  private async refreshFromServer(maskedKey?: string): Promise<LicenseInfo | null> {
    const licenseKey = await this.getDecryptedLicenseKey();
    if (!licenseKey) return null;

    const instanceId = await this.settings.get(SETTINGS_KEYS.LICENSE_INSTANCE_ID);
    const response = await refreshLicenseEntitlement({
      licenseKey,
      deviceId: getMachineId(),
      instanceId,
      appVersion: app.getVersion(),
      platform: process.platform,
    });
    const payload = this.verifyResponseEntitlement(response);
    await this.storeEntitlement(response, payload);
    await this.syncClockWithServer(payload);

    return this.toLicenseInfo(payload, response.maskedKey || maskedKey || this.maskKey(licenseKey));
  }

  async activate(key: string): Promise<{ success: boolean; error?: string; info?: LicenseInfo }> {
    const licenseKey = key.trim();
    if (!licenseKey) {
      return { success: false, error: 'Please enter a license key' };
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
      const payload = this.verifyResponseEntitlement(response);

      await this.settings.set({
        key: SETTINGS_KEYS.LICENSE_KEY_ENCRYPTED,
        value: cryptoManager.encryptData(licenseKey),
        updated_at: Date.now(),
      });
      await this.storeEntitlement(response, payload);
      await this.syncClockWithServer(payload);

      await this.settings.delete(SETTINGS_KEYS.TRIAL_START);
      await this.settings.delete(SETTINGS_KEYS.TRIAL_CHECKSUM);
      await this.settings.delete(SETTINGS_KEYS.ACTIVATION_CHECKSUM);

      logger.info('License activated with server-signed entitlement');
      return {
        success: true,
        info: this.toLicenseInfo(payload, response.maskedKey || this.maskKey(licenseKey)),
      };
    } catch (error) {
      logger.error('Failed to activate license', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'License activation failed',
      };
    }
  }

  async startTrial(): Promise<{ success: boolean; info?: LicenseInfo; errorCode?: string }> {
    if (!cryptoManager.isUnlocked()) return { success: false, errorCode: 'license.trialLocked' };
    try {
      const current = await this.getStatus();
      if (current.status === 'active' || current.status === 'trial') return { success: true, info: current };
      if (!current.canStartTrial || !this.localTrial) return { success: false, errorCode: 'license.trialUnavailable' };
      const info = await this.localTrial.start();
      return info.status === 'trial'
        ? { success: true, info }
        : { success: false, errorCode: 'license.trialUnavailable' };
    } catch (error) {
      logger.error('Failed to start local trial', error);
      return { success: false, errorCode: 'license.trialStartFailed' };
    }
  }

  async getStatus(): Promise<LicenseInfo> {
    try {
      const status = await this.settings.get(SETTINGS_KEYS.LICENSE_STATUS);
      if (!status || status === 'none') {
        return this.localTrial ? await this.localTrial.getStatus() : { status: 'none', canStartTrial: false };
      }

      const token = await this.settings.get(SETTINGS_KEYS.LICENSE_ENTITLEMENT_TOKEN);
      const decryptedKey = await this.getDecryptedLicenseKey();
      const maskedKey = decryptedKey ? this.maskKey(decryptedKey) : undefined;

      if (status === 'trial' && !token && this.localTrial) return await this.localTrial.getStatus();

      const now = await this.trustedNow();
      let payload: EntitlementPayload | undefined;
      if (token) {
        const verification = verifyEntitlementToken(token, getMachineId(), now);
        if (verification.valid && verification.payload) {
          payload = verification.payload;
        } else {
          logger.warn('Stored entitlement token is invalid', { reason: verification.reason });
        }
      }

      if (
        shouldRefreshEntitlement({
          storedStatus: status,
          hasLicenseKey: Boolean(decryptedKey),
          payload,
          now,
        })
      ) {
        // Shared across concurrent gated IPC calls; null while backing off after a failure.
        const refresh = this.refreshGate.run(() => this.refreshFromServer(maskedKey));
        if (refresh) {
          try {
            const refreshed = await refresh;
            if (refreshed) return refreshed;
          } catch (error) {
            logger.warn('Could not refresh license entitlement', error);
          }
        }
      }

      if (payload) return this.toLicenseInfo(payload, maskedKey);

      if (status !== 'expired' || token) await this.markExpired();
      return { status: 'expired', maskedKey };
    } catch (error) {
      logger.error('Failed to get license status', error);
      return { status: 'none' };
    }
  }

  async deactivate(): Promise<{ success: boolean; error?: string; requiresOnline?: boolean }> {
    try {
      const licenseKey = await this.getDecryptedLicenseKey();
      const instanceId = await this.settings.get(SETTINGS_KEYS.LICENSE_INSTANCE_ID);

      if (licenseKey && instanceId) {
        await deactivateLicenseEntitlement({ licenseKey, instanceId });
      } else if (licenseKey) {
        return {
          success: false,
          error: 'License instance id is missing. Please contact support.',
          requiresOnline: true,
        };
      }

      await this.settings.delete(SETTINGS_KEYS.LICENSE_KEY_ENCRYPTED);
      await this.settings.delete(SETTINGS_KEYS.LICENSE_INSTANCE_ID);
      await this.settings.delete(SETTINGS_KEYS.LICENSE_TYPE);
      await this.markExpired();

      logger.info('License deactivated');
      return { success: true };
    } catch (error) {
      logger.warn('License deactivation requires online server confirmation', error);
      return {
        success: false,
        error:
          'Lizenzschutz-System: Zum Deaktivieren der Lizenz ist eine aktive Internetverbindung erforderlich.',
        requiresOnline: true,
      };
    }
  }

  async isValid(): Promise<boolean> {
    const info = await this.getStatus();
    return info.status === 'active' || (info.status === 'trial' && (info.trialDaysLeft ?? 0) > 0);
  }

  async hasFeature(feature: EntitlementFeature): Promise<boolean> {
    return (await this.getFeatureDecision([feature])).allowed;
  }

  async hasAnyFeature(features: readonly EntitlementFeature[]): Promise<boolean> {
    return (await this.getFeatureDecision(features)).allowed;
  }

  async getFeatureDecision(
    features: readonly EntitlementFeature[]
  ): Promise<FeatureEntitlementDecision> {
    const info = await this.getStatus();
    return evaluateEntitlementFeatures(info, features);
  }
}

export const licenseManager = new LicenseManager();
