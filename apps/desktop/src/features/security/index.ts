import { Shield } from 'lucide-react';

import type { OwnShellFeature } from '../types';

export const securityFeature: OwnShellFeature = {
  id: 'security',
  labelKey: 'sidebar.security',
  fallbackLabel: 'Security',
  icon: Shield,
  countKey: 'securityItems',
  releaseState: 'enabled',
  placement: 'primary',
  order: 50,
};
