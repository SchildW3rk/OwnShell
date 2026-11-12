import { FolderGit2 } from 'lucide-react';
import type { OwnShellFeature } from '../types';

export const projectsFeature: OwnShellFeature = {
  id: 'projects',
  labelKey: 'sidebar.projects',
  fallbackLabel: 'Projects',
  icon: FolderGit2,
  countKey: 'projects',
  releaseState: 'enabled',
  placement: 'primary',
  order: 5,
};
