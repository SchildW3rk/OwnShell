import { Cloud } from 'lucide-react';

import type { OwnShellFeature } from '../types';

export const storageFeature: OwnShellFeature = {
  id: 'storage',
  labelKey: 'sidebar.storage',
  fallbackLabel: 'Storage',
  icon: Cloud,
  countKey: 'storage',
  releaseState: 'enabled',
  entitlementFeature: 's3',
  placement: 'primary',
  order: 40,
};
