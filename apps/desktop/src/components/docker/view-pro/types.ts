export interface DockerViewProProps {
  sessionId: string;
  isVisible: boolean;
}

export type MainTab = 'containers' | 'images' | 'networks' | 'projects';
export type ContainerFilter = 'all' | 'running' | 'stopped' | 'paused';
