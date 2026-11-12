export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Hard cap for API client response bodies; the whole body is held in memory and sent over IPC. */
export const MAX_RESPONSE_BODY_BYTES = 50 * 1024 * 1024;

export function responseTooLargeError(): Error {
  return new Error(`Response body exceeds the ${MAX_RESPONSE_BODY_BYTES / 1024 / 1024} MB limit`);
}

/** Reads a fetch body as UTF-8, aborting once it exceeds the cap. */
export async function readResponseText(
  response: Response,
  maxBytes = MAX_RESPONSE_BODY_BYTES
): Promise<{ text: string; size: number }> {
  if (!response.body) return { text: '', size: 0 };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw responseTooLargeError();
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), size };
}
