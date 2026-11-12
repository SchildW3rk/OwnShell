import type { LucideIcon } from 'lucide-react';
import type { SidebarSectionId } from '../components/sidebar';

export type FeatureReleaseState = 'enabled' | 'disabled' | 'hidden';
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
  placement?: FeaturePlacement;
  order: number;
}

export type FeatureCounts = Partial<Record<FeatureCountKey, number>>;
