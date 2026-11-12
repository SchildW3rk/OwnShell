import type { LucideIcon } from 'lucide-react';
import type { SidebarSectionId } from '../components/sidebar';

export type FeatureReleaseState = 'enabled' | 'disabled' | 'hidden';
export type EntitlementFeature =
  | 'ssh'
  | 'sftp'
  | 's3'
  | 'database'
  | 'docker'
  | 'tunnel'
  | 'snippets';

export type FeatureCountKey =
  | 'projects'
  | 'sshHosts'
  | 'databases'
  | 'fileTransfers'
  | 'storage'
  | 'securityItems';

export type FeaturePlacement = 'primary' | 'secondary';

export interface OwnShellFeature {
  id: SidebarSectionId;
  labelKey: string;
  fallbackLabel: string;
  icon: LucideIcon;
  countKey?: FeatureCountKey;
  releaseState?: FeatureReleaseState;
  entitlementFeature?: EntitlementFeature;
  placement?: FeaturePlacement;
  order: number;
}

export type FeatureCounts = Partial<Record<FeatureCountKey, number>>;
