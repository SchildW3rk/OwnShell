import React from 'react';

import { ContainerNetworkManager } from '../ContainerNetworkManager';

interface NetworksTabProps {
  sessionId: string;
  containerId: string;
}

export const NetworksTab: React.FC<NetworksTabProps> = ({ sessionId, containerId }) => (
  <div className="p-4 overflow-auto h-full">
    <ContainerNetworkManager sessionId={sessionId} containerId={containerId} />
  </div>
);
