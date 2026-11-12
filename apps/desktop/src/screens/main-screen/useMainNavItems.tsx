import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { visibleFeatures } from '../../features/registry';
import type { EntitlementFeature, FeatureCountKey, FeatureCounts } from '../../features/types';
import { useLicenseStore } from '../../stores/useLicenseStore';
import type { SidebarNavItem } from './types';

interface UseMainNavItemsOptions {
  projectCount: number;
  sshHostCount: number;
  databaseCount: number;
  sftpHostCount: number;
  s3ConnectionCount: number;
}

export function useMainNavItems({
  projectCount,
  sshHostCount,
  databaseCount,
  sftpHostCount,
  s3ConnectionCount,
}: UseMainNavItemsOptions): SidebarNavItem[] {
  const { t } = useTranslation();
  const licenseInfo = useLicenseStore((state) => state.licenseInfo);

  return useMemo(
    () => {
      const counts = {
        projects: projectCount,
        sshHosts: sshHostCount,
        databases: databaseCount,
        fileTransfers: sftpHostCount,
        storage: s3ConnectionCount,
        securityItems: 1,
      } satisfies FeatureCounts;

      const countFor = (countKey?: FeatureCountKey) =>
        countKey ? counts[countKey] : undefined;

      const licenseValid =
        licenseInfo?.status === 'active' ||
        (licenseInfo?.status === 'trial' && (licenseInfo.trialDaysLeft ?? 0) > 0);

      const allowsFeature = (feature?: EntitlementFeature): boolean => {
        if (!feature || !licenseInfo) return true;
        return licenseValid && Boolean(licenseInfo.features?.includes(feature));
      };

      return visibleFeatures.map((feature) => {
        const Icon = feature.icon;

        return {
          id: feature.id,
          icon: <Icon className="w-5 h-5" />,
          label: t(feature.labelKey, feature.fallbackLabel),
          count: countFor(feature.countKey),
          disabled:
            feature.releaseState === 'disabled' || !allowsFeature(feature.entitlementFeature),
        };
      });
    },
    [
      t,
      projectCount,
      sshHostCount,
      databaseCount,
      sftpHostCount,
      s3ConnectionCount,
      licenseInfo,
    ]
  );
}
