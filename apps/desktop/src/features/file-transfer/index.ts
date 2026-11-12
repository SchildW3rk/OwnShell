import { FolderOpen } from 'lucide-react';

import type { OwnShellFeature } from '../types';

export const fileTransferFeature: OwnShellFeature = {
  id: 'filetransfer',
  labelKey: 'sidebar.fileTransfer',
  fallbackLabel: 'File Transfer',
  icon: FolderOpen,
  countKey: 'fileTransfers',
  releaseState: 'enabled',
  entitlementFeature: 'sftp',
  placement: 'primary',
  order: 30,
};
