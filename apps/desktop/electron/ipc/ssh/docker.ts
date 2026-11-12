import { SSHDockerContext } from './docker/context';
import { setupDockerContainerHandlers } from './docker/containers';
import { setupDockerContainerDetailHandlers } from './docker/container-details';
import { setupDockerImageHandlers } from './docker/images';
import { setupDockerNetworkHandlers } from './docker/networks';
import { setupDockerExecHandlers } from './docker/exec';
import { setupDockerLogHandlers } from './docker/logs';
import { setupDockerComposeFileHandlers } from './docker/compose-files';
import { setupDockerComposeProjectHandlers } from './docker/compose-projects';

export function setupSSHDockerHandlers(ctx: SSHDockerContext) {
  setupDockerContainerHandlers(ctx);
  setupDockerContainerDetailHandlers(ctx);
  setupDockerImageHandlers(ctx);
  setupDockerNetworkHandlers(ctx);
  setupDockerExecHandlers(ctx);
  setupDockerLogHandlers(ctx);
  setupDockerComposeFileHandlers(ctx);
  setupDockerComposeProjectHandlers(ctx);
}
