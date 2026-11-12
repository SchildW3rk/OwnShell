import type { SFTPFileEntry } from '@ownshell/core';

export interface SFTPPaneProps {
  sshSessionId: string | null;
  paneId?: 'left' | 'right';
  compact?: boolean;
  sessionLabel?: string;
  onFileDragStart?: (file: SFTPFileEntry, sourcePath: string) => void;
  onFileDrop?: (file: SFTPFileEntry, sourcePath: string, targetPath: string) => void;
  isDropTarget?: boolean;
  onCopyToOtherPane?: (file: SFTPFileEntry, currentPath: string) => void;
  dualPaneMode?: boolean;
  onPathChange?: (path: string) => void;
}

export interface SFTPContextMenuState {
  x: number;
  y: number;
  file: SFTPFileEntry;
}

export interface SFTPRenameDialogState {
  file: SFTPFileEntry;
  newName: string;
}
