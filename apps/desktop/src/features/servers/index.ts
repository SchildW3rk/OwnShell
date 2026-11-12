import { Server } from 'lucide-react';

import type { OwnShellFeature } from '../types';

export const serversFeature: OwnShellFeature = {
  id: 'servers',
  labelKey: 'sidebar.servers',
  fallbackLabel: 'Servers',
  icon: Server,
  countKey: 'sshHosts',
  releaseState: 'enabled',
  entitlementFeature: 'ssh',
  placement: 'primary',
  order: 10,
};
