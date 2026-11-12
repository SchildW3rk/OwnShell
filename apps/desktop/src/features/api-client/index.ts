import { Globe } from 'lucide-react';

import type { OwnShellFeature } from '../types';

export const apiClientFeature: OwnShellFeature = {
  id: 'api',
  labelKey: 'sidebar.apiClient',
  fallbackLabel: 'API Client',
  icon: Globe,
  releaseState: 'enabled',
  placement: 'primary',
  order: 60,
};
