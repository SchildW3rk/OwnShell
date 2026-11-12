/** IPC for the collection runner (see http/collection-runner); cancel via 'api:requests:cancel' with the run id. */

import type { Database } from '@ownshell/core';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { collectRunRequests, runRequests, type RunSummary } from '../../http/collection-runner';
import { logger } from '../../logger';
import { safeHandle } from '../safe-ipc';
import { handleExecuteRequest, type ExecutionContext } from './execute';
import { idSchema } from './schemas';

const runSchema = z.object({
  runId: z.string().min(1).max(64),
  collectionId: idSchema,
  stopOnFailure: z.boolean(),
});

export function registerApiRunnerHandlers(db: Kysely<Database>, context: ExecutionContext): void {
  safeHandle('api:runner:run', runSchema, async (event, { runId, collectionId, stopOnFailure }): Promise<RunSummary> => {
    const key = `${event.sender.id}:${runId}`;
    const controller = new AbortController();
    context.running.set(key, controller);
    try {
      const requests = await collectRunRequests(db, collectionId);
      const summary = await runRequests(requests, {
        stopOnFailure,
        signal: controller.signal,
        send: (config, runtimeVariables) =>
          handleExecuteRequest(db, context.pickedFiles, context.tokens, config, controller.signal, { runtimeVariables }),
        onResult: (result) => {
          if (!event.sender.isDestroyed()) event.sender.send('api:runner:progress', { runId, result });
        },
      });
      logger.info('API collection run finished', {
        requests: summary.results.length,
        failed: summary.results.filter((result) => !result.passed).length,
        cancelled: summary.cancelled,
        totalMs: summary.totalMs,
      });
      return summary;
    } finally {
      if (context.running.get(key) === controller) context.running.delete(key);
    }
  });
}
