import type {
  ProjectDiscoveryCandidate,
  ProjectDiscoveryResult,
} from '@ownshell/core';
import { logger } from '../../logger';
import { shellQuote, shellQuotePath } from '../../utils/shell-quote';
import { parseDockerComposeLabelOutput } from '../../projects/compose-discovery';
import { safeHandle } from '../safe-ipc';
import { hostIdSchema } from '../schemas/ssh';
import type { SSHIPCContext } from './context';

const MAX_INSPECTED_CONTAINERS = 501;
const GIT_PROBE_CONCURRENCY = 4;
const COMPOSE_LABEL_FORMAT = [
  '{{json (index .Config.Labels "com.docker.compose.project")}}',
  '{{json (index .Config.Labels "com.docker.compose.service")}}',
  '{{json (index .Config.Labels "com.docker.compose.project.working_dir")}}',
  '{{json (index .Config.Labels "com.docker.compose.project.config_files")}}',
].join('\t');

const COMPOSE_DISCOVERY_COMMAND = [
  'ids=$(docker ps -aq --filter label=com.docker.compose.project)',
  'docker_status=$?',
  'if [ "$docker_status" -ne 0 ]; then exit "$docker_status"; fi',
  `ids=$(printf '%s\\n' "$ids" | sed -n '1,${MAX_INSPECTED_CONTAINERS}p')`,
  `if [ -n "$ids" ]; then docker inspect --format ${shellQuote(COMPOSE_LABEL_FORMAT)} $ids; fi`,
].join('; ');

function commandError(stderr: string, fallback: string): string {
  return stderr.trim() || fallback;
}

async function resolveRepositoryPaths(
  ctx: SSHIPCContext,
  session: NonNullable<ReturnType<SSHIPCContext['activeSessions']['get']>>,
  candidates: ProjectDiscoveryCandidate[]
): Promise<ProjectDiscoveryCandidate[]> {
  const resolved = candidates.map((candidate) => ({ ...candidate }));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < resolved.length) {
      const index = nextIndex;
      nextIndex += 1;
      const candidate = resolved[index];
      const result = await ctx.execCommand(
        session,
        `git -C ${shellQuotePath(candidate.workingDirectory)} rev-parse --show-toplevel`
      );
      const repositoryPath = result.stdout.trim();
      if (
        result.exitCode === 0 &&
        repositoryPath.length > 0 &&
        repositoryPath.length <= 4096 &&
        !repositoryPath.includes('\n') &&
        !repositoryPath.includes('\r')
      ) {
        candidate.repositoryPath = repositoryPath;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(GIT_PROBE_CONCURRENCY, resolved.length) },
      () => worker()
    )
  );
  return resolved;
}

export function setupSSHProjectDiscoveryHandlers(ctx: SSHIPCContext): void {
  safeHandle(
    'ssh:docker:discover-projects',
    hostIdSchema,
    async (_event, { hostId }): Promise<ProjectDiscoveryResult> => {
      try {
        const sessionId = await ctx.getOrCreateBackgroundSession(hostId);
        const session = ctx.activeSessions.get(sessionId);
        if (!session) {
          return { success: false, error: 'SSH session is not available' };
        }

        const result = await ctx.execCommand(session, COMPOSE_DISCOVERY_COMMAND);
        if (result.exitCode !== 0) {
          return {
            success: false,
            error: commandError(result.stderr, 'Could not inspect Docker Compose projects'),
          };
        }

        const discovery = parseDockerComposeLabelOutput(result.stdout);
        const candidates = await resolveRepositoryPaths(ctx, session, discovery.candidates);
        return { success: true, candidates, truncated: discovery.truncated };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not discover Docker Compose projects';
        logger.error('Failed to discover project candidates', error, { hostId });
        return { success: false, error: message };
      }
    }
  );
}
