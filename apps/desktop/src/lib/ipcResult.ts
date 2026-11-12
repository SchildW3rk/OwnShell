/**
 * safeHandle returns `{ success: false, error }` instead of rejecting (invalid payload,
 * handler errors). Mutations must surface that as a thrown Error.
 */
export function assertIpcSuccess<T>(result: T, fallbackMessage = 'Operation failed'): T {
  if (result && typeof result === 'object' && (result as { success?: unknown }).success === false) {
    const error = (result as { error?: unknown }).error;
    throw new Error(typeof error === 'string' && error ? error : fallbackMessage);
  }
  return result;
}
