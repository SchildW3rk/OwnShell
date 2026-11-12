/**
 * Save-then-send with cancel. Cancel can be pressed while the save is still running,
 * before the main process knows the execution id; it is remembered and checked
 * before the request is sent.
 */
export function createSendFlow() {
  const cancelled = new Set<string>();
  return {
    cancel(executionId: string): void {
      cancelled.add(executionId);
    },
    /** null when cancelled before the send started. */
    async run<S, R>(
      executionId: string,
      save: () => Promise<S>,
      execute: (saved: S) => Promise<R>
    ): Promise<{ saved: S; result: R } | null> {
      try {
        const saved = await save();
        if (cancelled.has(executionId)) return null;
        return { saved, result: await execute(saved) };
      } finally {
        cancelled.delete(executionId);
      }
    },
  };
}

/** Toast text for a failed send or token request; missing variables also name the scopes that were searched. */
export function sendErrorMessage(
  result: { errorCode?: string; errorDetail?: string; errorScopes?: string[] },
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const scopes = (result.errorScopes ?? []).map((scope) => t(`api.variables.scope.${scope}`)).join(' → ');
  return t(`api.errors.${result.errorCode}`, { detail: result.errorDetail ?? '', scopes });
}
