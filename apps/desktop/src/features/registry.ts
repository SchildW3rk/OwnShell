import { apiClientFeature } from './api-client';
import { databasesFeature } from './databases';
import { fileTransferFeature } from './file-transfer';
import { securityFeature } from './security';
import { serversFeature } from './servers';
import { storageFeature } from './storage';
import type { OwnShellFeature } from './types';
import { projectsFeature } from './projects';

export const registeredFeatures = [
  projectsFeature,
  serversFeature,
  databasesFeature,
  fileTransferFeature,
  storageFeature,
  securityFeature,
  apiClientFeature,
] satisfies OwnShellFeature[];

export const visibleFeatures = registeredFeatures
  .filter((feature) => feature.releaseState !== 'hidden')
  .sort((a, b) => a.order - b.order);
