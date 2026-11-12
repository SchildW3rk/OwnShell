import type { IpcRenderer, IpcRendererEvent } from 'electron';
import { LOCAL_DOCKER_TARGET_ID } from '../../src/lib/docker-target';

const isLocalDockerTarget = (sessionId: string): boolean => sessionId === LOCAL_DOCKER_TARGET_ID;
const unsupportedLocalDocker = (feature: string) =>
  Promise.resolve({ success: false, error: `${feature} is only available for SSH Docker hosts` });

export function createDockerApi(ipcRenderer: IpcRenderer) {
  return {
    check: (sessionId: string) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:check')
        : ipcRenderer.invoke('ssh:docker:check', { sessionId }),
    listExtended: (sessionId: string, all?: boolean) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:ps-extended', { all })
        : ipcRenderer.invoke('ssh:docker:ps-extended', { sessionId, all }),
    action: (sessionId: string, containerId: string, action: string) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:action', { containerId, action })
        : ipcRenderer.invoke('ssh:docker:action', { sessionId, containerId, action }),
    composeAction: (sessionId: string, projectName: string, action: 'start' | 'stop' | 'restart') =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:compose-action', { projectName, action })
        : ipcRenderer.invoke('ssh:docker:compose-action', { sessionId, projectName, action }),
    logs: (sessionId: string, containerId: string, tail?: number) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:logs', { containerId, tail })
        : ipcRenderer.invoke('ssh:docker:logs', { sessionId, containerId, tail }),
    stats: (sessionId: string, containerId: string) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:stats', { containerId })
        : ipcRenderer.invoke('ssh:docker:stats', { sessionId, containerId }),
    // Images
    images: (sessionId: string) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:images')
        : ipcRenderer.invoke('ssh:docker:images', { sessionId }),
    imageRemove: (sessionId: string, imageId: string, force?: boolean) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:image-remove', { imageId, force })
        : ipcRenderer.invoke('ssh:docker:image-remove', { sessionId, imageId, force }),
    pruneImages: (sessionId: string, all?: boolean) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:prune-images', { all })
        : ipcRenderer.invoke('ssh:docker:prune-images', { sessionId, all }),
    // Networks
    networks: (sessionId: string) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:networks')
        : ipcRenderer.invoke('ssh:docker:networks', { sessionId }),
    networkCreate: (
      sessionId: string,
      options: {
        name: string;
        driver?: string;
        subnet?: string;
        gateway?: string;
        ipv6?: boolean;
        internal?: boolean;
      }
    ) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:network-create', options)
        : ipcRenderer.invoke('ssh:docker:network-create', { sessionId, ...options }),
    networkRemove: (sessionId: string, networkId: string) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:network-remove', { networkId })
        : ipcRenderer.invoke('ssh:docker:network-remove', { sessionId, networkId }),
    // Docker Exec (Attach Shell)
    execStart: (
      sessionId: string,
      containerId: string,
      options?: { shell?: string; cols?: number; rows?: number }
    ) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Container console')
        : ipcRenderer.invoke('ssh:docker:exec-start', {
            sessionId,
            containerId,
            ...options,
          }),
    // Fire-and-forget for minimal latency - no Promise overhead
    execSend: (execSessionId: string, data: string): void => {
      ipcRenderer.send('ssh:docker:exec-send', { execSessionId, data });
    },
    execResize: (execSessionId: string, cols: number, rows: number): void => {
      ipcRenderer.send('ssh:docker:exec-resize', { execSessionId, cols, rows });
    },
    execClose: (execSessionId: string) =>
      ipcRenderer.invoke('ssh:docker:exec-close', { execSessionId }),
    // Data can be string (legacy) or Uint8Array (optimized binary transfer)
    onExecData: (
      callback: (data: { execSessionId: string; data: string | Uint8Array }) => void
    ) => {
      // SSHStreamHandler sends data via 'ssh:session:data' with sessionId = execSessionId
      const handler = (
        _event: IpcRendererEvent,
        data: { sessionId: string; data: string | Uint8Array }
      ) => callback({ execSessionId: data.sessionId, data: data.data });
      ipcRenderer.on('ssh:session:data', handler);
      return () => ipcRenderer.removeListener('ssh:session:data', handler);
    },
    // Compose
    composeFilePath: (sessionId: string, projectName: string) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose file editing')
        : ipcRenderer.invoke('ssh:docker:compose-file-path', { sessionId, projectName }),
    composeFileRead: (sessionId: string, path: string) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose file editing')
        : ipcRenderer.invoke('ssh:docker:compose-file-read', { sessionId, path }),
    composeFileWrite: (sessionId: string, path: string, content: string) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose file editing')
        : ipcRenderer.invoke('ssh:docker:compose-file-write', { sessionId, path, content }),
    composeUp: (
      sessionId: string,
      path: string,
      options?: { detached?: boolean; build?: boolean }
    ) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose file actions')
        : ipcRenderer.invoke('ssh:docker:compose-up', { sessionId, path, ...options }),
    composeDown: (
      sessionId: string,
      path: string,
      options?: { removeVolumes?: boolean; removeOrphans?: boolean }
    ) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose file actions')
        : ipcRenderer.invoke('ssh:docker:compose-down', { sessionId, path, ...options }),
    // Network interaction
    containerNetworks: (sessionId: string, containerId: string) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:container-networks', { containerId })
        : ipcRenderer.invoke('ssh:docker:container-networks', { sessionId, containerId }),
    containerPorts: (sessionId: string, containerId: string) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('SSH port tunnels')
        : ipcRenderer.invoke('ssh:docker:container-ports', { sessionId, containerId }),
    networkConnect: (sessionId: string, networkName: string, containerId: string) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:network-connect', { networkName, containerId })
        : ipcRenderer.invoke('ssh:docker:network-connect', { sessionId, networkName, containerId }),
    networkDisconnect: (sessionId: string, networkName: string, containerId: string) =>
      isLocalDockerTarget(sessionId)
        ? ipcRenderer.invoke('local:docker:network-disconnect', { networkName, containerId })
        : ipcRenderer.invoke('ssh:docker:network-disconnect', { sessionId, networkName, containerId }),
    // Live log streaming
    logsStreamStart: (sessionId: string, containerId: string, tail?: number) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Live log streaming')
        : ipcRenderer.invoke('ssh:docker:logs-stream-start', { sessionId, containerId, tail }),
    logsStreamStop: (streamId: string) =>
      ipcRenderer.invoke('ssh:docker:logs-stream-stop', { streamId }),
    onLogsStreamData: (callback: (data: { streamId: string; data: string }) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        data: { streamId: string; data: string }
      ) => callback(data);
      ipcRenderer.on('ssh:docker:logs-stream-data', handler);
      return () => ipcRenderer.removeListener('ssh:docker:logs-stream-data', handler);
    },
    onLogsStreamEnd: (callback: (data: { streamId: string }) => void) => {
      const handler = (_event: IpcRendererEvent, data: { streamId: string }) =>
        callback(data);
      ipcRenderer.on('ssh:docker:logs-stream-end', handler);
      return () => ipcRenderer.removeListener('ssh:docker:logs-stream-end', handler);
    },
    // Host memory info
    hostMemory: (sessionId: string) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Host memory details')
        : ipcRenderer.invoke('ssh:docker:host-memory', { sessionId }),
    // Compose Projects (New Implementation)
    composeDiscover: (sessionId: string, basePath?: string) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose project management')
        : ipcRenderer.invoke('ssh:docker:compose-discover', { sessionId, basePath }),
    composeCreate: (
      sessionId: string,
      projectName: string,
      composeContent: string,
      basePath?: string
    ) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose project management')
        : ipcRenderer.invoke('ssh:docker:compose-create', {
            sessionId,
            projectName,
            composeContent,
            basePath,
          }),
    composeUpdate: (sessionId: string, composePath: string, composeContent: string) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose project management')
        : ipcRenderer.invoke('ssh:docker:compose-update', { sessionId, composePath, composeContent }),
    composeCommand: (
      sessionId: string,
      projectPath: string,
      command: 'up' | 'down' | 'restart' | 'pull' | 'build' | 'logs',
      args?: string[]
    ) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose project management')
        : ipcRenderer.invoke('ssh:docker:compose-command', { sessionId, projectPath, command, args }),
    composeRemove: (sessionId: string, projectPath: string, removeVolumes?: boolean) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose project management')
        : ipcRenderer.invoke('ssh:docker:compose-remove', { sessionId, projectPath, removeVolumes }),
    composeRead: (sessionId: string, composePath: string) =>
      isLocalDockerTarget(sessionId)
        ? unsupportedLocalDocker('Compose project management')
        : ipcRenderer.invoke('ssh:docker:compose-read', { sessionId, composePath }),
  };
}
