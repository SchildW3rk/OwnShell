/**
 * Honor-model licensing: every feature works without a license. These helpers only decide
 * which reminder to show. Pure (no electron imports) so the renderer and tests can use them.
 */

const DAY_MS = 86_400_000;
export const EVALUATION_DAYS = 30;

export interface CommercialLicense {
  maskedKey?: string;
  licenseType?: string;
  /** ms timestamp: builds released up to this moment are covered forever. */
  updatesUntil: number;
}

export interface LicenseInfo {
  /** Last server-signed license for this device, kept after expiry so it still covers older builds. */
  license: CommercialLicense | null;
  firstLaunchAt: number;
  personalConfirmedAt?: number;
  /** ms timestamp embedded in production builds; undefined in dev/test builds. */
  buildReleasedAt?: number;
}

/** Error codes returned to the renderer, which maps them to translated messages. */
export type LicenseErrorCode = 'emptyKey' | 'activationLimit' | 'rejected' | 'unavailable' | 'instanceMissing';

export type LicenseBadgeState =
  | null
  | { kind: 'evaluation'; daysLeft: number }
  | { kind: 'personal' }
  | { kind: 'uncovered' };

/** Unknown dates count as covered: the notice must never nag because of missing metadata. */
export function isReleaseCovered(
  releasedAt: number | undefined,
  license: Pick<CommercialLicense, 'updatesUntil'> | null
): boolean {
  if (!license || releasedAt === undefined || !Number.isFinite(releasedAt)) return true;
  return releasedAt <= license.updatesUntil;
}

export function licenseBadgeState(
  now: number,
  firstLaunchAt: number,
  personalConfirmedAt: number | undefined,
  license: Pick<CommercialLicense, 'updatesUntil'> | null,
  buildReleasedAt: number | undefined
): LicenseBadgeState {
  if (personalConfirmedAt) return null;
  if (license) return isReleaseCovered(buildReleasedAt, license) ? null : { kind: 'uncovered' };
  const evaluationEndsAt = firstLaunchAt + EVALUATION_DAYS * DAY_MS;
  if (now < evaluationEndsAt) {
    // Clamped: a clock set back before firstLaunchAt must not show more than the evaluation length.
    const daysLeft = Math.ceil((evaluationEndsAt - now) / DAY_MS);
    return { kind: 'evaluation', daysLeft: Math.min(EVALUATION_DAYS, Math.max(0, daysLeft)) };
  }
  return { kind: 'personal' };
}

export type UpdateLicenseCoverage = 'covered' | 'uncovered' | 'unknown';

/**
 * Coverage of an available update (electron-updater `releaseDate`, ISO string).
 * 'unknown' (license present, release date missing/invalid) must not install silently.
 */
export function updateLicenseCoverage(
  releaseDate: string | undefined,
  license: Pick<CommercialLicense, 'updatesUntil'> | null
): UpdateLicenseCoverage {
  if (!license) return 'covered';
  const releasedAt = releaseDate ? Date.parse(releaseDate) : NaN;
  if (!Number.isFinite(releasedAt)) return 'unknown';
  return releasedAt <= license.updatesUntil ? 'covered' : 'uncovered';
}
