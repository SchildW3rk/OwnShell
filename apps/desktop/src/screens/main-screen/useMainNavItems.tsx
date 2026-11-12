import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { visibleFeatures } from '../../features/registry';
import type { FeatureCountKey, FeatureCounts } from '../../features/types';
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

      return visibleFeatures.map((feature) => {
        const Icon = feature.icon;

        return {
          id: feature.id,
          icon: <Icon className="w-5 h-5" />,
          label: t(feature.labelKey, feature.fallbackLabel),
          count: countFor(feature.countKey),
          disabled: feature.releaseState === 'disabled',
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
    ]
  );
}
