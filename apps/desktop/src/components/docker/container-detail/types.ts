import type { DockerContainerExtended } from '@ownshell/core';

export interface ContainerDetailViewProps {
  sessionId: string;
  isVisible: boolean;
  hostId?: string;
  isLocal?: boolean;
  container: DockerContainerExtended;
  onClose: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
}

export type TabType = 'usage' | 'logs' | 'console' | 'ports' | 'networks';
