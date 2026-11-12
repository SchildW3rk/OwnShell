export type LicenseStatus = 'active' | 'trial' | 'expired' | 'none';

export const KNOWN_ENTITLEMENT_FEATURES = [
  'ssh',
  'sftp',
  's3',
  'database',
  'docker',
  'tunnel',
  'snippets',
] as const;

export type EntitlementFeature = (typeof KNOWN_ENTITLEMENT_FEATURES)[number];

export interface LicenseInfo {
  status: LicenseStatus;
  trialDaysLeft?: number;
  trialExpiresAt?: number;
  canStartTrial?: boolean;
  isLocalTrial?: boolean;
  maskedKey?: string;
  licenseType?: string;
  features?: string[];
}

export type FeatureEntitlementDecisionReason =
  | 'feature-not-required'
  | 'feature-granted'
  | 'feature-not-granted'
  | 'license-inactive'
  | 'verification-failed';

export interface FeatureEntitlementCheck {
  feature: EntitlementFeature;
  allowed: boolean;
}

export interface FeatureEntitlementDecision {
  allowed: boolean;
  status: LicenseStatus;
  licenseValid: boolean;
  requiredFeatures: EntitlementFeature[];
  grantedFeatures: EntitlementFeature[];
  missingFeatures: EntitlementFeature[];
  checks: FeatureEntitlementCheck[];
  reason: FeatureEntitlementDecisionReason;
}

export function normalizeEntitlementFeatures(features: readonly string[] | undefined): string[] {
  if (!features?.length) return [];
  return Array.from(
    new Set(
      features
        .map((feature) => feature.trim())
        .filter((feature) => feature.length > 0)
    )
  ).sort();
}

export function isLicenseInfoUsable(info: LicenseInfo): boolean {
  return (
    info.status === 'active' || (info.status === 'trial' && (info.trialDaysLeft ?? 0) > 0)
  );
}

export function evaluateEntitlementFeatures(
  info: LicenseInfo,
  features: readonly EntitlementFeature[]
): FeatureEntitlementDecision {
  const requiredFeatures = Array.from(new Set(features));
  const licenseValid = isLicenseInfoUsable(info);
  const featureSet = new Set(normalizeEntitlementFeatures(info.features));
  const checks = requiredFeatures.map((feature) => ({
    feature,
    allowed: licenseValid && featureSet.has(feature),
  }));
  const grantedFeatures = checks.filter((check) => check.allowed).map((check) => check.feature);
  const missingFeatures = checks.filter((check) => !check.allowed).map((check) => check.feature);

  if (requiredFeatures.length === 0) {
    return {
      allowed: true,
      status: info.status,
      licenseValid,
      requiredFeatures,
      grantedFeatures,
      missingFeatures,
      checks,
      reason: 'feature-not-required',
    };
  }

  if (!licenseValid) {
    return {
      allowed: false,
      status: info.status,
      licenseValid,
      requiredFeatures,
      grantedFeatures,
      missingFeatures,
      checks,
      reason: 'license-inactive',
    };
  }

  return {
    allowed: grantedFeatures.length > 0,
    status: info.status,
    licenseValid,
    requiredFeatures,
    grantedFeatures,
    missingFeatures,
    checks,
    reason: grantedFeatures.length > 0 ? 'feature-granted' : 'feature-not-granted',
  };
}

export function licenseInfoAllowsFeature(
  info: LicenseInfo,
  feature: EntitlementFeature
): boolean {
  return evaluateEntitlementFeatures(info, [feature]).allowed;
}

export function licenseInfoAllowsAnyFeature(
  info: LicenseInfo,
  features: readonly EntitlementFeature[]
): boolean {
  return evaluateEntitlementFeatures(info, features).allowed;
}
