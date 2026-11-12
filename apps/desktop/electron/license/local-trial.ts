import { safeStorage } from 'electron';
import { SETTINGS_KEYS, type SettingsQueries } from '@ownshell/core';
import { KNOWN_ENTITLEMENT_FEATURES, type LicenseInfo } from './types';

const DAY_MS = 86_400_000;
const TRIAL_DURATION_MS = 14 * DAY_MS;
type TrialSettings = Pick<SettingsQueries, 'get' | 'set'>;

/** Local evaluation only. Paid entitlements still require the license API signature. */
export class LocalTrial {
  private starting: Promise<LicenseInfo> | null = null;
  private cachedRecord: string | null = null;
  private cachedStartedAt = 0;

  constructor(
    private readonly settings: TrialSettings,
    private readonly deviceId: string,
    private readonly now: () => number = Date.now
  ) {}

  private async expired(): Promise<LicenseInfo> {
    await this.settings.set({ key: SETTINGS_KEYS.LICENSE_STATUS, value: 'expired', updated_at: this.now() });
    return { status: 'expired', canStartTrial: false, isLocalTrial: true };
  }

  async getStatus(): Promise<LicenseInfo> {
    const record = await this.settings.get(SETTINGS_KEYS.TRIAL_START);
    const status = await this.settings.get(SETTINGS_KEYS.LICENSE_STATUS);
    if (status === 'expired') return { status: 'expired', canStartTrial: false, isLocalTrial: true };
    if (!record) {
      const used = await this.settings.get(SETTINGS_KEYS.LICENSE_EVER_ACTIVATED);
      return used === 'true'
        ? { status: 'expired', canStartTrial: false }
        : { status: 'none', canStartTrial: true };
    }

    let startedAt = this.cachedStartedAt;
    if (record !== this.cachedRecord) {
      try {
        const payload = JSON.parse(safeStorage.decryptString(Buffer.from(record, 'base64')));
        if (payload.version !== 1 || payload.deviceId !== this.deviceId || !Number.isSafeInteger(payload.startedAt)) return this.expired();
        startedAt = payload.startedAt;
        this.cachedStartedAt = startedAt;
        this.cachedRecord = record;
      } catch {
        // Fail closed, but do not permanently consume a trial when the OS keychain is temporarily unavailable.
        return { status: 'expired', canStartTrial: false, isLocalTrial: true };
      }
    }
    const now = this.now();
    const trialExpiresAt = startedAt + TRIAL_DURATION_MS;
    if (startedAt > now || now >= trialExpiresAt) return this.expired();
    return {
      status: 'trial',
      trialDaysLeft: Math.ceil((trialExpiresAt - now) / DAY_MS),
      trialExpiresAt,
      canStartTrial: false,
      isLocalTrial: true,
      licenseType: 'Trial',
      features: [...KNOWN_ENTITLEMENT_FEATURES],
    };
  }

  start(): Promise<LicenseInfo> {
    if (!this.starting) this.starting = this.startOnce().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async startOnce(): Promise<LicenseInfo> {
    const current = await this.getStatus();
    if (current.status !== 'none' || !current.canStartTrial) return current;
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure local storage is unavailable');
    const now = this.now();
    const record = safeStorage.encryptString(JSON.stringify({ version: 1, startedAt: now, deviceId: this.deviceId })).toString('base64');
    // Write the immutable start first: an interrupted later write must never grant a new deadline.
    await this.settings.set({ key: SETTINGS_KEYS.TRIAL_START, value: record, updated_at: now });
    await this.settings.set({ key: SETTINGS_KEYS.LICENSE_EVER_ACTIVATED, value: 'true', updated_at: now });
    await this.settings.set({ key: SETTINGS_KEYS.LICENSE_STATUS, value: 'trial', updated_at: now });
    return this.getStatus();
  }
}
