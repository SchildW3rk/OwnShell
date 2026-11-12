import { Database } from 'lucide-react';

import type { OwnShellFeature } from '../types';

export const databasesFeature: OwnShellFeature = {
  id: 'databases',
  labelKey: 'sidebar.databases',
  fallbackLabel: 'Databases',
  icon: Database,
  countKey: 'databases',
  releaseState: 'enabled',
  placement: 'primary',
  order: 20,
};
